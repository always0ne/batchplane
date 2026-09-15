import {
  batchPlaneApiVersion,
  type ExecutionRequest,
  type ExecutionTriggerType,
  type WorkspaceApprovalMode,
} from "@batchplane/domain";
import {
  createParameterDigest,
  createRequestDigest,
  type CanonicalValue,
} from "@batchplane/digest";

import type { GitHubBatchDefinition } from "./github-batch-definition.js";

/** Native GitHub schedule evidence bound into a canonical request payload. */
export type ScheduleOccurrenceRef = {
  scheduleId: string;
  definitionPath: string;
  definitionCommitSha: string;
  repositoryId: string;
  sourceRunId: string;
  sourceRunAttempt: number;
};

/** Canonical GitHub Lite evidence. Product UI receives an opaque snapshot instead. */
export type ExecutionRequestPayload = {
  apiVersion: typeof batchPlaneApiVersion | "batchtrail.io/v1";
  kind: "ExecutionRequest";
  metadata: { batchId: string; requestId: string };
  spec: {
    approvedBatchRevision: {
      governedChangeId: string;
      targetRevisionDigest: string;
    };
    batch: Pick<
      GitHubBatchDefinition,
      "name" | "owner" | "domain" | "environment" | "criticality"
    > & {
      /** Present in new canonical requests; legacy evidence intentionally lacks it. */
      gateRequired?: boolean;
    };
    contractVersion?: "NATIVE_SCHEDULE_V2";
    execution?: NonNullable<GitHubBatchDefinition["execution"]> & {
      gateRequired: boolean;
    };
    expiresAt?: string;
    parameters?: Record<
      string,
      | { sensitive?: false; value: string }
      | { sensitive: true; valueDigest: string }
    >;
    reason?: string;
    requestedAt: string;
    requestedBy: string;
    schedule?: ScheduleOccurrenceRef;
    triggerType?: ExecutionTriggerType;
    workflow: GitHubBatchDefinition["workflow"];
  };
};

export type ExecutionRequestParameterInput = {
  name: string;
  sensitive: boolean;
  value: string;
};

export type ExecutionRequestIssue = {
  body: string;
  labels: string[];
  payload: ExecutionRequestPayload;
  request: ExecutionRequest;
  title: string;
};

export type BuildExecutionRequestIssueParams = {
  approvedBatchRevision: Pick<
    import("@batchplane/domain").ApprovedBatchRevision,
    "governedChangeId" | "targetRevisionDigest"
  >;
  batch: GitHubBatchDefinition;
  expiresAt?: Date;
  parameters?: ExecutionRequestParameterInput[];
  reason?: string;
  requestId?: string;
  requestedAt: Date;
  requestedBy: string;
  schedule?: ScheduleOccurrenceRef;
  triggerType?: ExecutionTriggerType;
  workflowRef?: string;
};

export type BuildExecutionApprovalCommentParams = {
  approvedAt: Date;
  approvalMode?: WorkspaceApprovalMode;
  approvalType?: "MANUAL" | "SCHEDULE_DELEGATED" | "WORKSPACE_AUTO_APPROVED";
  approver: string;
  request: Pick<
    ExecutionRequest,
    "batchId" | "requestDigest" | "requestId" | "requestedBy"
  >;
};

