import { sha256BytesHex } from "@batchplane/digest";
import {
  getBatchDefinitionPath,
  parseBatchDefinitionYaml as parseGovernedBatchDefinitionYaml,
} from "./batch-definition-codec.js";
import { isCanonicalBatchId } from "./governance-schema.js";
import { hasAuthoritativeGovernedChangeRequest } from "./governed-change-verifier.js";
import { parseGovernedChangeRequestEvidence } from "./governed-change-evidence.js";
import type { GitHubBatchDefinition } from "./github-batch-definition.js";
import type {
  GitHubFile,
  GitHubLiteClient,
  GitHubPullRequest,
} from "./github-types.js";

export type DeletedBatchArchiveUnavailableReason =
  | "LEGACY_OR_MALFORMED_EVIDENCE"
  | "REQUEST_EVIDENCE_MISMATCH"
  | "REQUEST_EVIDENCE_UNVERIFIED"
  | "BASE_REVISION_UNAVAILABLE"
  | "BATCH_DEFINITION_NOT_FOUND"
  | "BATCH_DEFINITION_DIGEST_MISMATCH"
  | "BATCH_DEFINITION_MALFORMED";

export type DeletedBatchArchiveResult =
  | {
      batch: GitHubBatchDefinition;
      sourceRequest: { locator: string; number?: number; url: string };
      status: "VERIFIED";
    }
  | {
      sourceRequest: { locator: string; number?: number; url: string };
      status: "UNAVAILABLE";
      unavailableReason: DeletedBatchArchiveUnavailableReason;
    };

type DeletedBatchArchiveSourceRequest =
  DeletedBatchArchiveResult["sourceRequest"];

export async function loadDeletedBatchArchive({
  baseBranch,
  batchId,
  client,
  repository,
}: {
  baseBranch: string;
  batchId: string;
  client: GitHubLiteClient;
  repository: { owner: string; repo: string };
}): Promise<DeletedBatchArchiveResult | null> {
  if (!isCanonicalBatchId(batchId)) {
    return null;
  }

  const pullRequests = await client.listPullRequests({
    ...repository,
    base: baseBranch,
    state: "closed",
  });
  const candidate = pullRequests
    .filter((pullRequest) => pullRequest.merged)
    .filter((pullRequest) => isDeleteArchiveCandidate(pullRequest, batchId))
    .sort((left, right) => right.number - left.number)[0];

  return candidate
    ? inspectDeletedBatchRequest({
        batchId,
        client,
        pullRequest: candidate,
        repository,
      })
    : null;
}

function isDeleteArchiveCandidate(
  pullRequest: GitHubPullRequest,
  batchId: string,
): boolean {
  const evidence = parseGovernedChangeRequestEvidence(pullRequest.body);

  if (evidence?.type === "DELETE" && evidence.batchId === batchId) {
    return true;
  }

  const normalizedBatchId = batchId.toLowerCase();
  const branchPrefixes = ["batchplane/delete/", "batchtrail/delete/"].map(
    (prefix) => `${prefix}${normalizedBatchId}-`,
  );

  return (
    branchPrefixes.some((prefix) =>
      pullRequest.head.toLowerCase().startsWith(prefix),
    ) ||
    pullRequest.title.trim().toLowerCase() ===
      `delete batch ${normalizedBatchId}`
  );
}

async function inspectDeletedBatchRequest({
  batchId,
  client,
  pullRequest,
  repository,
}: {
  batchId: string;
  client: GitHubLiteClient;
  pullRequest: GitHubPullRequest;
  repository: { owner: string; repo: string };
}): Promise<DeletedBatchArchiveResult> {
  const sourceRequest = toDeletedArchiveSourceRequest(pullRequest);
  const evidence = parseGovernedChangeRequestEvidence(pullRequest.body);

  if (!evidence) {
    return createUnavailableDeletedBatchArchive(
      sourceRequest,
      "LEGACY_OR_MALFORMED_EVIDENCE",
    );
  }

  const definitionPath = getBatchDefinitionPath(batchId);
  const definitionArtifact = evidence.artifacts.find(
    (artifact) => artifact.kind === "BATCH_DEFINITION",
  );
  const workflowArtifact = evidence.artifacts.find(
    (artifact) => artifact.kind === "WORKFLOW",
  );

  if (
    evidence.type !== "DELETE" ||
    evidence.batchId !== batchId ||
    definitionArtifact?.path !== definitionPath ||
    definitionArtifact.beforeDigest === null ||
    definitionArtifact.afterDigest !== null ||
    !workflowArtifact
  ) {
    return createUnavailableDeletedBatchArchive(
      sourceRequest,
      "REQUEST_EVIDENCE_MISMATCH",
    );
  }

  let baseFile: GitHubFile | null;

  try {
    baseFile = await client.getFile({
      ...repository,
      path: definitionPath,
      ref: evidence.baseRevisionSha,
    });
  } catch {
    return createUnavailableDeletedBatchArchive(
      sourceRequest,
      "BASE_REVISION_UNAVAILABLE",
    );
  }

  if (!baseFile) {
    return createUnavailableDeletedBatchArchive(
      sourceRequest,
      "BATCH_DEFINITION_NOT_FOUND",
    );
  }

  if ((await digestGitHubFile(baseFile)) !== definitionArtifact.beforeDigest) {
    return createUnavailableDeletedBatchArchive(
      sourceRequest,
      "BATCH_DEFINITION_DIGEST_MISMATCH",
    );
  }

  let batch: GitHubBatchDefinition;

  try {
    batch = parseGovernedBatchDefinitionYaml(baseFile.content);
  } catch {
    return createUnavailableDeletedBatchArchive(
      sourceRequest,
      "BATCH_DEFINITION_MALFORMED",
    );
  }

  if (
    batch.batchId !== batchId ||
    batch.workflow.path !== workflowArtifact.path
  ) {
    return createUnavailableDeletedBatchArchive(
      sourceRequest,
      "BATCH_DEFINITION_MALFORMED",
    );
  }

  let requestIsVerified = false;

  try {
    requestIsVerified = await hasAuthoritativeGovernedChangeRequest(
      client,
      repository,
      pullRequest,
      evidence,
    );
  } catch {
    return createUnavailableDeletedBatchArchive(
      sourceRequest,
      "REQUEST_EVIDENCE_UNVERIFIED",
    );
  }

  return requestIsVerified
    ? { batch, sourceRequest, status: "VERIFIED" }
    : createUnavailableDeletedBatchArchive(
        sourceRequest,
        "REQUEST_EVIDENCE_UNVERIFIED",
      );
}

function toDeletedArchiveSourceRequest(
  pullRequest: GitHubPullRequest,
): DeletedBatchArchiveSourceRequest {
  return {
    locator: String(pullRequest.number),
    number: pullRequest.number,
    url: pullRequest.url,
  };
}

function createUnavailableDeletedBatchArchive(
  sourceRequest: DeletedBatchArchiveSourceRequest,
  unavailableReason: DeletedBatchArchiveUnavailableReason,
): DeletedBatchArchiveResult {
  return {
    sourceRequest,
    status: "UNAVAILABLE",
    unavailableReason,
  };
}

async function digestGitHubFile(file: GitHubFile): Promise<string> {
  return sha256BytesHex(getGitHubFileBytes(file));
}

function getGitHubFileBytes(
  file: Pick<GitHubFile, "content" | "contentBase64">,
): Uint8Array {
  if (file.contentBase64 !== undefined) {
    return Uint8Array.from(atob(file.contentBase64), (character) =>
      character.charCodeAt(0),
    );
  }

  return new TextEncoder().encode(file.content);
}
