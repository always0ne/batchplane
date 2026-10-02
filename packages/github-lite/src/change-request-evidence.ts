import { createCanonicalDigest, type CanonicalValue } from "@batchplane/digest";
import type {
  ChangeRequestDecision,
  ChangeRequestDecisionSource,
  ChangeRequestType,
} from "@batchplane/domain";

export const changeRequestEvidenceVersion = "batchplane.io/governed-change/v2";

export type ChangeRequestArtifact = {
  afterDigest: string | null;
  beforeDigest: string | null;
  kind: "ARTIFACT" | "BATCH_DEFINITION" | "WORKFLOW";
  path: string;
};

export type ChangeRequestEvidence = {
  artifacts: ChangeRequestArtifact[];
  baseRevisionSha: string;
  batchId: string;
  governedChangeId: string;
  headRevisionSha: string;
  repository: string;
  requester: string;
  requestedAt: string;
  remediation?: "REVIEW_CURRENT" | "RESTORE_LAST_APPROVED";
  targetRevisionDigest: string;
  type: ChangeRequestType;
  version: typeof changeRequestEvidenceVersion;
  workspace: string;
};

export type ChangeRequestApprovalEvidence = {
  authorizationRevisionSha: string;
  headRevisionSha: string;
  decision: Exclude<ChangeRequestDecision, "WITHDRAWN">;
  decisionSource: ChangeRequestDecisionSource;
  governedChangeId: string;
  requestDigest: string;
  targetRevisionDigest: string;
  version: typeof changeRequestEvidenceVersion;
  rejectionReason?: string;
};

export type ChangeRequestWithdrawalEvidence = {
  headRevisionSha: string;
  decision: "WITHDRAWN";
  governedChangeId: string;
  requestDigest: string;
  targetRevisionDigest: string;
  version: typeof changeRequestEvidenceVersion;
};

const requestMarker = "batchplane:governed-change-request";
const decisionMarker = "batchplane:governed-change-decision";
const withdrawalMarker = "batchplane:governed-change-withdrawal";
const dispositionMarker = "batchplane:governed-change-unverified-disposition";

export async function createChangeRequestDigest(
  evidence: ChangeRequestEvidence,
): Promise<string> {
  return createCanonicalDigest(toRequestDigestPayload(evidence));
}

export async function createTargetRevisionDigest(
  artifacts: ChangeRequestArtifact[],
): Promise<string> {
  const resultingArtifacts = artifacts
    .filter((artifact) => artifact.afterDigest !== null)
    .map(({ afterDigest, kind, path }) => ({ afterDigest, kind, path }));

  return createCanonicalDigest({
    artifacts: sortArtifacts(resultingArtifacts),
    resultingState: resultingArtifacts.length === 0 ? "EMPTY" : "PRESENT",
    version: changeRequestEvidenceVersion,
  });
}

export type UnverifiedChangeRequestDisposition = {
  decision: "REJECTED_UNVERIFIED" | "WITHDRAWN_UNVERIFIED";
  reason?: string;
  requestLocator: string;
  version: "batchplane.io/governed-change/v2";
};

export function buildChangeRequestBody(
  evidence: ChangeRequestEvidence,
): string {
  return [
    "## BatchPlane Change Request",
    "",
    `- Change: \`${evidence.governedChangeId}\``,
    `- Batch: \`${evidence.batchId}\``,
    `- Type: ${evidence.type}`,
    `- Requester: @${evidence.requester}`,
    "",
    "<!--",
    `${requestMarker}`,
    serializeEvidence(evidence),
    "-->",
  ].join("\n");
}

export function buildChangeRequestDecisionBody(
  evidence: ChangeRequestApprovalEvidence,
  reason?: string,
): string {
  const rejectionReason = evidence.rejectionReason ?? reason?.trim();
  const serializedEvidence = rejectionReason
    ? { ...evidence, rejectionReason }
    : evidence;

  return [
    "## BatchPlane Change Request Decision",
    "",
    `- Change: \`${evidence.governedChangeId}\``,
    `- Decision: ${evidence.decision}`,
    `- Source: ${evidence.decisionSource}`,
    ...(rejectionReason ? [`- Reason: ${rejectionReason}`] : []),
    "",
    "<!--",
    `${decisionMarker}`,
    serializeEvidence(serializedEvidence),
    "-->",
  ].join("\n");
}

export function buildChangeRequestWithdrawalBody(
  evidence: ChangeRequestWithdrawalEvidence,
): string {
  return [
    "## BatchPlane Change Request Withdrawal",
    "",
    `- Change: \`${evidence.governedChangeId}\``,
    "",
    "<!--",
    `${withdrawalMarker}`,
    serializeEvidence(evidence),
    "-->",
  ].join("\n");
}

export function buildUnverifiedChangeRequestDispositionBody(
  evidence: UnverifiedChangeRequestDisposition,
): string {
  return [
    "## BatchPlane Change Request Disposition",
    "",
    `- Decision: ${evidence.decision}`,
    ...(evidence.reason ? [`- Reason: ${evidence.reason}`] : []),
    "",
    "<!--",
    `${dispositionMarker}`,
    serializeEvidence(evidence),
    "-->",
  ].join("\n");
}

