import type {
  BatchSchedule,
  GovernedChangeDecision,
  GovernedChangeDecisionSource,
  GovernedChangeType,
} from "@batchplane/domain";
import type { GitHubActionsExecutionSettings } from "./github-actions-execution.js";

export type BatchChangeBusinessInput = Pick<
  import("@batchplane/domain").BatchDefinition,
  | "batchId"
  | "criticality"
  | "domain"
  | "environment"
  | "name"
  | "owner"
  | "status"
>;

export type BatchChangeDraft = {
  batch: BatchChangeBusinessInput;
  execution: GitHubActionsExecutionSettings;
  /** Authenticated requester used only when a user leaves owner blank. */
  defaultOwner?: string;
  governedChangeId?: string;
  mode: "create" | "change" | "delete";
  remediation?: "REVIEW_CURRENT" | "RESTORE_LAST_APPROVED";
  schedules: BatchSchedule[];
  /** Immutable identity supplied by the change route, never user-editable. */
  targetBatchId?: string;
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
  /** True when the proposed Batch revision changes product behavior or data. */
  hasEffectiveChanges: boolean;
  targetRevisionDigest: string;
};

export type BatchChangeBlocker = {
  kind: "EXECUTION_REQUEST" | "GOVERNED_CHANGE";
  requestLocator: string;
  title: string;
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
