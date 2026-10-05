import type { WorkspaceApprovalMode } from "./workspace-policy.js";

export type FailureFollowUpStatus =
  | "OPEN"
  | "INVESTIGATING"
  | "RESOLVED"
  | "ACCEPTED_RISK";

export type FailureFollowUpReviewDecisionValue =
  | "APPROVED"
  | "REJECTED"
  | "CHANGES_REQUESTED";

export type FailureFollowUpReviewStatus =
  | "AWAITING_REVIEW"
  | FailureFollowUpReviewDecisionValue;

export type FailureFollowUpReviewUnavailableReason =
  | "NOT_WORKSPACE_MANAGER"
  | "SELF_REVIEW_BLOCKED"
  | "ALREADY_REVIEWED"
  | "PERMISSION_UNAVAILABLE";

/** Runtime adapters calculate this capability from their authorization evidence. */
export type FailureFollowUpReviewCapability = {
  canReview: boolean;
  unavailableReason?: FailureFollowUpReviewUnavailableReason;
};

export type FailureFollowUpReviewDecision = {
  reviewId: string;
  followUpId: string;
  runId: string;
  requestId: string;
  batchId: string;
  decision: FailureFollowUpReviewDecisionValue;
  reason: string;
  reviewer: string;
  reviewedAt: string;
  approvalMode?: WorkspaceApprovalMode;
  selfReview: boolean;
};

export type FailureFollowUp = {
  followUpId: string;
  runId: string;
  requestId: string;
  batchId: string;
  status: FailureFollowUpStatus;
  reviewStatus: FailureFollowUpReviewStatus;
  reviewCapability?: FailureFollowUpReviewCapability;
  reviews: FailureFollowUpReviewDecision[];
  owner: string;
  explanation: string;
  actionTaken: string;
  author: string;
  createdAt: string;
};