export async function buildExecutionRequestIssue({
  approvedBatchRevision,
  batch,
  expiresAt,
  parameters = [],
  reason = "Manual request from BatchPlane Lite.",
  requestId,
  requestedAt,
  requestedBy,
  schedule,
  triggerType = "MANUAL",
  workflowRef,
}: BuildExecutionRequestIssueParams): Promise<ExecutionRequestIssue> {
  if (
    !approvedBatchRevision.governedChangeId.trim() ||
    !approvedBatchRevision.targetRevisionDigest.startsWith("sha256:")
  ) {
    throw new Error(
      "Execution requests require an approved governed Batch revision binding.",
    );
  }
  const effectiveRequestId =
    requestId ??
    (triggerType === "SCHEDULE" && schedule
      ? await createScheduledExecutionRequestId(
          batch.batchId,
          schedule.scheduleId,
          schedule.repositoryId,
          schedule.sourceRunId,
        )
      : createExecutionRequestId(batch.batchId, requestedAt));
  if (triggerType !== "SCHEDULE" && !expiresAt)
    throw new Error("Manual execution requests require an expiration time.");

  const requestedAtIso = requestedAt.toISOString();
  const expiresAtIso = expiresAt?.toISOString();
  const parameterPayload = await buildParameterPayload(parameters);
  const payload: ExecutionRequestPayload = {
    apiVersion: batchPlaneApiVersion,
    kind: "ExecutionRequest",
    metadata: { batchId: batch.batchId, requestId: effectiveRequestId },
    spec: {
      approvedBatchRevision: {
        governedChangeId: approvedBatchRevision.governedChangeId.trim(),
        targetRevisionDigest: approvedBatchRevision.targetRevisionDigest.trim(),
      },
      batch: {
        criticality: batch.criticality,
        domain: batch.domain,
        environment: batch.environment,
        gateRequired: batch.gateRequired,
        name: batch.name,
        owner: batch.owner,
      },
      ...(batch.execution
        ? {
            execution: {
              ...(batch.execution.artifactPath
                ? { artifactPath: batch.execution.artifactPath }
                : {}),
              command: batch.execution.command,
              gateRequired: batch.gateRequired,
              runsOn: batch.execution.runsOn,
            },
          }
        : {}),
      ...(expiresAtIso ? { expiresAt: expiresAtIso } : {}),
      ...(triggerType === "SCHEDULE"
        ? { contractVersion: "NATIVE_SCHEDULE_V2" as const }
        : {}),
      ...(parameterPayload ? { parameters: parameterPayload } : {}),
      reason,
      requestedAt: requestedAtIso,
      requestedBy,
      ...(triggerType !== "MANUAL" ? { triggerType } : {}),
      workflow: {
        path: batch.workflow.path,
        ref: workflowRef?.trim() || batch.workflow.ref,
      },
      ...(schedule ? { schedule } : {}),
    },
  };
  const requestDigest = await createRequestDigest(
    payload as unknown as CanonicalValue,
  );
  const request: ExecutionRequest = {
    approvedBatchRevision: payload.spec.approvedBatchRevision,
    batchId: batch.batchId,
    ...(expiresAtIso ? { expiresAt: expiresAtIso } : {}),
    requestDigest,
    requestedAt: requestedAtIso,
    requestedBy,
    requestId: effectiveRequestId,
    status: "REQUESTED",
    ...(reason ? { reason } : {}),
    ...(triggerType !== "MANUAL" ? { triggerType } : {}),
  };
  return {
    body: buildExecutionRequestBody(payload, request),
    labels:
      triggerType === "SCHEDULE"
        ? ["batchplane:execution-request", "batchplane:scheduled-execution"]
        : ["batchplane:execution-request"],
    payload,
    request,
    title:
      triggerType === "SCHEDULE"
        ? `Scheduled run ${batch.batchId}`
        : `Run batch ${batch.batchId}`,
  };
}

export function createExecutionRequestId(
  batchId: string,
  date = new Date(),
  entropy = createEntropy(),
): string {
  return `btr-${date.toISOString().replaceAll("-", "").replaceAll(":", "").replaceAll(".", "").replaceAll("T", "").replaceAll("Z", "").slice(0, 14)}-${toRequestSlug(batchId)}-${entropy}`;
}

export async function createScheduledExecutionRequestId(
  batchId: string,
  scheduleId: string,
  repositoryId: string,
  sourceRunId: string | number,
): Promise<string> {
  const run = String(sourceRunId).trim();
  if (!repositoryId.trim() || !run)
    throw new Error(
      "Scheduled execution requests require the native repository and Run identifiers.",
    );
  const digest = await createRequestDigest({
    batchId,
    repositoryId,
    scheduleId,
    sourceRunId: run,
  });
  return `btr-schedule-${digest.slice("sha256:".length)}`;
}

