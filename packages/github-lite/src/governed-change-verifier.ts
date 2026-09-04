import {
  createTargetRevisionDigest,
  type GovernedChangeArtifact,
  type GovernedChangeRequestEvidence,
} from "@batchplane/domain";
import { sha256BytesHex } from "@batchplane/digest";

import {
  assertCanonicalBatchId,
  getBatchDefinitionPath,
  getBatchWorkflowPath,
  parseBatchDefinitionYaml,
} from "./batch-definition-codec.js";
import {
  hasGovernedChangeRole,
  loadGovernedChangeRoles,
} from "./governed-change-policy.js";
import type {
  GitHubFile,
  GitHubLiteClient,
  GitHubPullRequest,
  RepoRef,
} from "./index.js";

export async function hasAuthoritativeGovernedChangeRequest(
  client: GitHubLiteClient,
  repository: RepoRef,
  pullRequest: GitHubPullRequest,
  evidence: GovernedChangeRequestEvidence | null,
): Promise<boolean> {
  if (!hasMatchingRequestMetadata(repository, pullRequest, evidence)) {
    return false;
  }

  const request = evidence;

  if (!isValidVerifiedBatchId(request.batchId)) {
    return false;
  }

  try {
    const roleMapping = await loadGovernedChangeRoles(
      client,
      repository,
      request.baseRevisionSha,
    );
    const authorHasRequesterRole = await hasGovernedChangeRole(
      client,
      repository,
      pullRequest.author,
      roleMapping.roles.requester,
    );

    if (!authorHasRequesterRole) return false;
  } catch {
    return false;
  }

  const [pullRequestFiles, actualArtifacts, definitionMatches] =
    await Promise.all([
      client.listPullRequestFiles({
        ...repository,
        pullNumber: pullRequest.number,
      }),
      loadActualArtifacts(client, repository, pullRequest, request),
      hasMatchingDefinitionMeaning(client, repository, pullRequest, request),
    ]);
  const actualTargetDigest = await createTargetRevisionDigest(actualArtifacts);

  return (
    actualTargetDigest === request.targetRevisionDigest &&
    hasMatchingArtifactDigests(request.artifacts, actualArtifacts) &&
    hasExactChangedFileSet(request.artifacts, pullRequestFiles) &&
    hasMatchingBatchMeaning(request, actualArtifacts) &&
    definitionMatches
  );
}

/**
 * GitHub cannot atomically compare the default branch and merge this pull
 * request through the API used here. Callers use this immediately before an
 * approval projection and immediately before merge; a subsequent GitHub-side
 * race remains possible and is intentionally not represented as a lock.
 */
export async function hasChangedGovernedChangeBase(
  client: GitHubLiteClient,
  repository: RepoRef,
  evidence: GovernedChangeRequestEvidence,
): Promise<boolean> {
  const workspace = await client.getRepository(repository);
  const currentBaseRevisionSha = await client.getBranchHeadSha({
    ...repository,
    branch: workspace.defaultBranch,
  });

  if (currentBaseRevisionSha === evidence.baseRevisionSha) return false;

  const currentDigests = await Promise.all(
    evidence.artifacts.map(async (artifact) => {
      const file = await client.getFile({
        ...repository,
        path: artifact.path,
        ref: currentBaseRevisionSha,
      });

      return {
        beforeDigest: artifact.beforeDigest,
        currentDigest: file ? await digestFile(file) : null,
      };
    }),
  );

  return currentDigests.some(
    ({ beforeDigest, currentDigest }) => beforeDigest !== currentDigest,
  );
}

function isValidVerifiedBatchId(batchId: string): boolean {
  try {
    assertCanonicalBatchId(batchId);
    return true;
  } catch {
    return false;
  }
}

function hasMatchingRequestMetadata(
  repository: RepoRef,
  pullRequest: GitHubPullRequest,
  evidence: GovernedChangeRequestEvidence | null,
): evidence is GovernedChangeRequestEvidence {
  return Boolean(
    evidence &&
    pullRequest.headSha &&
    pullRequest.baseSha &&
    pullRequest.createdAt &&
    evidence.repository === `${repository.owner}/${repository.repo}` &&
    evidence.workspace === `${repository.owner}/${repository.repo}` &&
    evidence.requester === pullRequest.author &&
    evidence.requestedAt === pullRequest.createdAt &&
    evidence.baseRevisionSha === pullRequest.baseSha &&
    evidence.headRevisionSha === pullRequest.headSha,
  );
}

async function loadActualArtifacts(
  client: GitHubLiteClient,
  repository: RepoRef,
  pullRequest: GitHubPullRequest,
  evidence: GovernedChangeRequestEvidence,
): Promise<GovernedChangeArtifact[]> {
  return Promise.all(
    evidence.artifacts.map(async (artifact) => {
      const [baseFile, headFile] = await Promise.all([
        client.getFile({
          ...repository,
          path: artifact.path,
          ref: evidence.baseRevisionSha,
        }),
        client.getFile({
          ...repository,
          path: artifact.path,
          ref: pullRequest.headSha!,
        }),
      ]);

      return {
        afterDigest: headFile ? await digestFile(headFile) : null,
        beforeDigest: baseFile ? await digestFile(baseFile) : null,
        kind: artifact.kind,
        path: artifact.path,
      };
    }),
  );
}

