import type {
  GovernedChangeApprovalEvidence,
  GovernedChangeRequestEvidence,
  GovernedChangeWithdrawalEvidence,
} from "@batchplane/domain";
import { governedChangeEvidenceVersion } from "@batchplane/domain";

const requestMarker = "batchplane:governed-change-request";
const decisionMarker = "batchplane:governed-change-decision";
const withdrawalMarker = "batchplane:governed-change-withdrawal";
const dispositionMarker = "batchplane:governed-change-unverified-disposition";

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
