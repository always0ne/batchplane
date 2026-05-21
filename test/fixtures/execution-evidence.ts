export const sharedBatchId = "payment.daily-close";
export const sharedRequestId =
  "btr-20260513010203-payment.daily-close-abcdef12";
export const sharedRequestDigest =
  "sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
export const sharedWorkflowPath = ".github/workflows/daily-close.yml";
export const sharedWorkflowRef = "main";

export function buildExecutionIssueBody({
  batchId = sharedBatchId,
  requestDigest = sharedRequestDigest,
  requestId = sharedRequestId,
  requestedBy = "developer",
  status = "REQUESTED",
  workflowPath = sharedWorkflowPath,
  workflowRef = sharedWorkflowRef,
}: {
  batchId?: string;
  requestDigest?: string;
  requestId?: string;
  requestedBy?: string;
  status?: string;
  workflowPath?: string;
  workflowRef?: string;
} = {}): string {
  return [
    "## BatchPlane Execution Request",
    "",
    `- Request ID: \`${requestId}\``,
    `- Batch ID: \`${batchId}\``,
    `- Requested by: @${requestedBy}`,
    "- Requested at: 2026-05-09T01:02:03.000Z",
    "- Expires at: 2026-05-09T02:02:03.000Z",
    `- Request digest: \`${requestDigest}\``,
    `- Status: ${status}`,
    "",
    "### Canonical payload",
    "",
    "```json",
    JSON.stringify(
      {
        apiVersion: "batchtrail.io/v1",
        kind: "ExecutionRequest",
        metadata: {
          batchId,
          requestId,
        },
        spec: {
          expiresAt: "2026-05-09T02:02:03.000Z",
          requestedAt: "2026-05-09T01:02:03.000Z",
          requestedBy,
          workflow: {
            path: workflowPath,
            ref: workflowRef,
          },
        },
      },
      null,
      2,
    ),
    "```",
    "",
    "<!-- batchtrail:execution-request",
    `requestId=${requestId}`,
    `batchId=${batchId}`,
    `requestDigest=${requestDigest}`,
    `status=${status}`,
    "-->",
  ].join("\n");
}

export function buildExecutionApprovalCommentBody({
  approver = "maintainer",
  batchId = sharedBatchId,
  requestDigest = sharedRequestDigest,
  requestId = sharedRequestId,
}: {
  approver?: string;
  batchId?: string;
  requestDigest?: string;
  requestId?: string;
} = {}): string {
  return [
    `/bgcp approve requestDigest=${requestDigest}`,
    "",
    "## BatchPlane Execution Approval",
    "",
    "- Decision: APPROVED",
    `- Approver: @${approver}`,
    "- Approved at: 2026-05-09T01:20:03.000Z",
    `- Request ID: \`${requestId}\``,
    `- Batch ID: \`${batchId}\``,
    `- Request digest: \`${requestDigest}\``,
    "",
    "<!-- batchtrail:execution-approval",
    "decision=APPROVED",
    `requestId=${requestId}`,
    `batchId=${batchId}`,
    `requestDigest=${requestDigest}`,
    "-->",
  ].join("\n");
}

export function buildDispatchedCommentBody({
  batchId = sharedBatchId,
  requestDigest = sharedRequestDigest,
  requestId = sharedRequestId,
  status = "DISPATCHED",
}: {
  batchId?: string;
  requestDigest?: string;
  requestId?: string;
  status?: "DISPATCHED" | "DISPATCHING" | "DISPATCH_FAILED";
} = {}): string {
  return [
    "## BatchPlane Dispatch",
    "",
    `- Status: ${status}`,
    `- Request ID: \`${requestId}\``,
    `- Batch ID: \`${batchId}\``,
    `- Request digest: \`${requestDigest}\``,
    "",
    "<!-- batchtrail:bgcp:dispatcher",
    `status=${status}`,
    `requestId=${requestId}`,
    `batchId=${batchId}`,
    `requestDigest=${requestDigest}`,
    "-->",
  ].join("\n");
}
