import type {
  DispatcherDispatchPlan,
  DispatcherStatusEvidence,
  DispatcherVerificationInput,
  DispatcherVerificationResult,
  ExecutionApprovalEvidence,
  ExecutionRequestEvidence,
} from "./dispatcher-types.js";
import { parseDispatcherCommand } from "./dispatcher-command.js";

export function isActionableApprovalComment(commentBody: string): boolean {
  return (
    parseDispatcherCommand(commentBody) === "approve" &&
    parseExecutionApprovalEvidence(commentBody)?.decision === "APPROVED"
  );
}

export function verifyDispatcherEvidence({
  approvalCommentBody,
  issueBody,
  now = new Date(),
}: DispatcherVerificationInput): DispatcherVerificationResult {
  const request = parseExecutionRequestEvidence(issueBody);

  if (!request) {
    return {
      ok: false,
      message: "BatchPlane execution request evidence was not found.",
      reasonCode: "REQUEST_NOT_FOUND",
    };
  }

  if (request.status !== "REQUESTED") {
    return {
      ok: false,
      message: `Execution request status is ${request.status}.`,
      reasonCode: "REQUEST_NOT_REQUESTED",
    };
  }

  if (request.triggerType === "SCHEDULE") {
    return {
      ok: false,
      message: "Native schedule occurrences are not dispatcher commands.",
      reasonCode: "SCHEDULE_DISPATCH_NOT_ALLOWED",
    };
  }

  if (isExpired(request.expiresAt, now)) {
    return {
      ok: false,
      message: "Execution request approval window has expired.",
      reasonCode: "EXPIRED_REQUEST",
    };
  }

  if (!request.workflowPath || !request.workflowRef) {
    return {
      ok: false,
      message: "Execution request workflow target was not found.",
      reasonCode: "WORKFLOW_NOT_FOUND",
    };
  }

  const approval = parseExecutionApprovalEvidence(approvalCommentBody);

  if (!approval) {
    return {
      ok: false,
      message: "BatchPlane execution approval evidence was not found.",
      reasonCode: "APPROVAL_NOT_FOUND",
    };
  }

  if (approval.decision !== "APPROVED") {
    return {
      ok: false,
      message: `Execution approval decision is ${approval.decision}.`,
      reasonCode: "APPROVAL_NOT_APPROVED",
    };
  }

  if (
    approval.requestId !== request.requestId ||
    approval.batchId !== request.batchId
  ) {
    return {
      ok: false,
      message: "Execution approval does not reference the requested batch.",
      reasonCode: "REQUEST_FIELD_MISMATCH",
    };
  }

  if (approval.requestDigest !== request.requestDigest) {
    return {
      ok: false,
      message: "Execution approval digest does not match the request digest.",
      reasonCode: "DIGEST_MISMATCH",
    };
  }

  return {
    ok: true,
    approval,
    dispatchPlan: {
      batchId: request.batchId,
      requestDigest: request.requestDigest,
      requestId: request.requestId,
      workflowInputs: {
        batch_id: request.batchId,
        request_digest: request.requestDigest,
        request_id: request.requestId,
        ...(request.scheduleId ? { schedule_id: request.scheduleId } : {}),
      },
      workflowPath: request.workflowPath,
      workflowRef: request.workflowRef,
    },
    request,
  };
}

export function parseExecutionRequestEvidence(
  issueBody: string,
): ExecutionRequestEvidence | null {
  const marker =
    parseBatchPlaneMarker(issueBody, "execution-request") ?? new Map();
  const requestId =
    marker.get("requestId") ?? readMarkdownField(issueBody, "Request ID");
  const batchId =
    marker.get("batchId") ?? readMarkdownField(issueBody, "Batch ID");
  const requestDigest =
    marker.get("requestDigest") ??
    readMarkdownField(issueBody, "Request digest");
  const status = marker.get("status") ?? readMarkdownField(issueBody, "Status");
  const payload = parseCanonicalPayload(issueBody);
  const workflow = readWorkflowTarget(payload);
  const approvedBatchRevision = readApprovedBatchRevision(payload);

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
    expiresAt: readMarkdownField(issueBody, "Expires at"),
    requestDigest,
    requestedAt: readMarkdownField(issueBody, "Requested at"),
    requestedBy: readMarkdownField(issueBody, "Requested by").replace(/^@/, ""),
    requestId,
    ...(readScheduleId(payload) ? { scheduleId: readScheduleId(payload) } : {}),
    ...(readTriggerType(payload)
      ? { triggerType: readTriggerType(payload) }
      : {}),
    status,
    workflowPath: workflow.path,
    workflowRef: workflow.ref,
  };
}

export function parseExecutionApprovalEvidence(
  commentBody: string,
): ExecutionApprovalEvidence | null {
  const marker =
    parseBatchPlaneMarker(commentBody, "execution-approval") ?? new Map();
  const decision = marker.get("decision");
  const requestId =
    marker.get("requestId") ?? readMarkdownField(commentBody, "Request ID");
  const batchId =
    marker.get("batchId") ?? readMarkdownField(commentBody, "Batch ID");
  const requestDigest =
    marker.get("requestDigest") ??
    readMarkdownField(commentBody, "Request digest");

  if (
    (decision !== "APPROVED" && decision !== "REJECTED") ||
    !requestId ||
    !batchId ||
    !requestDigest
  ) {
    return null;
  }

  return {
    batchId,
    decision,
    requestDigest,
    requestId,
  };
}