async function hasMatchingDefinitionMeaning(
  client: GitHubLiteClient,
  repository: RepoRef,
  pullRequest: GitHubPullRequest,
  evidence: GovernedChangeRequestEvidence,
): Promise<boolean> {
  const definitionPath = getBatchDefinitionPath(evidence.batchId);
  const [baseFile, headFile] = await Promise.all([
    client.getFile({
      ...repository,
      path: definitionPath,
      ref: evidence.baseRevisionSha,
    }),
    client.getFile({
      ...repository,
      path: definitionPath,
      ref: pullRequest.headSha!,
    }),
  ]);

  try {
    const baseDefinition = baseFile
      ? parseBatchDefinitionYaml(baseFile.content)
      : null;
    const headDefinition = headFile
      ? parseBatchDefinitionYaml(headFile.content)
      : null;
    const definition =
      evidence.type === "DELETE" ? baseDefinition : headDefinition;
    const definitionArtifacts = evidence.artifacts.filter(
      (artifact) => artifact.kind === "BATCH_DEFINITION",
    );
    const workflowArtifacts = evidence.artifacts.filter(
      (artifact) => artifact.kind === "WORKFLOW",
    );
    const artifactPaths = evidence.artifacts
      .filter((artifact) => artifact.kind === "ARTIFACT")
      .map((artifact) => artifact.path);
    const allowedArtifactPaths = new Set(
      [
        baseDefinition?.execution?.artifactPath,
        headDefinition?.execution?.artifactPath,
      ].filter((path): path is string => Boolean(path)),
    );
    const uniqueArtifactKeys = new Set(
      evidence.artifacts.map(
        (artifact) => `${artifact.kind}\u0000${artifact.path}`,
      ),
    );

    return (
      definition !== null &&
      definitionArtifacts.length === 1 &&
      workflowArtifacts.length === 1 &&
      uniqueArtifactKeys.size === evidence.artifacts.length &&
      definition.batchId === evidence.batchId &&
      definitionArtifacts[0]?.path === definitionPath &&
      definition.workflow.path === getBatchWorkflowPath(evidence.batchId) &&
      workflowArtifacts[0]?.path === definition.workflow.path &&
      artifactPaths.every((path) => allowedArtifactPaths.has(path)) &&
      (evidence.type === "DELETE" ||
        definition.governedChangeId === evidence.governedChangeId)
    );
  } catch {
    return false;
  }
}

function hasMatchingArtifactDigests(
  expected: GovernedChangeArtifact[],
  actual: GovernedChangeArtifact[],
): boolean {
  return (
    expected.length === actual.length &&
    expected.every((artifact) => {
      const current = actual.find(
        (candidate) =>
          candidate.kind === artifact.kind && candidate.path === artifact.path,
      );

      return (
        current?.beforeDigest === artifact.beforeDigest &&
        current.afterDigest === artifact.afterDigest
      );
    })
  );
}

function hasExactChangedFileSet(
  artifacts: GovernedChangeArtifact[],
  files: Awaited<ReturnType<GitHubLiteClient["listPullRequestFiles"]>>,
): boolean {
  const expected = artifacts
    .filter((artifact) => artifact.beforeDigest !== artifact.afterDigest)
    .map(toExpectedFileChange)
    .sort(compareFileChanges);
  const actual = files
    .flatMap((file) =>
      file.status === "renamed" && file.previousPath
        ? [
            { path: file.previousPath, status: "removed" as const },
            { path: file.path, status: "added" as const },
          ]
        : [{ path: file.path, status: normalizeFileStatus(file.status) }],
    )
    .sort(compareFileChanges);

  return (
    expected.every(
      (change, index) =>
        change.path === actual[index]?.path &&
        change.status === actual[index]?.status,
    ) && expected.length === actual.length
  );
}

function toExpectedFileChange(artifact: GovernedChangeArtifact) {
  return {
    path: artifact.path,
    status:
      artifact.beforeDigest === null
        ? ("added" as const)
        : artifact.afterDigest === null
          ? ("removed" as const)
          : ("modified" as const),
  };
}

function normalizeFileStatus(
  status: Awaited<
    ReturnType<GitHubLiteClient["listPullRequestFiles"]>
  >[number]["status"],
): "added" | "modified" | "removed" | "renamed" {
  if (status === "added" || status === "removed" || status === "renamed") {
    return status;
  }

  return "modified";
}

function compareFileChanges(
  left: { path: string; status: string },
  right: { path: string; status: string },
): number {
  return left.path === right.path
    ? left.status.localeCompare(right.status)
    : left.path.localeCompare(right.path);
}

function hasMatchingBatchMeaning(
  evidence: GovernedChangeRequestEvidence,
  artifacts: GovernedChangeArtifact[],
): boolean {
  const definition = artifacts.find(
    (artifact) => artifact.kind === "BATCH_DEFINITION",
  );
  const workflow = artifacts.find((artifact) => artifact.kind === "WORKFLOW");

  if (!definition || !workflow) return false;
  if (definition.path !== getBatchDefinitionPath(evidence.batchId))
    return false;

  return evidence.type === "REGISTER"
    ? definition.beforeDigest === null && definition.afterDigest !== null
    : evidence.type === "DELETE"
      ? definition.beforeDigest !== null && definition.afterDigest === null
      : definition.beforeDigest !== null && definition.afterDigest !== null;
}

function digestFile(file: GitHubFile): Promise<string> {
  return sha256BytesHex(fileBytes(file));
}

function fileBytes(
  file: Pick<GitHubFile, "content" | "contentBase64">,
): Uint8Array {
  if (!file.contentBase64) return new TextEncoder().encode(file.content);

  return Uint8Array.from(atob(file.contentBase64), (character) =>
    character.charCodeAt(0),
  );
}
