import {
  createGovernedChangeRequestDigest,
  createTargetRevisionDigest,
  type BatchDefinition,
  type GovernedChangeArtifact,
} from "@batchplane/domain";
import { sha256BytesHex } from "@batchplane/digest";

import {
  getBatchDefinitionPath,
  parseBatchDefinitionYaml,
} from "./batch-definition-codec.js";
import {
  parseGovernedChangeDecisionEvidence,
  parseGovernedChangeRequestEvidence,
  parseGovernedChangeWithdrawalEvidence,
} from "./governed-change-evidence.js";
import {
  hasGovernedChangeRole,
  loadGovernedChangePolicy,
  loadGovernedChangeRoles,
} from "./governed-change-policy.js";
import { hasAuthoritativeGovernedChangeRequest } from "./governed-change-verifier.js";
import type {
  GitHubFile,
  GitHubLiteClient,
  GitHubPullRequest,
  RepoRef,
} from "./index.js";

export type ApprovedBatchRevisionBinding = {
  governedChangeId: string;
  targetRevisionDigest: string;
};

export type ApprovedBatchRevisionResult =
  | {
      controlStatus: "VERIFIED";
      approvedRevision: ApprovedBatchRevisionBinding;
      verifiedSha: string;
    }
  | {
      controlStatus: "BYPASSED";
      reasonCode: "UNAPPROVED_BATCH_REVISION";
    }
  | {
      controlStatus: "UNKNOWN";
      reasonCode: "APPROVED_BATCH_REVISION_UNAVAILABLE";
    };

export type LastApprovedBatchRevisionResult =
  | {
      batch: BatchDefinition;
      artifact?: { bytes: Uint8Array; fileName: string };
      approvedRevision: ApprovedBatchRevisionBinding;
      status: "VERIFIED";
      verifiedSha: string;
    }
  | { status: "BYPASSED" }
  | { status: "UNKNOWN" };

/**
 * Verifies the newest applicable governed Batch change against the current
 * Batch artifacts. A historical approval is never enough: its marker, digest,
 * merge result, and current lineage must all agree.
 */
export async function verifyApprovedBatchRevision({
  batchId,
  client,
  executionWorkflowSha,
  expectedRevision,
  repository,
}: {
  batchId: string;
  client: GitHubLiteClient;
  executionWorkflowSha?: string;
  expectedRevision?: ApprovedBatchRevisionBinding;
  repository: RepoRef;
}): Promise<ApprovedBatchRevisionResult> {
  try {
    const current = await loadCurrentBatchSnapshot(client, repository, batchId);
    if (
      !current ||
      !matchesExpectedCurrentRevision(current, expectedRevision)
    ) {
      return bypassed();
    }
    const candidate = (
      await loadMergedBatchCandidates(client, repository, batchId)
    )[0];
    if (
      !candidate ||
      !matchesCurrentCandidate(candidate, current, expectedRevision)
    ) {
      return bypassed();
    }
    if (
      !(await hasAuthoritativeCandidateProof(client, repository, candidate))
    ) {
      return bypassed();
    }
    if (
      !(await hasMatchingRevisionDigests({
        candidate,
        client,
        currentSha: current.sha,
        executionWorkflowSha,
        repository,
      }))
    ) {
      return bypassed();
    }

    return {
      approvedRevision: {
        governedChangeId: candidate.evidence.governedChangeId,
        targetRevisionDigest: candidate.evidence.targetRevisionDigest,
      },
      controlStatus: "VERIFIED",
      verifiedSha: candidate.pullRequest.mergeSha,
    };
  } catch {
    return {
      controlStatus: "UNKNOWN",
      reasonCode: "APPROVED_BATCH_REVISION_UNAVAILABLE",
    };
  }
}

/**
 * Finds the newest complete, historically approved Batch revision for an
 * explicit restoration request. It deliberately does not claim that a prior
 * bypass remains sticky after restoration; that evidence stays in execution
 * attempts and the remediation governed change.
 */
