export type ExecutionRequestStatus =
  | "REQUESTED"
  | "APPROVED"
  | "REJECTED"
  | "CANCELED"
  | "DISPATCHING"
  | "DISPATCHED"
  | "DISPATCH_FAILED";

export type ExecutionTriggerType = "MANUAL" | "SCHEDULE";

export type ExecutionRequest = {
  requestId: string;
  batchId: string;
  requestedBy: string;
  requestedAt: string;
  expiresAt?: string;
  requestDigest: string;
  approvedBatchRevision: {
    governedChangeId: string;
    targetRevisionDigest: string;
  };
  status: ExecutionRequestStatus;
  reason?: string;
  triggerType?: ExecutionTriggerType;
};

export type ApprovedBatchRevision = {
  governedChangeId: string;
  targetRevisionDigest: string;
};

export type ExecutionRunStatus =
  | "QUEUED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "BLOCKED"
  | "CANCELED"
  | "UNCONFIRMED";

export type GateDecision = {
  allowed: boolean;
  reasonCode?: string;
  message: string;
  decidedAt: string;
  requestId?: string;
  scheduleId?: string;
};

export type ExecutionRunJob = {
  jobId: string;
  name: string;
  /** Adapter-projected execution role; absent for legacy provider-neutral jobs. */
  role?: "GATE" | "BUSINESS";
  status: ExecutionRunStatus;
  conclusion?: string;
  startedAt?: string;
  completedAt?: string;
  url?: string;
};

export type ExecutionRunJobLog = {
  jobId: string;
  content: string;
  truncated: boolean;
  sizeBytes: number;
};

import type { FailureFollowUp } from "./failure-follow-up.js";

export type ExecutionRun = {
  runId: string;
  requestId: string;
  batchId: string;
  status: ExecutionRunStatus;
  actor?: string;
  startedAt?: string;
  completedAt?: string;
  event?: string;
  runAttempt?: number;
  gateDecision?: GateDecision;
  jobs?: ExecutionRunJob[];
  failureFollowUps?: FailureFollowUp[];
};

export type AuditTimelineItemType =
  | "BATCH_REGISTERED"
  | "BATCH_CHANGED"
  | "EXECUTION_REQUESTED"
  | "APPROVAL_RECORDED"
  | "DISPATCH_RECORDED"
  | "GATE_DECIDED"
  | "FAILURE_FOLLOW_UP_RECORDED"
  | "FAILURE_FOLLOW_UP_REVIEWED"
  | "RUN_COMPLETED"
  | "SCHEDULE_OCCURRED";

export type AuditTimelineItem = {
  itemId: string;
  type: AuditTimelineItemType;
  subjectType: "BATCH" | "EXECUTION_REQUEST" | "EXECUTION_RUN" | "SCHEDULE";
  subjectId: string;
  actor: string;
  occurredAt: string;
  summary: string;
  sourceUrl?: string;
  metadata?: Record<string, string | number | boolean>;
};