export function parseChangeRequestEvidence(
  body: string,
): ChangeRequestEvidence | null {
  const evidence = parseEvidence(body, requestMarker);

  if (!isChangeRequestEvidence(evidence)) {
    return null;
  }

  return evidence;
}

export function parseChangeRequestDecisionEvidence(
  body: string,
): ChangeRequestApprovalEvidence | null {
  const evidence = parseEvidence(body, decisionMarker);

  if (!isChangeRequestDecisionEvidence(evidence)) {
    return null;
  }

  return evidence;
}

export function parseChangeRequestWithdrawalEvidence(
  body: string,
): ChangeRequestWithdrawalEvidence | null {
  const evidence = parseEvidence(body, withdrawalMarker);

  return isChangeRequestWithdrawalEvidence(evidence) ? evidence : null;
}

export function parseUnverifiedChangeRequestDisposition(
  body: string,
): UnverifiedChangeRequestDisposition | null {
  const evidence = parseEvidence(body, dispositionMarker);

  return evidence &&
    evidence.version === "batchplane.io/governed-change/v2" &&
    (evidence.decision === "REJECTED_UNVERIFIED" ||
      evidence.decision === "WITHDRAWN_UNVERIFIED") &&
    isNonBlankString(evidence.requestLocator) &&
    (evidence.reason === undefined || isNonBlankString(evidence.reason))
    ? (evidence as UnverifiedChangeRequestDisposition)
    : null;
}

function serializeEvidence(evidence: object): string {
  return JSON.stringify(evidence);
}

function parseEvidence(
  body: string,
  marker: string,
): Record<string, unknown> | null {
  const start = body.indexOf(`${marker}\n`);

  if (start < 0) {
    return null;
  }

  const jsonStart = start + marker.length + 1;
  const end = body.indexOf("\n-->", jsonStart);

  if (end < 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(body.slice(jsonStart, end));

    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function isChangeRequestEvidence(
  evidence: Record<string, unknown> | null,
): evidence is ChangeRequestEvidence {
  return Boolean(
    evidence &&
    evidence.version === changeRequestEvidenceVersion &&
    isNonBlankString(evidence.baseRevisionSha) &&
    isNonBlankString(evidence.batchId) &&
    isNonBlankString(evidence.governedChangeId) &&
    isNonBlankString(evidence.headRevisionSha) &&
    isNonBlankString(evidence.repository) &&
    isNonBlankString(evidence.requester) &&
    isNonBlankString(evidence.requestedAt) &&
    (evidence.remediation === undefined ||
      evidence.remediation === "REVIEW_CURRENT" ||
      evidence.remediation === "RESTORE_LAST_APPROVED") &&
    isNonBlankString(evidence.targetRevisionDigest) &&
    isChangeType(evidence.type) &&
    isNonBlankString(evidence.workspace) &&
    Array.isArray(evidence.artifacts) &&
    evidence.artifacts.every(isChangeRequestArtifact),
  );
}

function isChangeRequestDecisionEvidence(
  evidence: Record<string, unknown> | null,
): evidence is ChangeRequestApprovalEvidence {
  return Boolean(
    evidence &&
    evidence.version === changeRequestEvidenceVersion &&
    isNonBlankString(evidence.authorizationRevisionSha) &&
    isNonBlankString(evidence.headRevisionSha) &&
    (evidence.decision === "APPROVED" || evidence.decision === "REJECTED") &&
    (evidence.decisionSource === "USER" ||
      evidence.decisionSource === "WORKSPACE_POLICY") &&
    isNonBlankString(evidence.governedChangeId) &&
    isNonBlankString(evidence.requestDigest) &&
    isNonBlankString(evidence.targetRevisionDigest) &&
    (evidence.decision !== "REJECTED" ||
      isNonBlankString(evidence.rejectionReason)),
  );
}

function isChangeRequestWithdrawalEvidence(
  evidence: Record<string, unknown> | null,
): evidence is ChangeRequestWithdrawalEvidence {
  return Boolean(
    evidence &&
    evidence.version === changeRequestEvidenceVersion &&
    evidence.decision === "WITHDRAWN" &&
    isNonBlankString(evidence.headRevisionSha) &&
    isNonBlankString(evidence.governedChangeId) &&
    isNonBlankString(evidence.requestDigest) &&
    isNonBlankString(evidence.targetRevisionDigest),
  );
}

function isChangeRequestArtifact(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const artifact = value as Record<string, unknown>;

  return (
    isNonBlankString(artifact.path) &&
    (artifact.kind === "ARTIFACT" ||
      artifact.kind === "BATCH_DEFINITION" ||
      artifact.kind === "WORKFLOW") &&
    isDigestOrNull(artifact.beforeDigest) &&
    isDigestOrNull(artifact.afterDigest)
  );
}

function isChangeType(value: unknown): boolean {
  return value === "REGISTER" || value === "CHANGE" || value === "DELETE";
}

function isDigestOrNull(value: unknown): boolean {
  return value === null || isNonBlankString(value);
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function toRequestDigestPayload(
  evidence: ChangeRequestEvidence,
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
    ...(evidence.remediation ? { remediation: evidence.remediation } : {}),
    targetRevisionDigest: evidence.targetRevisionDigest,
    type: evidence.type,
    version: evidence.version,
    workspace: evidence.workspace,
  };
}

function toArtifactDigestPayload(
  artifact: ChangeRequestArtifact,
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