export async function loadLastApprovedBatchRevision({
  batchId,
  client,
  repository,
}: {
  batchId: string;
  client: GitHubLiteClient;
  repository: RepoRef;
}): Promise<LastApprovedBatchRevisionResult> {
  try {
    const candidates = await loadMergedBatchCandidates(
      client,
      repository,
      batchId,
    );

    for (const { evidence, pullRequest } of candidates) {
      const mergeSha = pullRequest.mergeSha;

      if (
        !mergeSha ||
        evidence.type === "DELETE" ||
        !(await hasAuthoritativeGovernedChangeRequest(
          client,
          repository,
          pullRequest,
          evidence,
          { propagateRequesterRoleReadFailure: true },
        )) ||
        !(await hasAuthorizedMergedDecision(
          client,
          repository,
          pullRequest,
          evidence,
        ))
      ) {
        continue;
      }

      const artifacts = await loadArtifacts(
        client,
        repository,
        evidence.artifacts,
        mergeSha,
      );
      if (
        (await createTargetRevisionDigest(artifacts)) !==
        evidence.targetRevisionDigest
      ) {
        continue;
      }

      const definitionFile = await client.getFile({
        ...repository,
        path: getBatchDefinitionPath(batchId),
        ref: mergeSha,
      });
      if (!definitionFile) continue;
      const batch = parseBatchDefinitionYaml(definitionFile.content);

      if (
        batch.batchId !== batchId ||
        batch.governedChangeId !== evidence.governedChangeId
      ) {
        continue;
      }

      const artifactPath = batch.execution?.artifactPath;
      const artifact = artifactPath
        ? await client.getFile({
            ...repository,
            path: artifactPath,
            ref: mergeSha,
          })
        : null;

      if (artifactPath && !artifact) continue;

      return {
        ...(artifact
          ? {
              artifact: {
                bytes: fileBytes(artifact),
                fileName: artifactPath!.split("/").at(-1) ?? "artifact",
              },
            }
          : {}),
        approvedRevision: {
          governedChangeId: evidence.governedChangeId,
          targetRevisionDigest: evidence.targetRevisionDigest,
        },
        batch,
        status: "VERIFIED",
        verifiedSha: mergeSha,
      };
    }

    return { status: "BYPASSED" };
  } catch {
    return { status: "UNKNOWN" };
  }
}

type MergedBatchCandidate = {
  evidence: NonNullable<ReturnType<typeof parseGovernedChangeRequestEvidence>>;
  pullRequest: GitHubPullRequest & { mergeSha: string; mergedAt: string };
};

type CurrentBatchSnapshot = {
  governedChangeId: string;
  sha: string;
};

async function loadCurrentBatchSnapshot(
  client: GitHubLiteClient,
  repository: RepoRef,
  batchId: string,
): Promise<CurrentBatchSnapshot | null> {
  const workspace = await client.getRepository(repository);
  const sha = await client.getBranchHeadSha({
    ...repository,
    branch: workspace.defaultBranch,
  });
  const definitionFile = await client.getFile({
    ...repository,
    path: getBatchDefinitionPath(batchId),
    ref: sha,
  });
  if (!definitionFile) return null;

  const definition = parseBatchDefinitionYaml(definitionFile.content);

  return definition.batchId === batchId && definition.governedChangeId
    ? { governedChangeId: definition.governedChangeId, sha }
    : null;
}

function matchesExpectedCurrentRevision(
  current: CurrentBatchSnapshot,
  expected: ApprovedBatchRevisionBinding | undefined,
): boolean {
  return (
    !expected ||
    (expected.governedChangeId === current.governedChangeId &&
      expected.targetRevisionDigest.startsWith("sha256:"))
  );
}

function matchesCurrentCandidate(
  candidate: MergedBatchCandidate,
  current: CurrentBatchSnapshot,
  expected: ApprovedBatchRevisionBinding | undefined,
): boolean {
  return (
    candidate.evidence.governedChangeId === current.governedChangeId &&
    (!expected ||
      expected.targetRevisionDigest === candidate.evidence.targetRevisionDigest)
  );
}

async function hasAuthoritativeCandidateProof(
  client: GitHubLiteClient,
  repository: RepoRef,
  candidate: MergedBatchCandidate,
): Promise<boolean> {
  return (
    (await hasAuthoritativeGovernedChangeRequest(
      client,
      repository,
      candidate.pullRequest,
      candidate.evidence,
      { propagateRequesterRoleReadFailure: true },
    )) &&
    (await hasAuthorizedMergedDecision(
      client,
      repository,
      candidate.pullRequest,
      candidate.evidence,
    ))
  );
}

