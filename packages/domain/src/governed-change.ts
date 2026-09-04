import { createCanonicalDigest, type CanonicalValue } from "@batchplane/digest";

import type { WorkspaceApprovalMode } from "./index.js";

export const governedChangeEvidenceVersion = "batchplane.io/governed-change/v2";

export type GovernedChangeType = "REGISTER" | "CHANGE" | "DELETE";

export type GovernedChangeDecision = "APPROVED" | "REJECTED" | "WITHDRAWN";

export type GovernedChangeDecisionSource = "USER" | "WORKSPACE_POLICY";

export type GovernedChangeArtifact = {
  afterDigest: string | null;
  beforeDigest: string | null;
  kind: "ARTIFACT" | "BATCH_DEFINITION" | "WORKFLOW";
  path: string;
};

export type GovernedChangeRequestEvidence = {
  artifacts: GovernedChangeArtifact[];
  baseRevisionSha: string;
  batchId: string;
  governedChangeId: string;
  headRevisionSha: string;
  repository: string;
  requester: string;
  requestedAt: string;
  targetRevisionDigest: string;
  type: GovernedChangeType;
  version: typeof governedChangeEvidenceVersion;
  workspace: string;
};

export type GovernedChangeApprovalEvidence = {
  authorizationRevisionSha: string;
  headRevisionSha: string;
  decision: Exclude<GovernedChangeDecision, "WITHDRAWN">;
  decisionSource: GovernedChangeDecisionSource;
  governedChangeId: string;
  requestDigest: string;
  targetRevisionDigest: string;
  version: typeof governedChangeEvidenceVersion;
  rejectionReason?: string;
};

export type GovernedChangeWithdrawalEvidence = {
  headRevisionSha: string;
  decision: "WITHDRAWN";
  governedChangeId: string;
  requestDigest: string;
  targetRevisionDigest: string;
  version: typeof governedChangeEvidenceVersion;
};

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

export async function createGovernedChangeRequestDigest(
  evidence: GovernedChangeRequestEvidence,
): Promise<string> {
  return createCanonicalDigest(toRequestDigestPayload(evidence));
}

export async function createTargetRevisionDigest(
  artifacts: GovernedChangeArtifact[],
): Promise<string> {
  const resultingArtifacts = artifacts
    .filter((artifact) => artifact.afterDigest !== null)
    .map(({ afterDigest, kind, path }) => ({ afterDigest, kind, path }));

  return createCanonicalDigest({
    artifacts: sortArtifacts(resultingArtifacts),
    resultingState: resultingArtifacts.length === 0 ? "EMPTY" : "PRESENT",
    version: governedChangeEvidenceVersion,
  });
}

function toRequestDigestPayload(
  evidence: GovernedChangeRequestEvidence,
): CanonicalValue {
  return {
    artifacts: sortArtifacts(evidence.artifacts).map(toArtifactDigestPayload),
    baseRevisionSha: evidence.baseRevisionSha,
    batchId: evidence.batchId,
    governedChangeId: evidence.governedChangeId,
    headRevisionSha: evidence.headRevisionSha,
    repository: evidence.repository,
    requester: evidence.requester,
    requestedAt: evidence.requestedAt,
    targetRevisionDigest: evidence.targetRevisionDigest,
    type: evidence.type,
    version: evidence.version,
    workspace: evidence.workspace,
  };
}

function toArtifactDigestPayload(
  artifact: GovernedChangeArtifact,
): CanonicalValue {
  return {
    afterDigest: artifact.afterDigest,
    beforeDigest: artifact.beforeDigest,
    kind: artifact.kind,
    path: artifact.path,
  };
}

function sortArtifacts<T extends { path: string }>(artifacts: T[]): T[] {
  return [...artifacts].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );
}
