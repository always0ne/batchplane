import type {
  BatchDefinition,
  DeletedBatchArchiveResult,
} from "@batchplane/domain";

export type BatchControlStatus = "VERIFIED" | "BYPASSED" | "UNKNOWN";

export type BatchRecentExecutionRequestSummary = {
  locator: string;
  /** Present for canonical execution-request evidence; absent for legacy data. */
  requestDigest?: string;
  requestId?: string;
  requestedAt: string;
  requester: string;
  status:
    | "REQUESTED"
    | "APPROVED"
    | "REJECTED"
    | "DISPATCHING"
    | "DISPATCHED"
    | "DISPATCH_FAILED"
    | "GATE_BLOCKED";
  title: string;
};

export type BatchRevisionProof = {
  governedChangeId: string;
  targetRevisionDigest: string;
  verifiedSha: string;
};

/** Kept separate from business ACTIVE/INACTIVE state. */
export type BatchControl =
  | {
      status: "VERIFIED";
      approvedRevision: BatchRevisionProof;
      remediation: BatchRemediationCapability;
    }
  | {
      status: "BYPASSED" | "UNKNOWN";
      disabledReason:
        | "UNAPPROVED_BATCH_REVISION"
        | "APPROVED_BATCH_REVISION_UNAVAILABLE";
      remediation: BatchRemediationCapability;
    };

export type BatchDetailResult =
  | {
      type: "active";
      batch: BatchDefinition;
      control: BatchControl;
      defaultBranch: string;
      recentExecutionRequests: BatchRecentExecutionRequestSummary[];
    }
  | {
      type: "deleted";
      archive: DeletedBatchArchiveResult;
      defaultBranch: string;
      recentExecutionRequests: BatchRecentExecutionRequestSummary[];
    }
  | { type: "not-found"; batchId: string };

export type BatchRemediationKind = "REVIEW_CURRENT" | "RESTORE_LAST_APPROVED";

/** Adapter-authoritative affordance, not an authorization policy for the UI. */
export type BatchRemediationCapability = {
  availableKinds: BatchRemediationKind[];
  canRequest: boolean;
};

export type RequestBatchRemediationInput = {
  batchId: string;
  kind: BatchRemediationKind;
};