async function hasMatchingRevisionDigests({
  candidate,
  client,
  currentSha,
  executionWorkflowSha,
  repository,
}: {
  candidate: MergedBatchCandidate;
  client: GitHubLiteClient;
  currentSha: string;
  executionWorkflowSha?: string;
  repository: RepoRef;
}): Promise<boolean> {
  const refs = [candidate.pullRequest.mergeSha, currentSha];
  if (executionWorkflowSha) refs.push(executionWorkflowSha);
  const digests = await Promise.all(
    refs.map(async (ref) =>
      createTargetRevisionDigest(
        await loadArtifacts(
          client,
          repository,
          candidate.evidence.artifacts,
          ref,
        ),
      ),
    ),
  );

  return digests.every(
    (digest) => digest === candidate.evidence.targetRevisionDigest,
  );
}

async function loadMergedBatchCandidates(
  client: GitHubLiteClient,
  repository: RepoRef,
  batchId: string,
): Promise<MergedBatchCandidate[]> {
  const changes = await client.listPullRequests({
    ...repository,
    state: "closed",
  });
  const candidateNumbers = changes
    .filter((pullRequest) => pullRequest.merged)
    .map((pullRequest) => pullRequest.number);
  // The list endpoint can omit merge data. Load immutable PR detail before
  // selecting lineage, rather than sorting mutable `updatedAt` metadata.
  const candidates = await Promise.all(
    candidateNumbers.map(async (pullNumber) => {
      const pullRequest = await client.getPullRequest({
        ...repository,
        pullNumber,
      });
      const evidence = pullRequest
        ? parseGovernedChangeRequestEvidence(pullRequest.body)
        : null;

      return pullRequest?.merged && evidence?.batchId === batchId
        ? { evidence, pullRequest }
        : null;
    }),
  );

  return candidates
    .filter((candidate): candidate is MergedBatchCandidate =>
      Boolean(
        candidate?.pullRequest.mergeSha && candidate.pullRequest.mergedAt,
      ),
    )
    .sort((left, right) =>
      right.pullRequest.mergedAt.localeCompare(left.pullRequest.mergedAt),
    );
}

async function hasAuthorizedMergedDecision(
  client: GitHubLiteClient,
  repository: RepoRef,
  pullRequest: { mergeSha?: string; mergedAt?: string; number: number },
  request: NonNullable<ReturnType<typeof parseGovernedChangeRequestEvidence>>,
): Promise<boolean> {
  const requestDigest = await createGovernedChangeRequestDigest(request);
  const comments = await client.listIssueComments({
    ...repository,
    issueNumber: pullRequest.number,
  });

  const decisions = await Promise.all(
    comments.map(async (comment) => {
      const decision = parseGovernedChangeDecisionEvidence(comment.body);

      if (
        decision &&
        hasMatchingDecisionRequest(decision, request, requestDigest) &&
        isUneditedPreMergeComment(comment, pullRequest.mergedAt) &&
        (await isAuthorizedDecision({
          client,
          commentAuthor: comment.author,
          decision,
          pullRequest,
          repository,
          request,
        }))
      ) {
        return { comment, decision: decision.decision } as const;
      }

      const withdrawal = parseGovernedChangeWithdrawalEvidence(comment.body);

      if (
        withdrawal &&
        withdrawal.governedChangeId === request.governedChangeId &&
        withdrawal.headRevisionSha === request.headRevisionSha &&
        withdrawal.requestDigest === requestDigest &&
        withdrawal.targetRevisionDigest === request.targetRevisionDigest &&
        comment.author === request.requester &&
        isUneditedPreMergeComment(comment, pullRequest.mergedAt)
      ) {
        return { comment, decision: "WITHDRAWN" as const };
      }

      return null;
    }),
  );
  const latest = decisions
    .filter((decision): decision is NonNullable<typeof decision> =>
      Boolean(decision),
    )
    .sort((left, right) =>
      compareCommentChronology(right.comment, left.comment),
    )[0];

  return latest?.decision === "APPROVED";
}

