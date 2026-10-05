import {
  authorizeManualApproval,
  resolveAutoApproval,
} from "@batchplane/domain";
import {
  createGitHubLiteClient,
  hasWorkspaceRole,
  isSameGitHubLogin,
  loadCurrentExecutionApprovalPolicy,
  type GitHubLiteClient,
} from "@batchplane/github-lite";
import type {
  ExecutionApprovalEvidence,
  ExecutionRequestEvidence,
  GateEvidence,
  GateInput,
  GateRepositoryRef,
  GateResult,
} from "./gate-types.js";

type DecisionAuthorizationContext = {
  client: GitHubLiteClient;
  repository: GateRepositoryRef;
  request: ExecutionRequestEvidence;
  approval: ExecutionApprovalEvidence;
  authorization: Awaited<ReturnType<typeof loadCurrentExecutionApprovalPolicy>>;
};

export async function verifyManualAuthorization({
  evidence,
  input,
  repository,
}: {
  evidence: GateEvidence;
  input: GateInput;
  repository: GateRepositoryRef;
}): Promise<GateResult> {
  const request = evidence.request;
  const approval = evidence.approval;
  if (!request || !approval)
    return deny(
      "EXECUTION_REQUEST_NOT_APPROVED",
      "Execution request does not have approved comment evidence.",
    );
  const evidenceFailure = verifyApprovalEvidence(request, approval, input);
  if (evidenceFailure) return evidenceFailure;

  const client = createGitHubLiteClient({
    apiBaseUrl: input.apiBaseUrl,
    fetcher: input.fetcher,
    token: input.githubToken ?? "",
  });
  try {
    const authorization = await loadCurrentExecutionApprovalPolicy(
      client,
      repository,
      input.configPath,
    );
    const context = { client, repository, request, approval, authorization };
    if (approval.approvalType === "WORKSPACE_AUTO_APPROVED")
      return await verifyAutomaticApproval(context);
    return await verifyManualApproval(context);
  } catch (error) {
    return deny(
      "WORKSPACE_AUTHORIZATION_LOOKUP_FAILED",
      `Workspace authorization lookup failed: ${toErrorMessage(error)}`,
    );
  }
}

function verifyApprovalEvidence(
  request: ExecutionRequestEvidence,
  approval: ExecutionApprovalEvidence,
  input: GateInput,
): GateResult | undefined {
  if (approval.decision !== "APPROVED")
    return deny(
      "EXECUTION_REQUEST_NOT_APPROVED",
      "Execution request does not have approved comment evidence.",
    );
  if (approval.edited)
    return deny(
      "APPROVAL_COMMENT_EDITED",
      "Execution approval comment was edited after creation.",
    );
  if (approval.commandDigest !== request.requestDigest)
    return deny(
      "REQUEST_DIGEST_MISMATCH",
      "Approval command digest does not match execution request digest.",
    );
  if (
    approval.requestDigest !== input.requestDigest ||
    approval.requestDigest !== request.requestDigest
  )
    return deny(
      "REQUEST_DIGEST_MISMATCH",
      "Execution approval digest does not match execution request digest.",
    );
  if (!approval.approver)
    return deny(
      "APPROVER_NOT_AUTHORIZED",
      "The approval comment author could not be verified.",
    );
  if (approval.approvalType === "SCHEDULE_DELEGATED")
    return deny(
      "SCHEDULE_DELEGATED_APPROVAL_NOT_SUPPORTED",
      "Delegated schedule approval evidence is historical and cannot authorize a new execution.",
    );
  return undefined;
}

async function verifyAutomaticApproval({
  client,
  repository,
  request,
  approval,
  authorization,
}: DecisionAuthorizationContext): Promise<GateResult> {
  if (
    authorization.policy.approval.mode !== "AUTO_APPROVE" ||
    approval.source !== "WORKSPACE_POLICY" ||
    approval.approvalMode !== "AUTO_APPROVE"
  ) {
    return deny(
      "WORKSPACE_AUTO_APPROVAL_NOT_ALLOWED",
      "Workspace auto-approval evidence requires AUTO_APPROVE policy mode and explicit Workspace policy evidence.",
    );
  }
  const automatic = resolveAutoApproval({
    actorHasRequesterRole:
      isSameGitHubLogin(approval.approver, request.requestedBy) &&
      (await hasWorkspaceRole(
        client,
        repository,
        request.requestedBy,
        authorization.roleMapping.roles.requester,
      )),
    approvalMode: authorization.policy.approval.mode,
  });
  if (!automatic.allowed || automatic.decisionSource !== "WORKSPACE_POLICY")
    return deny(
      "REQUESTER_NOT_AUTHORIZED",
      "Workspace auto-approval requires an eligible, verified requester.",
    );
  return {
    result: "ALLOW",
    message:
      "Execution request, Workspace auto-approval evidence, and batch policy are verified.",
  };
}

async function verifyManualApproval({
  client,
  repository,
  request,
  approval,
  authorization,
}: DecisionAuthorizationContext): Promise<GateResult> {
  const manual = authorizeManualApproval({
    actorHasApproverRole: await hasWorkspaceRole(
      client,
      repository,
      approval.approver,
      authorization.roleMapping.roles.approver,
    ),
    actorHasRequesterRole: false,
    actorIsRequester: isSameGitHubLogin(approval.approver, request.requestedBy),
    approvalMode: authorization.policy.approval.mode,
  });
  if (!manual.allowed) {
    if (manual.reason === "SELF_APPROVAL_BLOCKED")
      return deny(
        "SELF_APPROVAL_NOT_ALLOWED",
        "Requester and approver must be different users.",
      );
    return deny(
      "APPROVER_NOT_AUTHORIZED",
      `Approver @${approval.approver} is not authorized.`,
    );
  }
  return {
    result: "ALLOW",
    message:
      "Execution request, approval evidence, and batch policy are verified.",
  };
}

function deny(reasonCode: string, message: string): GateResult {
  return { result: "DENY", reasonCode, message };
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
