import type { ApprovedBatchRevisionResult } from "@batchplane/github-lite";

export type DispatcherCommand = "approve" | "retry-dispatch" | "ignore";

export type ExecutionRequestEvidence = {
  approvedBatchRevision: {
    governedChangeId: string;
    targetRevisionDigest: string;
  };
  batchId: string;
  expiresAt: string;
  requestDigest: string;
  requestedAt: string;
  requestedBy: string;
  requestId: string;
  scheduleId?: string;
  triggerType?: string;
  status: string;
  workflowPath: string;
  workflowRef: string;
};

export type ExecutionApprovalEvidence = {
  batchId: string;
  decision: "APPROVED" | "REJECTED";
  requestDigest: string;
  requestId: string;
};

export type DispatcherStatus = "DISPATCHING" | "DISPATCHED" | "DISPATCH_FAILED";

export type DispatcherStatusEvidence = {
  batchId: string;
  requestDigest: string;
  requestId: string;
  status: DispatcherStatus;
};

export type DispatcherVerificationInput = {
  approvalCommentBody: string;
  issueBody: string;
  now?: Date;
};

export type DispatcherDispatchPlan = {
  batchId: string;
  requestDigest: string;
  requestId: string;
  workflowPath: string;
  workflowRef: string;
  workflowInputs: Record<string, string>;
};

export type DispatcherRunInput = {
  apiBaseUrl?: string;
  commentId: number;
  fetcher?: typeof fetch;
  githubToken: string;
  issueNumber: number;
  now?: Date;
  owner: string;
  repo: string;
  verifyBatchRevision?: (input: {
    batchId: string;
    expectedRevision: ExecutionRequestEvidence["approvedBatchRevision"];
  }) => Promise<ApprovedBatchRevisionResult>;
};

export type DispatcherRunResult =
  | {
      dispatchPlan: DispatcherDispatchPlan;
      status: "dispatched";
    }
  | {
      dispatchPlan?: DispatcherDispatchPlan;
      message: string;
      reasonCode: string;
      status: "failed" | "ignored";
    };

export type DispatcherVerificationResult =
  | {
      ok: true;
      approval: ExecutionApprovalEvidence;
      dispatchPlan: DispatcherDispatchPlan;
      request: ExecutionRequestEvidence;
    }
  | {
      ok: false;
      message: string;
      reasonCode:
        | "APPROVAL_NOT_APPROVED"
        | "APPROVAL_NOT_FOUND"
        | "DIGEST_MISMATCH"
        | "EXPIRED_REQUEST"
        | "REQUEST_FIELD_MISMATCH"
        | "REQUEST_NOT_FOUND"
        | "REQUEST_NOT_REQUESTED"
        | "SCHEDULE_DISPATCH_NOT_ALLOWED"
        | "WORKFLOW_NOT_FOUND";
    };