function hasMatchingDecisionRequest(
  decision: NonNullable<ReturnType<typeof parseGovernedChangeDecisionEvidence>>,
  request: NonNullable<ReturnType<typeof parseGovernedChangeRequestEvidence>>,
  requestDigest: string,
): boolean {
  return (
    decision.governedChangeId === request.governedChangeId &&
    decision.headRevisionSha === request.headRevisionSha &&
    decision.requestDigest === requestDigest &&
    decision.targetRevisionDigest === request.targetRevisionDigest
  );
}

async function isAuthorizedDecision({
  client,
  commentAuthor,
  decision,
  pullRequest,
  repository,
  request,
}: {
  client: GitHubLiteClient;
  commentAuthor: string;
  decision: NonNullable<ReturnType<typeof parseGovernedChangeDecisionEvidence>>;
  pullRequest: { mergeSha?: string };
  repository: RepoRef;
  request: NonNullable<ReturnType<typeof parseGovernedChangeRequestEvidence>>;
}): Promise<boolean> {
  const [policy, roles, mergedPolicy, mergedRoles] = await Promise.all([
    loadGovernedChangePolicy(
      client,
      repository,
      decision.authorizationRevisionSha,
    ),
    loadGovernedChangeRoles(
      client,
      repository,
      decision.authorizationRevisionSha,
    ),
    loadGovernedChangePolicy(client, repository, pullRequest.mergeSha ?? ""),
    loadGovernedChangeRoles(client, repository, pullRequest.mergeSha ?? ""),
  ]);
  if (
    !hasEquivalentAuthorization(
      { policy, roles },
      { policy: mergedPolicy, roles: mergedRoles },
    )
  ) {
    return false;
  }
  if (decision.decisionSource === "WORKSPACE_POLICY") {
    return (
      commentAuthor === request.requester &&
      policy.approval.mode === "AUTO_APPROVE"
    );
  }
  const requesterIsApprover = commentAuthor === request.requester;
  const approverHasRole = await hasGovernedChangeRole(
    client,
    repository,
    commentAuthor,
    roles.roles.approver,
  );

  if (!approverHasRole) return false;
  if (requesterIsApprover && policy.approval.mode === "SELF_APPROVAL_BLOCKED") {
    return false;
  }
  return true;
}

function isUneditedPreMergeComment(
  comment: { createdAt: string; updatedAt?: string },
  mergedAt: string | undefined,
): boolean {
  return (
    Boolean(comment.updatedAt) &&
    comment.createdAt === comment.updatedAt &&
    isApprovalBeforeMerge(comment.createdAt, mergedAt)
  );
}

function compareCommentChronology(
  left: { createdAt: string; id: number },
  right: { createdAt: string; id: number },
): number {
  const timestampDifference =
    Date.parse(left.createdAt) - Date.parse(right.createdAt);

  return timestampDifference || left.id - right.id;
}

function hasEquivalentAuthorization(
  left: { policy: unknown; roles: unknown },
  right: { policy: unknown; roles: unknown },
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isApprovalBeforeMerge(
  approvalCreatedAt: string,
  mergedAt: string | undefined,
): boolean {
  if (!mergedAt) return false;

  const approvalTime = Date.parse(approvalCreatedAt);
  const mergeTime = Date.parse(mergedAt);

  return (
    Number.isFinite(approvalTime) &&
    Number.isFinite(mergeTime) &&
    approvalTime <= mergeTime
  );
}

async function loadArtifacts(
  client: GitHubLiteClient,
  repository: RepoRef,
  expectedArtifacts: GovernedChangeArtifact[],
  ref: string,
): Promise<GovernedChangeArtifact[]> {
  return Promise.all(
    expectedArtifacts.map(async (artifact) => {
      const file = await client.getFile({
        ...repository,
        path: artifact.path,
        ref,
      });

      return {
        afterDigest: file ? await digestFile(file) : null,
        beforeDigest: artifact.beforeDigest,
        kind: artifact.kind,
        path: artifact.path,
      };
    }),
  );
}

async function digestFile(file: GitHubFile): Promise<string> {
  return sha256BytesHex(fileBytes(file));
}

function fileBytes(file: GitHubFile): Uint8Array {
  return file.contentBase64
    ? Uint8Array.from(atob(file.contentBase64), (value) => value.charCodeAt(0))
    : new TextEncoder().encode(file.content);
}

function bypassed(): ApprovedBatchRevisionResult {
  return { controlStatus: "BYPASSED", reasonCode: "UNAPPROVED_BATCH_REVISION" };
}
