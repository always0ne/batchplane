import { createCanonicalDigest, type CanonicalValue } from "@batchplane/digest";
import type {
  GovernedChangeDecision,
  GovernedChangeDecisionSource,
  GovernedChangeType,
} from "@batchplane/domain";

export const governedChangeEvidenceVersion = "batchplane.io/governed-change/v2";

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
  remediation?: "REVIEW_CURRENT" | "RESTORE_LAST_APPROVED";
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

const requestMarker = "batchplane:governed-change-request";
const decisionMarker = "batchplane:governed-change-decision";
const withdrawalMarker = "batchplane:governed-change-withdrawal";
const dispositionMarker = "batchplane:governed-change-unverified-disposition";

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

export type UnverifiedGovernedChangeDisposition = {
  decision: "REJECTED_UNVERIFIED" | "WITHDRAWN_UNVERIFIED";
  reason?: string;
  requestLocator: string;
  version: "batchplane.io/governed-change/v2";
};

export function buildGovernedChangeRequestBody(
  evidence: GovernedChangeRequestEvidence,
): string {
  return [
    "## BatchPlane Governed Change",
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

export function buildGovernedChangeDecisionBody(
  evidence: GovernedChangeApprovalEvidence,
  reason?: string,
): string {
  const rejectionReason = evidence.rejectionReason ?? reason?.trim();
  const serializedEvidence = rejectionReason
    ? { ...evidence, rejectionReason }
    : evidence;

  return [
    "## BatchPlane Governed Change Decision",
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

export function buildGovernedChangeWithdrawalBody(
  evidence: GovernedChangeWithdrawalEvidence,
): string {
  return [
    "## BatchPlane Governed Change Withdrawal",
    "",
    `- Change: \`${evidence.governedChangeId}\``,
    "",
    "<!--",
    `${withdrawalMarker}`,
    serializeEvidence(evidence),
    "-->",
  ].join("\n");
}

export function buildUnverifiedGovernedChangeDispositionBody(
  evidence: UnverifiedGovernedChangeDisposition,
): string {
  return [
    "## BatchPlane Governed Change Disposition",
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

export function parseGovernedChangeRequestEvidence(
  body: string,
): GovernedChangeRequestEvidence | null {
  const evidence = parseEvidence(body, requestMarker);

  if (!isGovernedChangeRequestEvidence(evidence)) {
    return null;
  }

  return evidence;
}

export function parseGovernedChangeDecisionEvidence(
  body: string,
): GovernedChangeApprovalEvidence | null {
  const evidence = parseEvidence(body, decisionMarker);

  if (!isGovernedChangeDecisionEvidence(evidence)) {
    return null;
  }

  return evidence;
}

export function parseGovernedChangeWithdrawalEvidence(
  body: string,
): GovernedChangeWithdrawalEvidence | null {
  const evidence = parseEvidence(body, withdrawalMarker);

  return isGovernedChangeWithdrawalEvidence(evidence) ? evidence : null;
}

export function parseUnverifiedGovernedChangeDisposition(
  body: string,
): UnverifiedGovernedChangeDisposition | null {
  const evidence = parseEvidence(body, dispositionMarker);

  return evidence &&
    evidence.version === "batchplane.io/governed-change/v2" &&
    (evidence.decision === "REJECTED_UNVERIFIED" ||
      evidence.decision === "WITHDRAWN_UNVERIFIED") &&
    isNonBlankString(evidence.requestLocator) &&
    (evidence.reason === undefined || isNonBlankString(evidence.reason))
    ? (evidence as UnverifiedGovernedChangeDisposition)
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

function isGovernedChangeRequestEvidence(
  evidence: Record<string, unknown> | null,
): evidence is GovernedChangeRequestEvidence {
  return Boolean(
    evidence &&
    evidence.version === governedChangeEvidenceVersion &&
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
    evidence.artifacts.every(isGovernedChangeArtifact),
  );
}

function isGovernedChangeDecisionEvidence(
  evidence: Record<string, unknown> | null,
): evidence is GovernedChangeApprovalEvidence {
  return Boolean(
    evidence &&
    evidence.version === governedChangeEvidenceVersion &&
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

function isGovernedChangeWithdrawalEvidence(
  evidence: Record<string, unknown> | null,
): evidence is GovernedChangeWithdrawalEvidence {
  return Boolean(
    evidence &&
    evidence.version === governedChangeEvidenceVersion &&
    evidence.decision === "WITHDRAWN" &&
    isNonBlankString(evidence.headRevisionSha) &&
    isNonBlankString(evidence.governedChangeId) &&
    isNonBlankString(evidence.requestDigest) &&
    isNonBlankString(evidence.targetRevisionDigest),
  );
}

function isGovernedChangeArtifact(value: unknown): boolean {
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
    ...(evidence.remediation ? { remediation: evidence.remediation } : {}),
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