export function parseDispatcherStatusEvidence(
  commentBody: string,
): DispatcherStatusEvidence | null {
  const marker =
    parseBatchPlaneMarker(commentBody, "bgcp:dispatcher") ??
    parseBatchPlaneMarker(commentBody, "execution-dispatch") ??
    new Map<string, string>();
  const status = marker.get("status");
  const requestId =
    marker.get("requestId") ?? readMarkdownField(commentBody, "Request ID");
  const batchId =
    marker.get("batchId") ?? readMarkdownField(commentBody, "Batch ID");
  const requestDigest =
    marker.get("requestDigest") ??
    readMarkdownField(commentBody, "Request digest");

  if (
    (status !== "DISPATCHING" &&
      status !== "DISPATCHED" &&
      status !== "DISPATCH_FAILED") ||
    !requestId ||
    !batchId ||
    !requestDigest
  ) {
    return null;
  }

  return {
    batchId,
    requestDigest,
    requestId,
    status,
  };
}

export function buildDispatchingComment(
  dispatchPlan: DispatcherDispatchPlan,
): string {
  return [
    "## BatchPlane Dispatch",
    "",
    "- Status: DISPATCHING",
    `- Request ID: \`${dispatchPlan.requestId}\``,
    `- Batch ID: \`${dispatchPlan.batchId}\``,
    `- Workflow: \`${dispatchPlan.workflowPath}\``,
    `- Workflow ref: \`${dispatchPlan.workflowRef}\``,
    `- Request digest: \`${dispatchPlan.requestDigest}\``,
    "",
    "<!-- batchplane:bgcp:dispatcher",
    "status=DISPATCHING",
    `requestId=${dispatchPlan.requestId}`,
    `batchId=${dispatchPlan.batchId}`,
    `requestDigest=${dispatchPlan.requestDigest}`,
    "-->",
  ].join("\n");
}

export function buildDispatchSuccessComment(
  dispatchPlan: DispatcherDispatchPlan,
): string {
  return [
    "## BatchPlane Dispatch",
    "",
    "- Status: DISPATCHED",
    `- Request ID: \`${dispatchPlan.requestId}\``,
    `- Batch ID: \`${dispatchPlan.batchId}\``,
    `- Workflow: \`${dispatchPlan.workflowPath}\``,
    `- Workflow ref: \`${dispatchPlan.workflowRef}\``,
    `- Request digest: \`${dispatchPlan.requestDigest}\``,
    "",
    "<!-- batchplane:bgcp:dispatcher",
    "status=DISPATCHED",
    `requestId=${dispatchPlan.requestId}`,
    `batchId=${dispatchPlan.batchId}`,
    `requestDigest=${dispatchPlan.requestDigest}`,
    "-->",
  ].join("\n");
}

export function buildDispatchFailureComment(
  message: string,
  reasonCode: string,
  dispatchPlan?: DispatcherDispatchPlan,
) {
  return [
    "## BatchPlane Dispatch",
    "",
    "- Status: DISPATCH_FAILED",
    `- Reason code: ${reasonCode}`,
    `- Message: ${message}`,
    ...(dispatchPlan
      ? [
          `- Request ID: \`${dispatchPlan.requestId}\``,
          `- Batch ID: \`${dispatchPlan.batchId}\``,
          `- Request digest: \`${dispatchPlan.requestDigest}\``,
        ]
      : []),
    "",
    "<!-- batchplane:bgcp:dispatcher",
    "status=DISPATCH_FAILED",
    `reasonCode=${reasonCode}`,
    ...(dispatchPlan
      ? [
          `requestId=${dispatchPlan.requestId}`,
          `batchId=${dispatchPlan.batchId}`,
          `requestDigest=${dispatchPlan.requestDigest}`,
        ]
      : []),
    "-->",
  ].join("\n");
}

function readApprovedBatchRevision(
  payload: unknown,
): ExecutionRequestEvidence["approvedBatchRevision"] | null {
  if (!payload || typeof payload !== "object") return null;
  const spec = (payload as { spec?: unknown }).spec;
  const revision =
    spec && typeof spec === "object"
      ? (spec as { approvedBatchRevision?: unknown }).approvedBatchRevision
      : null;

  if (!revision || typeof revision !== "object") return null;
  const governedChangeId = (revision as { governedChangeId?: unknown })
    .governedChangeId;
  const targetRevisionDigest = (revision as { targetRevisionDigest?: unknown })
    .targetRevisionDigest;

  return typeof governedChangeId === "string" &&
    governedChangeId.trim() &&
    typeof targetRevisionDigest === "string" &&
    targetRevisionDigest.startsWith("sha256:")
    ? { governedChangeId, targetRevisionDigest }
    : null;
}

function parseBatchPlaneMarker(
  body: string,
  kind: string,
): Map<string, string> | null {
  const marker = new Map<string, string>();
  const match = body.match(
    new RegExp(`<!--\\s*batch(?:plane|trail):${kind}\\s*([\\s\\S]*?)-->`),
  );

  if (!match?.[1]) {
    return null;
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

function readTriggerType(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const spec = (payload as { spec?: unknown }).spec;
  if (!spec || typeof spec !== "object") return "";
  const triggerType = (spec as { triggerType?: unknown }).triggerType;
  return typeof triggerType === "string" ? triggerType : "";
}

function readMarkdownField(body: string, label: string): string {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = body.match(new RegExp(`- ${escapedLabel}:\\s*(.+)`));
  const value = match?.[1]?.trim() ?? "";

  return value.replace(/^`|`$/g, "").trim();
}

function isExpired(expiresAt: string, now: Date): boolean {
  const expiresAtTime = Date.parse(expiresAt);

  if (Number.isNaN(expiresAtTime)) {
    return false;
  }

  return expiresAtTime <= now.getTime();
}
