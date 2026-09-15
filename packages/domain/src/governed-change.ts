import type { WorkspaceApprovalMode } from "./workspace-policy.js";

export type GovernedChangeType = "REGISTER" | "CHANGE" | "DELETE";

export type GovernedChangeDecision = "APPROVED" | "REJECTED" | "WITHDRAWN";

export type GovernedChangeDecisionSource = "USER" | "WORKSPACE_POLICY";

export type GovernedChangeAuthorization = {
  actorHasApproverRole: boolean;
  actorHasRequesterRole: boolean;
  actorIsRequester: boolean;
  approvalMode: WorkspaceApprovalMode;
};

export type GovernedChangeAuthorizationResult =
  | { allowed: true; decisionSource?: GovernedChangeDecisionSource }
  | {
      allowed: false;
      reason:
        | "APPROVER_ROLE_REQUIRED"
        | "REQUESTER_ROLE_REQUIRED"
        | "SELF_APPROVAL_BLOCKED";
    };

export function authorizeGovernedChangeCreation(
  authorization: Pick<GovernedChangeAuthorization, "actorHasRequesterRole">,
): GovernedChangeAuthorizationResult {
  return authorization.actorHasRequesterRole
    ? { allowed: true }
    : { allowed: false, reason: "REQUESTER_ROLE_REQUIRED" };
}

export function authorizeGovernedChangeApproval(
  authorization: GovernedChangeAuthorization,
): GovernedChangeAuthorizationResult {
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

export function authorizeGovernedChangeRejection(
  authorization: Pick<GovernedChangeAuthorization, "actorHasApproverRole">,
): GovernedChangeAuthorizationResult {
  return authorization.actorHasApproverRole
    ? { allowed: true, decisionSource: "USER" }
    : { allowed: false, reason: "APPROVER_ROLE_REQUIRED" };
}

export function resolveAutoApproval(
  authorization: Pick<
    GovernedChangeAuthorization,
    "actorHasRequesterRole" | "approvalMode"
  >,
): GovernedChangeAuthorizationResult {
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
