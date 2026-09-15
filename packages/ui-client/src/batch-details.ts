import type { BatchDefinition, BatchSchedule } from "@batchplane/domain";

export type BatchScheduleDisplay = BatchSchedule & {
  generatedCron: string;
};

export type BatchExecutionTarget = {
  command?: string;
  executionEnvironment?: string;
  executionFile?: {
    location: string;
    name: string;
  };
  platformName: string;
  targetName: string;
  targetRevision: string;
};

export type BatchDetailDefinition = Omit<BatchDefinition, "schedules"> & {
  executionTarget?: BatchExecutionTarget;
  schedules?: BatchScheduleDisplay[];
};

export type BatchDetailArchiveSourceRequest = {
  locator: string;
  number?: number;
  url: string;
};

export type BatchDetailArchiveResult =
  | {
      sourceRequest: BatchDetailArchiveSourceRequest;
      status: "UNAVAILABLE";
      unavailableReason:
        | "LEGACY_OR_MALFORMED_EVIDENCE"
        | "REQUEST_EVIDENCE_MISMATCH"
        | "REQUEST_EVIDENCE_UNVERIFIED"
        | "BASE_REVISION_UNAVAILABLE"
        | "BATCH_DEFINITION_NOT_FOUND"
        | "BATCH_DEFINITION_DIGEST_MISMATCH"
        | "BATCH_DEFINITION_MALFORMED";
    }
  | {
      batch: BatchDetailDefinition;
      sourceRequest: BatchDetailArchiveSourceRequest;
      status: "VERIFIED";
    };

export type BatchControlStatus = "VERIFIED" | "BYPASSED" | "UNKNOWN";

export type BatchRecentExecutionRequestSummary = {
  scheduled?: boolean;
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
      batch: BatchDetailDefinition;
      control: BatchControl;
      defaultBranch: string;
      recentExecutionRequests: BatchRecentExecutionRequestSummary[];
    }
  | {
      type: "deleted";
      archive: BatchDetailArchiveResult;
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
