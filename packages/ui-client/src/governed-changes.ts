import type {
  BatchSchedule,
  BatchStatus,
  Criticality,
  GovernedChangeDecision,
  GovernedChangeDecisionSource,
  GovernedChangeType,
} from "@batchplane/domain";

export type BatchChangeDraft = {
  artifact?: {
    bytes: Uint8Array;
    fileName: string;
  };
  batch: {
    existingArtifact?: {
      fileName: string;
      locator: string;
    };
    artifactFileName?: string;
    batchId: string;
    criticality: Criticality;
    domain: string;
    environment: string;
    name: string;
    owner: string;
    runCommand: string;
    runnerLabel: string;
    status: BatchStatus;
    workflowRef: string;
  };
  governedChangeId?: string;
  mode: "create" | "change" | "delete";
  schedules: BatchSchedule[];
};

export type GovernedChangePreviewFile = {
  baseContent?: string;
  beforeDigest?: string | null;
  afterDigest?: string | null;
  contentKind?: "TEXT" | "BINARY";
  nextContent?: string;
  path: string;
  status: "ADDED" | "DELETED" | "MODIFIED" | "UNCHANGED";
  /** The path is GitHub metadata, not a BatchPlane-verified file revision. */
  evidenceUnavailable?: boolean;
};

export type GovernedChangePreview = {
  files: GovernedChangePreviewFile[];
  targetRevisionDigest: string;
};

type GovernedChangeRequestBase = {
  batchId: string;
  decision?: {
    actor?: string;
    decidedAt: string;
    decision: GovernedChangeDecision;
    source?: GovernedChangeDecisionSource;
  };
  mode: GovernedChangeType;
  requestLocator: string;
  requester: string;
  reviewState:
    | "OPEN"
    | "APPROVED_PENDING_MERGE"
    | "MERGED"
    | "REJECTED"
    | "WITHDRAWN"
    | "CLOSED"
    | "REAPPROVAL_REQUIRED"
    | "LEGACY_UNAPPROVABLE";
  sourceLabel: string;
  sourceUrl?: string;
  title: string;
};

export type GovernedChangeEvidenceView =
  | {
      governedChangeId: string;
      kind: "VERIFIED_V2";
      requestDigest: string;
      targetRevisionDigest: string;
    }
  | { kind: "LEGACY_UNAPPROVABLE" }
  | {
      kind: "REAPPROVAL_REQUIRED";
      reason: "UNVERIFIED_REQUEST" | "STALE_BASE" | "STALE_HEAD";
    }
  | {
      kind: "UNVERIFIED_DISPOSITION";
      decision: "REJECTED" | "WITHDRAWN";
    };

export type GovernedChangeRequest =
  | (GovernedChangeRequestBase & {
      evidence: Extract<GovernedChangeEvidenceView, { kind: "VERIFIED_V2" }>;
    })
  | (GovernedChangeRequestBase & {
      evidence: Exclude<GovernedChangeEvidenceView, { kind: "VERIFIED_V2" }>;
    });

export type GovernedChangeDetail = GovernedChangeRequest & {
  files: GovernedChangePreviewFile[];
  canApprove: boolean;
  canApplyApprovedChange: boolean;
  canReject: boolean;
  canWithdraw: boolean;
  rejectionReason?: string;
};

export type CreateGovernedChangeResult = {
  request: GovernedChangeRequest;
};
