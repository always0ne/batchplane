import type {
  AuditTimelineItem,
  ExecutionRunJobLog,
  ExecutionRunStatus,
  FailureFollowUpReviewDecisionValue,
  FailureFollowUpStatus,
} from "@batchplane/domain";
import type { BatchListError } from "./batches.js";
import type { ExecutionRunPresentation } from "./execution-requests.js";
import type { RequestInventoryItem } from "./request-inventory.js";

export type ExecutionRunQuery = {
  batchId?: string;
  executionTargetLocation?: string;
  limit?: number;
  requestId?: string;
};

export type ExecutionRunLocator = { runAttempt?: number; runId: string };

export type CreateFailureFollowUpInput = {
  actionTaken: string;
  explanation: string;
  owner: string;
  runId: string;
  status: FailureFollowUpStatus;
};

export type ReviewFailureFollowUpInput = {
  decision: FailureFollowUpReviewDecisionValue;
  followUpId: string;
  reason: string;
  runId: string;
};
export type {
  ExecutionRunJob,
  ExecutionRunStatus,
  FailureFollowUp,
  FailureFollowUpReviewDecision,
  FailureFollowUpReviewDecisionValue,
  FailureFollowUpStatus,
} from "@batchplane/domain";

export type ExecutionJobLog = ExecutionRunJobLog & {
  /** Adapter-selected business section; full content above remains untouched. */
  businessSection: { content: string; focused: boolean };
};

export type ExecutionAuditItem = AuditTimelineItem & {
  execution?: {
    locator: string;
    runAttempt?: number;
    scheduleId?: string;
    observation: ExecutionRunStatus;
    sourceOnly: boolean;
  };
};

export type DashboardSummary = {
  workspace: { label: string; currentUser: string; defaultRevision: string };
  installation: {
    installed: boolean;
    missingCount: number;
    presentCount: number;
    requiredCount: number;
  };
  batchCount: number;
  pendingApprovals: RequestInventoryItem[];
  failedRunCount: number;
  gateBlockedRunCount: number;
  auditItems: ExecutionAuditItem[];
};

export class ExecutionInspectionError extends Error {
  constructor(readonly reason: BatchListError) {
    super(reason.type === "message" ? reason.message : reason.type);
    this.name = "ExecutionInspectionError";
  }
}

export function isBusinessFailure(run: ExecutionRunPresentation): boolean {
  return run.status === "FAILED" && run.gateDecision?.allowed === true;
}
