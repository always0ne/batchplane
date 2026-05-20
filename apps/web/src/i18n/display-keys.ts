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
  "APPROVAL_COMMENT_EDITED",
  "APPROVAL_EVIDENCE_MISMATCH",
  "APPROVAL_EVIDENCE_NOT_FOUND",
  "APPROVAL_EVIDENCE_REQUIRED",
  "APPROVAL_NOT_APPROVED",
  "APPROVAL_NOT_FOUND",
  "APPROVAL_REFERENCE_MISMATCH",
  "APPROVAL_SOURCE_NOT_SUPPORTED",
  "APPROVER_NOT_AUTHORIZED",
  "BATCH_DEFINITION_INVALID",
  "BATCH_ID_REQUIRED",
  "BATCH_NOT_ACTIVE",
  "BATCH_NOT_FOUND",
  "DIGEST_MISMATCH",
  "DIRECT_DISPATCH_NOT_AUTHORIZED",
  "DISPATCH_ALREADY_HANDLED",
  "DISPATCH_IN_PROGRESS",
  "EXECUTION_REQUEST_NOT_APPROVED",
  "EXECUTION_REQUEST_REQUIRED",
  "EXPIRED_REQUEST",
  "GATE_REQUIRED",
  "GITHUB_EVIDENCE_LOOKUP_FAILED",
  "GITHUB_EVIDENCE_LOOKUP_REQUIRED",
  "IGNORED_COMMENT",
  "REF_NOT_ALLOWED",
  "ROLE_MAPPING_INVALID",
  "ROLE_MAPPING_NOT_FOUND",
  "REQUEST_DIGEST_REQUIRED",
  "REQUEST_DIGEST_MISMATCH",
  "REQUEST_EVIDENCE_MISMATCH",
  "REQUEST_EVIDENCE_NOT_FOUND",
  "REQUEST_FIELD_MISMATCH",
  "REQUEST_NOT_FOUND",
  "REQUEST_NOT_REQUESTED",
  "RERUN_NOT_AUTHORIZED",
  "SCHEDULE_NOT_MAPPED",
  "SELF_APPROVAL_NOT_ALLOWED",
  "UNKNOWN",
  "UNSUPPORTED_MODE",
  "WORKFLOW_NOT_ALLOWED",
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
