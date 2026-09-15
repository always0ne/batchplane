import { parseGovernanceYaml } from "@batchplane/github-lite";
import {
  validateBatchDefinitionFile,
  validateRoleMappingFile,
} from "./gate-schema.js";
import type { GateGitHubClient } from "./gate-github-client.js";
import type {
  ApprovalCommand,
  ApproverSelectorSnapshot,
  BatchDefinitionSnapshot,
  ExecutionApprovalEvidence,
  ExecutionRequestEvidence,
  GateEvidence,
  GateIssueComment,
} from "./gate-types.js";

export async function findGitHubApprovalEvidence({
  client,
  issueNumber,
  loadApproval,
  requestId,
}: {
  client: GateGitHubClient;
  issueNumber?: number;
  loadApproval: boolean;
  requestId: string;
}): Promise<GateEvidence> {
  const issue =
    issueNumber === undefined
      ? await client.findExecutionRequestIssue(requestId)
      : await client.getIssue(issueNumber);

  if (!issue) {
    return { approval: null, request: null };
  }

  const request = parseExecutionRequestEvidence(issue.body);

  if (!request) {
    return { approval: null, request: null };
  }

  const approval = loadApproval
    ? ((await client.listIssueComments(issue.number))
        .map(parseExecutionApprovalEvidence)
        .find((evidence) =>
          evidence
            ? evidence.requestId === request.requestId &&
              evidence.batchId === request.batchId &&
              evidence.requestDigest === request.requestDigest
            : false,
        ) ?? null)
    : null;

  return {
    approval,
    issueBody: issue.body,
    issueNumber: issue.number,
    request,
  };
}

export function parseExecutionRequestEvidence(
  issueBody: string,
): ExecutionRequestEvidence | null {
  const marker = parseBatchPlaneMarker(issueBody, "execution-request");
  const requestId =
    marker.get("requestId") ?? readMarkdownField(issueBody, "Request ID");
  const batchId =
    marker.get("batchId") ?? readMarkdownField(issueBody, "Batch ID");
  const requestDigest =
    marker.get("requestDigest") ??
    readMarkdownField(issueBody, "Request digest");
  const status = marker.get("status") ?? readMarkdownField(issueBody, "Status");
  const payload = parseCanonicalPayload(issueBody);
  const approvedBatchRevision = readApprovedBatchRevision(payload);
  const workflow = readWorkflowTarget(payload);
  const requestedBy =
    readMarkdownField(issueBody, "Requested by").replace(/^@/, "") ||
    readRequestedBy(payload);
  const scheduleId = readScheduleId(payload);
  const schedule = readNativeScheduleOccurrence(payload);
  const triggerType = readTriggerType(payload);

  if (
    !requestId ||
    !batchId ||
    !requestDigest ||
    !status ||
    !approvedBatchRevision
  ) {
    return null;
  }

  return {
    approvedBatchRevision,
    batchId,
    ...(scheduleId ? { scheduleId } : {}),
    ...(schedule ? { schedule } : {}),
    requestedBy,
    requestDigest,
    requestId,
    ...(triggerType ? { triggerType } : {}),
    status,
    workflowPath: workflow.path,
    workflowRef: workflow.ref,
  };
}

function readApprovedBatchRevision(payload: unknown): {
  governedChangeId: string;
  targetRevisionDigest: string;
} | null {
  if (!payload || typeof payload !== "object") return null;
  const spec = (payload as { spec?: unknown }).spec;
  if (!spec || typeof spec !== "object") return null;
  const revision = (spec as { approvedBatchRevision?: unknown })
    .approvedBatchRevision;
  if (!revision || typeof revision !== "object") return null;
  const governedChangeId = (revision as { governedChangeId?: unknown })
    .governedChangeId;
  const targetRevisionDigest = (revision as { targetRevisionDigest?: unknown })
    .targetRevisionDigest;

  return typeof governedChangeId === "string" &&
    typeof targetRevisionDigest === "string" &&
    governedChangeId.trim() &&
    targetRevisionDigest.startsWith("sha256:")
    ? { governedChangeId, targetRevisionDigest }
    : null;
}

function parseExecutionApprovalEvidence(
  comment: GateIssueComment,
): ExecutionApprovalEvidence | null {
  const commentBody = comment.body;

  if (!commentBody.startsWith("/bgcp approve ")) {
    return null;
  }

  const command = parseApprovalCommand(commentBody);
  const marker = parseBatchPlaneMarker(commentBody, "execution-approval");
  const decision = marker.get("decision");
  const requestId =
    marker.get("requestId") ?? readMarkdownField(commentBody, "Request ID");
  const batchId =
    marker.get("batchId") ?? readMarkdownField(commentBody, "Batch ID");
  const requestDigest =
    marker.get("requestDigest") ??
    readMarkdownField(commentBody, "Request digest");
  const approvalType =
    marker.get("approvalType") ??
    readMarkdownField(commentBody, "Approval type");

  if (decision !== "APPROVED" || !requestId || !batchId || !requestDigest) {
    return null;
  }

  return {
    ...(approvalType ? { approvalType } : {}),
    approver:
      comment.author ||
      readMarkdownField(commentBody, "Approver").replace(/^@/, ""),
    batchId,
    commandDigest: command?.digest ?? null,
    edited: isEditedComment(comment),
    requestDigest,
    requestId,
  };
}

