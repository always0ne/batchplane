import type { WorkspaceApprovalMode } from "./workspace-policy.js";

export type ChangeRequestType = "REGISTER" | "CHANGE" | "DELETE";

export type ChangeRequestDecision = "APPROVED" | "REJECTED" | "WITHDRAWN";

export type ChangeRequestDecisionSource = "USER" | "WORKSPACE_POLICY";

export type ApprovalAuthorization = {
  actorHasApproverRole: boolean;
  actorHasRequesterRole: boolean;
  actorIsRequester: boolean;
  approvalMode: WorkspaceApprovalMode;
};

export type ApprovalAuthorizationResult<
  Reason extends string =
    | "APPROVER_ROLE_REQUIRED"
    | "REQUESTER_ROLE_REQUIRED"
    | "SELF_APPROVAL_BLOCKED",
> =
  | { allowed: true; decisionSource?: ChangeRequestDecisionSource }
  | {
      allowed: false;
      reason: Reason;
    };

export function authorizeChangeRequestCreation(
  authorization: Pick<ApprovalAuthorization, "actorHasRequesterRole">,
): ApprovalAuthorizationResult<"REQUESTER_ROLE_REQUIRED"> {
  return authorization.actorHasRequesterRole
    ? { allowed: true }
    : { allowed: false, reason: "REQUESTER_ROLE_REQUIRED" };
}

export function authorizeManualApproval(
  authorization: ApprovalAuthorization,
): ApprovalAuthorizationResult<
  "APPROVER_ROLE_REQUIRED" | "SELF_APPROVAL_BLOCKED"
> {
  if (!authorization.actorHasApproverRole) {
    return { allowed: false, reason: "APPROVER_ROLE_REQUIRED" };
  }

  if (
    authorization.actorIsRequester &&
    authorization.approvalMode === "SELF_APPROVAL_BLOCKED"
  ) {
    return { allowed: false, reason: "SELF_APPROVAL_BLOCKED" };
  }

  return { allowed: true, decisionSource: "USER" };
}

export function authorizeManualRejection(
  authorization: Pick<ApprovalAuthorization, "actorHasApproverRole">,
): ApprovalAuthorizationResult<"APPROVER_ROLE_REQUIRED"> {
  return authorization.actorHasApproverRole
    ? { allowed: true, decisionSource: "USER" }
    : { allowed: false, reason: "APPROVER_ROLE_REQUIRED" };
}

export function resolveAutoApproval(
  authorization: Pick<
    ApprovalAuthorization,
    "actorHasRequesterRole" | "approvalMode"
  >,
): ApprovalAuthorizationResult<"REQUESTER_ROLE_REQUIRED"> {
  if (!authorization.actorHasRequesterRole) {
    return { allowed: false, reason: "REQUESTER_ROLE_REQUIRED" };
  }

  return authorization.approvalMode === "AUTO_APPROVE"
    ? { allowed: true, decisionSource: "WORKSPACE_POLICY" }
    : { allowed: true };
}

export function validateRejectionReason(reason: string): boolean {
  return Boolean(reason.trim());
}