export function buildExecutionApprovalComment({
  approvedAt,
  approvalMode,
  approvalType = "MANUAL",
  approver,
  request,
}: BuildExecutionApprovalCommentParams): string {
  const selfApproval = approver === request.requestedBy;
  const scheduleDelegated = approvalType === "SCHEDULE_DELEGATED";
  const workspaceAutoApproved = approvalType === "WORKSPACE_AUTO_APPROVED";
  return [
    `/bgcp approve requestDigest=${request.requestDigest}`,
    "",
    "## BatchPlane Execution Approval",
    "",
    "- Decision: APPROVED",
    `- Approver: @${approver}`,
    `- Approved at: ${approvedAt.toISOString()}`,
    ...(approvalMode ? [`- Approval mode: ${approvalMode}`] : []),
    ...(scheduleDelegated ? ["- Approval type: SCHEDULE_DELEGATED"] : []),
    ...(workspaceAutoApproved
      ? [
          "- Approval type: WORKSPACE_AUTO_APPROVED",
          "- Approval source: WORKSPACE_POLICY",
        ]
      : []),
    ...(!scheduleDelegated && !workspaceAutoApproved && selfApproval
      ? ["- Self approval: ALLOWED_BY_WORKSPACE_POLICY"]
      : []),
    `- Request ID: \`${request.requestId}\``,
    `- Batch ID: \`${request.batchId}\``,
    `- Request digest: \`${request.requestDigest}\``,
    "",
    "This approval evidence was recorded by BatchPlane Lite.",
    "",
    "<!-- batchplane:execution-approval",
    "decision=APPROVED",
    `requestId=${request.requestId}`,
    `batchId=${request.batchId}`,
    `requestDigest=${request.requestDigest}`,
    ...(approvalMode ? [`approvalMode=${approvalMode}`] : []),
    ...(scheduleDelegated ? ["approvalType=SCHEDULE_DELEGATED"] : []),
    ...(workspaceAutoApproved
      ? [
          "approvalType=WORKSPACE_AUTO_APPROVED",
          "approvalSource=WORKSPACE_POLICY",
        ]
      : []),
    ...(!scheduleDelegated && !workspaceAutoApproved && selfApproval
      ? ["selfApproval=true"]
      : []),
    "-->",
  ].join("\n");
}

async function buildParameterPayload(
  parameters: ExecutionRequestParameterInput[],
): Promise<ExecutionRequestPayload["spec"]["parameters"] | undefined> {
  const entries = await Promise.all(
    parameters.map(async ({ name, sensitive, value }) => {
      const key = name.trim();
      if (!key) return undefined;
      return sensitive
        ? ([
            key,
            {
              sensitive: true as const,
              valueDigest: await createParameterDigest({ [key]: value }),
            },
          ] as const)
        : ([key, { value }] as const);
    }),
  );
  const present = entries.filter((entry): entry is NonNullable<typeof entry> =>
    Boolean(entry),
  );
  return present.length ? Object.fromEntries(present) : undefined;
}

function buildExecutionRequestBody(
  payload: ExecutionRequestPayload,
  request: ExecutionRequest,
): string {
  return [
    "## BatchPlane Execution Request",
    "",
    `- Request ID: \`${request.requestId}\``,
    `- Batch ID: \`${request.batchId}\``,
    `- Requested by: @${request.requestedBy}`,
    `- Requested at: ${request.requestedAt}`,
    ...(request.expiresAt ? [`- Expires at: ${request.expiresAt}`] : []),
    `- Trigger type: \`${request.triggerType ?? "MANUAL"}\``,
    `- Approved Batch change: \`${request.approvedBatchRevision.governedChangeId}\``,
    `- Approved Batch digest: \`${request.approvedBatchRevision.targetRevisionDigest}\``,
    `- Request digest: \`${request.requestDigest}\``,
    `- Status: ${request.status}`,
    "",
    "### Canonical payload",
    "",
    "```json",
    JSON.stringify(payload, null, 2),
    "```",
    "",
    "<!-- batchplane:execution-request",
    `requestId=${request.requestId}`,
    `batchId=${request.batchId}`,
    `requestDigest=${request.requestDigest}`,
    `status=${request.status}`,
    "-->",
  ].join("\n");
}

function createEntropy(): string {
  const bytes = new Uint8Array(4);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function toRequestSlug(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "batch"
  );
}