export function parseBatchDefinitionSnapshot(
  content: string,
): BatchDefinitionSnapshot | null {
  const parsed = parseGovernanceYaml(content);

  if (!parsed.ok) {
    return null;
  }

  const validated = validateBatchDefinitionFile(parsed.value);

  if (!validated.ok) {
    return null;
  }

  const value = validated.value;

  return {
    enabledScheduleIds:
      value.spec.schedules
        ?.filter((schedule) => schedule.enabled)
        .map((schedule) => schedule.id) ?? [],
    enabledScheduleCronById: new Map(
      (value.spec.schedules ?? [])
        .filter((schedule) => schedule.enabled)
        .map((schedule) => [schedule.id, schedule.cron]),
    ),
    gateRequired: value.spec.gateRequired,
    status: value.spec.status,
    workflowPath: value.spec.workflow.path,
    workflowRef: value.spec.workflow.ref,
  };
}

export function parseApproverSelectorFromRoleMappingFile(
  content: string,
): ApproverSelectorSnapshot | null {
  const parsed = parseGovernanceYaml(content);

  if (!parsed.ok) {
    return null;
  }

  const validated = validateRoleMappingFile(parsed.value);

  if (!validated.ok) {
    return null;
  }

  const approver = validated.value.spec.roles.approver;

  return {
    githubTeams: approver.githubTeams ?? [],
    githubUsers: approver.githubUsers ?? [],
    repositoryRoles: approver.repositoryRoles ?? [],
  };
}

function parseCanonicalPayload(issueBody: string): unknown {
  const match = issueBody.match(/```json\s*([\s\S]*?)```/);

  if (!match?.[1]) {
    return null;
  }

  try {
    return JSON.parse(match[1]) as unknown;
  } catch {
    return null;
  }
}

function readWorkflowTarget(payload: unknown): { path: string; ref: string } {
  if (!payload || typeof payload !== "object") {
    return { path: "", ref: "" };
  }

  const spec = (payload as { spec?: unknown }).spec;

  if (!spec || typeof spec !== "object") {
    return { path: "", ref: "" };
  }

  const workflow = (spec as { workflow?: unknown }).workflow;

  if (!workflow || typeof workflow !== "object") {
    return { path: "", ref: "" };
  }

  const path = (workflow as { path?: unknown }).path;
  const ref = (workflow as { ref?: unknown }).ref;

  return {
    path: typeof path === "string" ? path : "",
    ref: typeof ref === "string" ? ref : "",
  };
}

function readRequestedBy(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const spec = (payload as { spec?: unknown }).spec;

  if (!spec || typeof spec !== "object") {
    return "";
  }

  const requestedBy = (spec as { requestedBy?: unknown }).requestedBy;

  return typeof requestedBy === "string" ? requestedBy : "";
}

function readScheduleId(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const spec = (payload as { spec?: unknown }).spec;

  if (!spec || typeof spec !== "object") {
    return "";
  }

  const schedule = (spec as { schedule?: unknown }).schedule;

  if (!schedule || typeof schedule !== "object") {
    return "";
  }

  const scheduleId = (schedule as { scheduleId?: unknown }).scheduleId;

  return typeof scheduleId === "string" ? scheduleId : "";
}

function readNativeScheduleOccurrence(
  payload: unknown,
): ExecutionRequestEvidence["schedule"] | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const spec = (payload as { spec?: unknown }).spec;
  if (!spec || typeof spec !== "object") return undefined;
  const schedule = (spec as { schedule?: unknown }).schedule;
  if (!schedule || typeof schedule !== "object") return undefined;

  const value = schedule as Record<string, unknown>;
  return typeof value.repositoryId === "string" &&
    typeof value.sourceRunId === "string" &&
    Number.isInteger(value.sourceRunAttempt)
    ? {
        repositoryId: value.repositoryId,
        sourceRunAttempt: value.sourceRunAttempt as number,
        sourceRunId: value.sourceRunId,
      }
    : undefined;
}

function readTriggerType(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const spec = (payload as { spec?: unknown }).spec;

  if (!spec || typeof spec !== "object") {
    return "";
  }

  const triggerType = (spec as { triggerType?: unknown }).triggerType;

  return typeof triggerType === "string" ? triggerType : "";
}

function parseApprovalCommand(body: string): ApprovalCommand | null {
  const firstLine = body.split("\n", 1)[0]?.trim();
  const match = firstLine?.match(/^\/bgcp approve\s+requestDigest=(\S+)$/u);

  if (!match?.[1]) {
    return null;
  }

  return { digest: match[1] };
}

function isEditedComment(comment: GateIssueComment): boolean {
  if (!comment.createdAt || !comment.updatedAt) {
    return false;
  }

  return comment.createdAt !== comment.updatedAt;
}

function parseBatchPlaneMarker(
  body: string,
  kind: string,
): Map<string, string> {
  const marker = new Map<string, string>();
  const match = body.match(
    new RegExp(`<!--\\s*batch(?:plane|trail):${kind}\\s*([\\s\\S]*?)-->`),
  );

  if (!match?.[1]) {
    return marker;
  }

  for (const line of match[1].split("\n")) {
    const separatorIndex = line.indexOf("=");

    if (separatorIndex < 0) {
      continue;
    }

    marker.set(
      line.slice(0, separatorIndex).trim(),
      line.slice(separatorIndex + 1).trim(),
    );
  }

  return marker;
}

function readMarkdownField(body: string, label: string): string {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = body.match(new RegExp(`- ${escapedLabel}:\\s*(.+)`));
  const value = match?.[1]?.trim() ?? "";

  return value.replace(/^`|`$/g, "").trim();
}
