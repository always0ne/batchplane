export type ApprovalSubjectType =
  | "BATCH_REGISTRATION"
  | "BATCH_CHANGE"
  | "EXECUTION_REQUEST"
  | "SCHEDULE_DEFINITION";

export type WorkspaceApprovalMode =
  | "SELF_APPROVAL_BLOCKED"
  | "SELF_APPROVAL_ALLOWED"
  | "AUTO_APPROVE";

export type WorkspacePolicy = {
  approval: {
    mode: WorkspaceApprovalMode;
  };
};

export const defaultWorkspacePolicy: WorkspacePolicy = {
  approval: {
    mode: "SELF_APPROVAL_BLOCKED",
  },
};

export type ApprovalDecisionValue = "APPROVED" | "REJECTED";

export type ApprovalDecision = {
  decisionId: string;
  subjectType: ApprovalSubjectType;
  subjectId: string;
  decision: ApprovalDecisionValue;
  decidedBy: string;
  decidedAt: string;
  requestDigest?: string;
  reason?: string;
};
