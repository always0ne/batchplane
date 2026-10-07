import {
  authorizeManualApproval,
  authorizeManualRejection,
  resolveAutoApproval,
  type WorkspaceApprovalMode,
} from "@batchplane/domain";
import type {
  ExecutionRequest,
  ExecutionRequestCapability,
} from "@batchplane/ui-client";
import type { ExecutionApprovalRequest } from "./execution-approval-legacy.js";
import { isSameGitHubLogin } from "./execution-request-evidence.js";
import type { GitHubRepositoryContext } from "./github-types.js";
import {
  hasWorkspaceRole,
  loadCurrentExecutionApprovalPolicy,
} from "./workspace-authorization.js";

export type ExecutionApprovalContext = {
  actorLogin: string;
  approvalMode: WorkspaceApprovalMode;
  authorization?: Awaited<
    ReturnType<typeof loadCurrentExecutionApprovalPolicy>
  >;
  actorHasApproverRole: boolean;
  actorHasRequesterRole: boolean;
  authorizationUnavailable: boolean;
};

export async function loadExecutionApprovalContext(
  context: GitHubRepositoryContext,
): Promise<ExecutionApprovalContext> {
  const unavailable: ExecutionApprovalContext = {
    actorLogin: "",
    approvalMode: "SELF_APPROVAL_BLOCKED",
    actorHasApproverRole: false,
    actorHasRequesterRole: false,
    authorizationUnavailable: true,
  };
  try {
    const user = await context.client.getCurrentUser();
    const authorization = await loadCurrentExecutionApprovalPolicy(
      context.client,
      context.repositoryRef,
    );
    const { policy, roleMapping } = authorization;
    const [actorHasApproverRole, actorHasRequesterRole] = await Promise.all([
      hasWorkspaceRole(
        context.client,
        context.repositoryRef,
        user.login,
        roleMapping.roles.approver,
      ).catch(() => null),
      hasWorkspaceRole(
        context.client,
        context.repositoryRef,
        user.login,
        roleMapping.roles.requester,
      ).catch(() => false),
    ]);
    return {
      ...unavailable,
      authorization,
      actorLogin: user.login,
      approvalMode: policy.approval.mode,
      actorHasApproverRole: actorHasApproverRole ?? false,
      actorHasRequesterRole,
      authorizationUnavailable: actorHasApproverRole === null,
    };
  } catch {
    return unavailable;
  }
}

export function executionApprovalCapabilityFor(
  request: ExecutionApprovalRequest,
  context: ExecutionApprovalContext,
): ExecutionRequestCapability {
  const pending =
    request.triggerType !== "SCHEDULE" && request.status === "REQUESTED";
  if (!pending) {
    return {
      canApprove: false,
      canReject: false,
      approveUnavailableReason: "NOT_AWAITING_APPROVAL",
      rejectUnavailableReason: "NOT_AWAITING_APPROVAL",
    };
  }
  if (context.authorizationUnavailable) {
    return {
      canApprove: false,
      canReject: false,
      approveUnavailableReason: "AUTHORIZATION_UNAVAILABLE",
      rejectUnavailableReason: "AUTHORIZATION_UNAVAILABLE",
    };
  }
  const authorization = {
    actorHasApproverRole: context.actorHasApproverRole,
    actorHasRequesterRole: context.actorHasRequesterRole,
    actorIsRequester: isSameGitHubLogin(
      request.requestedBy,
      context.actorLogin,
    ),
    approvalMode: context.approvalMode,
  };
  const approval = authorizeManualApproval(authorization);
  const rejection = authorizeManualRejection(authorization);
  if (rejection.allowed && !request.requesterIdentityVerified) {
    return {
      canApprove: false,
      canReject: true,
      approveUnavailableReason: "REQUESTER_IDENTITY_UNVERIFIED",
    };
  }
  const capability: ExecutionRequestCapability = {
    canApprove: approval.allowed,
    canReject: rejection.allowed,
  };
  if (!approval.allowed) capability.approveUnavailableReason = approval.reason;
  if (!rejection.allowed) capability.rejectUnavailableReason = rejection.reason;
  return capability;
}

export async function executionDecisionAuthorizationFor(
  context: GitHubRepositoryContext,
  request: ExecutionApprovalRequest,
  current: ExecutionApprovalContext,
): Promise<
  NonNullable<ExecutionRequest["approvalDecision"]>["currentAuthorization"]
> {
  const decision = request.approvalDecision;
  if (!decision) return undefined;
  if (!current.authorization) return "UNAVAILABLE";
  try {
    const { policy, roleMapping } = current.authorization;
    if (decision.source === "WORKSPACE_POLICY") {
      return await automaticDecisionAuthorizationFor(
        context,
        request,
        decision.actor,
        current.authorization,
      );
    }
    const actorHasApproverRole = await hasWorkspaceRole(
      context.client,
      context.repositoryRef,
      decision.actor,
      roleMapping.roles.approver,
    );
    const authorization = {
      actorHasApproverRole,
      actorHasRequesterRole: false,
      actorIsRequester: isSameGitHubLogin(decision.actor, request.requestedBy),
      approvalMode: policy.approval.mode,
    };
    const permitted =
      decision.decision === "APPROVED"
        ? authorizeManualApproval(authorization)
        : authorizeManualRejection(authorization);
    return permitted.allowed &&
      (decision.decision === "REJECTED" || request.requesterIdentityVerified)
      ? "VERIFIED"
      : "DENIED";
  } catch {
    return "UNAVAILABLE";
  }
}

async function automaticDecisionAuthorizationFor(
  context: GitHubRepositoryContext,
  request: ExecutionApprovalRequest,
  decisionActor: string,
  authorization: NonNullable<ExecutionApprovalContext["authorization"]>,
): Promise<"VERIFIED" | "DENIED"> {
  const { policy, roleMapping } = authorization;
  // Probe policy before loading roles, preserving the existing API short circuit.
  // The final decision below uses actual requester role evidence.
  const policyApproval = resolveAutoApproval({
    actorHasRequesterRole: true,
    approvalMode: policy.approval.mode,
  });
  if (
    !policyApproval.allowed ||
    policyApproval.decisionSource !== "WORKSPACE_POLICY" ||
    !request.requesterIdentityVerified ||
    !isSameGitHubLogin(decisionActor, request.requestedBy)
  ) {
    return "DENIED";
  }
  const automatic = resolveAutoApproval({
    actorHasRequesterRole: await hasWorkspaceRole(
      context.client,
      context.repositoryRef,
      decisionActor,
      roleMapping.roles.requester,
    ),
    approvalMode: policy.approval.mode,
  });
  return automatic.allowed && automatic.decisionSource === "WORKSPACE_POLICY"
    ? "VERIFIED"
    : "DENIED";
}

export function executionApprovalNoticeFor(
  request: ExecutionApprovalRequest,
  context: ExecutionApprovalContext,
): ExecutionRequest["approvalNotice"] {
  if (
    !context.actorHasApproverRole ||
    context.authorizationUnavailable ||
    !request.requesterIdentityVerified ||
    !isSameGitHubLogin(request.requestedBy, context.actorLogin) ||
    (context.approvalMode !== "SELF_APPROVAL_ALLOWED" &&
      context.approvalMode !== "AUTO_APPROVE")
  ) {
    return undefined;
  }

  return {
    kind: "SELF_APPROVAL_ALLOWED",
    mode: context.approvalMode,
  };
}
