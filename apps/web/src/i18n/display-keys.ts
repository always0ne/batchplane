export const statusDisplayGroups = {
  approvalDecision: ["APPROVED", "REJECTED"],
  auditTimelineType: [
    "BATCH_REGISTERED",
    "BATCH_CHANGED",
    "EXECUTION_REQUESTED",
    "APPROVAL_RECORDED",
    "DISPATCH_RECORDED",
    "GATE_DECIDED",
    "RUN_COMPLETED",
    "SCHEDULE_OCCURRED",
  ],
  batch: ["ACTIVE", "INACTIVE"],
  criticality: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
  executionRequest: [
    "REQUESTED",
    "APPROVED",
    "REJECTED",
    "CANCELED",
    "DISPATCHING",
    "DISPATCHED",
    "DISPATCH_FAILED",
  ],
  executionRun: [
    "QUEUED",
    "RUNNING",
    "SUCCEEDED",
    "FAILED",
    "BLOCKED",
    "CANCELED",
  ],
} as const;

export const gateReasonCodes = [
  "APPROVAL_EVIDENCE_MISMATCH",
  "APPROVAL_EVIDENCE_NOT_FOUND",
  "APPROVAL_EVIDENCE_REQUIRED",
  "APPROVAL_NOT_APPROVED",
  "APPROVAL_NOT_FOUND",
  "BATCH_ID_REQUIRED",
  "DIGEST_MISMATCH",
  "DIRECT_DISPATCH_NOT_AUTHORIZED",
  "DISPATCH_ALREADY_HANDLED",
  "DISPATCH_IN_PROGRESS",
  "EXECUTION_REQUEST_REQUIRED",
  "EXPIRED_REQUEST",
  "GITHUB_EVIDENCE_LOOKUP_REQUIRED",
  "IGNORED_COMMENT",
  "REQUEST_DIGEST_REQUIRED",
  "REQUEST_EVIDENCE_MISMATCH",
  "REQUEST_EVIDENCE_NOT_FOUND",
  "REQUEST_FIELD_MISMATCH",
  "REQUEST_NOT_FOUND",
  "REQUEST_NOT_REQUESTED",
  "RERUN_NOT_AUTHORIZED",
  "UNKNOWN",
  "UNSUPPORTED_MODE",
  "WORKFLOW_DISPATCH_FAILED",
  "WORKFLOW_NOT_FOUND",
] as const;

export type StatusDisplayGroup = keyof typeof statusDisplayGroups;
export type GateReasonCode = (typeof gateReasonCodes)[number];

const gateReasonCodeSet = new Set<string>(gateReasonCodes);

export function getStatusDisplayKey(
  group: StatusDisplayGroup,
  value: string,
): string {
  return `common:status.${group}.${value}`;
}

export function getGateReasonDisplayKey(reasonCode: string): string {
  const resolvedReasonCode = gateReasonCodeSet.has(reasonCode)
    ? reasonCode
    : "UNKNOWN";

  return `errors:gate.reasonCodes.${resolvedReasonCode}`;
}
