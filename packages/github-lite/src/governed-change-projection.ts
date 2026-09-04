import {
  authorizeGovernedChangeApproval,
  createGovernedChangeRequestDigest,
  type GovernedChangeRequestEvidence,
  type RoleMapping,
  type WorkspacePolicy,
} from "@batchplane/domain";
import { sha256BytesHex } from "@batchplane/digest";
import type {
  GovernedChangeDetail,
  GovernedChangePreviewFile,
  GovernedChangeRequest,
} from "@batchplane/ui-client";

import {
  parseGovernedChangeDecisionEvidence,
  parseGovernedChangeRequestEvidence,
  parseGovernedChangeWithdrawalEvidence,
  parseUnverifiedGovernedChangeDisposition,
  type GitHubIssueComment,
  type GitHubLiteClient,
  type GitHubPullRequest,
  type RepoRef,
} from "./index.js";
import {
  hasGovernedChangeRole,
  loadGovernedChangePolicy,
  loadGovernedChangeRoles,
} from "./governed-change-policy.js";
import {
  hasAuthoritativeGovernedChangeRequest,
  hasChangedGovernedChangeBase,
} from "./governed-change-verifier.js";

function fileBytes(file: {
  content: string;
  contentBase64?: string;
}): Uint8Array {
  if (!file.contentBase64) return new TextEncoder().encode(file.content);

  return Uint8Array.from(atob(file.contentBase64), (character) =>
    character.charCodeAt(0),
  );
}

function bytesEqual(
  left: Uint8Array | undefined,
  right: Uint8Array | undefined,
): boolean {
  return Boolean(
    left &&
    right &&
    left.length === right.length &&
    left.every((value, index) => value === right[index]),
  );
}

export async function loadGovernedChangeDetail(
  client: GitHubLiteClient,
  repository: RepoRef,
  pullRequest: GitHubPullRequest,
): Promise<GovernedChangeDetail> {
  const comments = await client.listIssueComments({
    ...repository,
    issueNumber: pullRequest.number,
  });
  const evidence = parseGovernedChangeRequestEvidence(pullRequest.body);
  const requestIsVerified = evidence
    ? await hasAuthoritativeGovernedChangeRequest(
        client,
        repository,
        pullRequest,
        evidence,
      )
    : false;
  const staleBase = Boolean(
    evidence &&
    requestIsVerified &&
    pullRequest.state === "open" &&
    (await hasChangedGovernedChangeBase(client, repository, evidence)),
  );
  const staleApproval = Boolean(
    evidence &&
    evidence.headRevisionSha !== pullRequest.headSha &&
    (await hasStaleApprovedDecision(
      client,
      repository,
      pullRequest,
      comments,
      evidence,
      await createGovernedChangeRequestDigest(evidence),
    )),
  );
  const request = await toGovernedChangeRequest(
    client,
    repository,
    pullRequest,
    requestIsVerified && !staleBase ? evidence : null,
    comments,
    Boolean(evidence),
    staleApproval,
    staleBase,
  );
  const [files, capabilities] = await Promise.all([
    loadActualGovernedFiles(
      client,
      repository,
      pullRequest,
      requestIsVerified && !staleBase ? evidence : null,
    ),
    loadGovernedChangeCapabilities(client, repository, pullRequest, request),
  ]);

  return {
    ...request,
    ...capabilities,
    files,
  };
}

async function loadActualGovernedFiles(
  client: GitHubLiteClient,
  repository: RepoRef,
  pullRequest: GitHubPullRequest,
  evidence: GovernedChangeRequestEvidence | null,
): Promise<GovernedChangePreviewFile[]> {
  if (!pullRequest.headSha) return [];

  if (!evidence) {
    const files = await client.listPullRequestFiles({
      ...repository,
      pullNumber: pullRequest.number,
    });

    return files.map((file) => ({
      contentKind: "TEXT" as const,
      evidenceUnavailable: true,
      path: file.path,
      status:
        file.status === "added"
          ? "ADDED"
          : file.status === "removed"
            ? "DELETED"
            : "MODIFIED",
    }));
  }

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
          ref: pullRequest.headSha,
        }),
      ]);

      const baseBytes = baseFile ? fileBytes(baseFile) : undefined;
      const headBytes = headFile ? fileBytes(headFile) : undefined;
      const isBinary = artifact.kind === "ARTIFACT";

      return {
        ...(isBinary
          ? {
              afterDigest: headBytes ? await sha256BytesHex(headBytes) : null,
              beforeDigest: baseBytes ? await sha256BytesHex(baseBytes) : null,
              contentKind: "BINARY" as const,
            }
          : {
              baseContent: baseFile?.content ?? "",
              contentKind: "TEXT" as const,
              nextContent: headFile?.content ?? "",
            }),
        path: artifact.path,
        status: !baseFile
          ? "ADDED"
          : !headFile
            ? "DELETED"
            : bytesEqual(baseBytes, headBytes)
              ? "UNCHANGED"
              : "MODIFIED",
      };
    }),
  );
}

async function loadGovernedChangeCapabilities(
  client: GitHubLiteClient,
  repository: RepoRef,
  pullRequest: GitHubPullRequest,
  request: GovernedChangeRequest,
): Promise<
  Pick<
    GovernedChangeDetail,
    "canApprove" | "canApplyApprovedChange" | "canReject" | "canWithdraw"
  >
> {
  const actor = await client.getCurrentUser();
  const canWithdraw =
    pullRequest.state === "open" && actor.login === pullRequest.author;

  let policy: WorkspacePolicy;
  let roleMapping: RoleMapping;

  try {
    ({ policy, roleMapping } = await loadCurrentWorkspaceAuthorization(
      client,
      repository,
    ));
  } catch {
    // A request must remain readable even when its current Workspace policy is absent.
    return {
      canApplyApprovedChange: false,
      canApprove: false,
      canReject: false,
      canWithdraw,
    };
  }
  const actorHasApproverRole = await hasGovernedChangeRole(
    client,
    repository,
    actor.login,
    roleMapping.roles.approver,
  );
  const approval = authorizeGovernedChangeApproval({
    actorHasApproverRole,
    actorHasRequesterRole: await hasGovernedChangeRole(
      client,
      repository,
      actor.login,
      roleMapping.roles.requester,
    ),
    actorIsRequester: actor.login === request.requester,
    approvalMode: policy.approval.mode,
  });

  const canApplyApprovedChange =
    request.reviewState === "APPROVED_PENDING_MERGE" &&
    request.evidence.kind === "VERIFIED_V2" &&
    approval.allowed;

  if (
    request.reviewState !== "OPEN" &&
    request.reviewState !== "REAPPROVAL_REQUIRED" &&
    request.reviewState !== "LEGACY_UNAPPROVABLE"
  ) {
    return {
      canApplyApprovedChange,
      canApprove: false,
      canReject: false,
      canWithdraw,
    };
  }

  return {
    canApplyApprovedChange,
    canApprove: request.reviewState === "OPEN" && approval.allowed,
    canReject: actorHasApproverRole,
    canWithdraw,
  };
}

async function toGovernedChangeRequest(
  client: GitHubLiteClient,
  repository: RepoRef,
  pullRequest: GitHubPullRequest,
  evidence: GovernedChangeRequestEvidence | null,
  comments: GitHubIssueComment[],
  hasV2Candidate = Boolean(evidence),
  staleApproval = false,
  staleBase = false,
): Promise<GovernedChangeRequest> {
  const requestDigest = evidence
    ? await createGovernedChangeRequestDigest(evidence)
    : undefined;
  const decision =
    evidence && requestDigest
      ? await findVerifiedDecision(
          client,
          repository,
          pullRequest,
          comments,
          evidence,
          requestDigest,
        )
      : undefined;
  const withdrawal =
    evidence && requestDigest
      ? await findVerifiedWithdrawal(
          client,
          repository,
          pullRequest,
          comments,
          evidence,
          requestDigest,
        )
      : undefined;
  const unverifiedDisposition = await findUnverifiedDisposition(
    client,
    repository,
    pullRequest,
    comments,
  );
  const unverifiedDispositionDecision = unverifiedDisposition
    ? parseUnverifiedGovernedChangeDisposition(unverifiedDisposition.body)
        ?.decision
    : undefined;
  const reviewState = resolveGovernedChangeReviewState({
    decision,
    evidence,
    hasV2Candidate,
    pullRequest,
    staleApproval,
    staleBase,
    unverifiedDisposition,
    unverifiedDispositionDecision,
    withdrawal,
  });
  const evidenceView = resolveEvidenceView({
    hasV2Candidate,
    staleApproval,
    staleBase,
    unverifiedDispositionDecision,
  });

  const requestBase = {
    batchId: evidence?.batchId ?? "",
    ...(decision
      ? {
          decision: {
            ...(decision.evidence.decisionSource === "USER"
              ? { actor: decision.actor }
              : {}),
            decidedAt: decision.createdAt,
            decision: decision.evidence.decision,
            source: decision.evidence.decisionSource,
          },
        }
      : {}),
    mode: evidence?.type ?? "CHANGE",
    requestLocator: String(pullRequest.number),
    requester: evidence?.requester ?? pullRequest.author,
    reviewState,
    sourceLabel: `#${pullRequest.number}`,
    sourceUrl: pullRequest.url,
    title: pullRequest.title,
    ...(decision?.evidence.rejectionReason || unverifiedDisposition?.body
      ? {
          rejectionReason:
            decision?.evidence.rejectionReason ??
            parseUnverifiedGovernedChangeDisposition(
              unverifiedDisposition!.body,
            )?.reason,
        }
      : {}),
  };

  if (evidence) {
    return {
      ...requestBase,
      evidence: {
        governedChangeId: evidence.governedChangeId,
        kind: "VERIFIED_V2",
        requestDigest: requestDigest!,
        targetRevisionDigest: evidence.targetRevisionDigest,
      },
    };
  }

  return {
    ...requestBase,
    evidence: evidenceView,
  };
}

function resolveGovernedChangeReviewState({
  decision,
  evidence,
  hasV2Candidate,
  pullRequest,
  staleApproval,
  staleBase,
  unverifiedDisposition,
  unverifiedDispositionDecision,
  withdrawal,
}: {
  decision: Awaited<ReturnType<typeof findVerifiedDecision>>;
  evidence: GovernedChangeRequestEvidence | null;
  hasV2Candidate: boolean;
  pullRequest: GitHubPullRequest;
  staleApproval: boolean;
  staleBase: boolean;
  unverifiedDisposition: GitHubIssueComment | undefined;
  unverifiedDispositionDecision:
    | "REJECTED_UNVERIFIED"
    | "WITHDRAWN_UNVERIFIED"
    | undefined;
  withdrawal: Awaited<ReturnType<typeof findVerifiedWithdrawal>>;
}): GovernedChangeRequest["reviewState"] {
  if (!evidence) {
    return resolveUnverifiedReviewState({
      hasV2Candidate,
      pullRequest,
      unverifiedDisposition,
      unverifiedDispositionDecision,
    });
  }
  if (pullRequest.merged) return "MERGED";
  if (staleApproval || staleBase) return "REAPPROVAL_REQUIRED";
  if (
    decision?.evidence.decision === "REJECTED" &&
    pullRequest.state === "closed"
  ) {
    return "REJECTED";
  }
  if (withdrawal && pullRequest.state === "closed") return "WITHDRAWN";
  if (pullRequest.state === "open") {
    return decision?.evidence.decision === "APPROVED"
      ? "APPROVED_PENDING_MERGE"
      : "OPEN";
  }
  if (decision?.evidence.decision === "REJECTED" || withdrawal) {
    return "REAPPROVAL_REQUIRED";
  }

  return "CLOSED";
}

function resolveUnverifiedReviewState({
  hasV2Candidate,
  pullRequest,
  unverifiedDisposition,
  unverifiedDispositionDecision,
}: {
  hasV2Candidate: boolean;
  pullRequest: GitHubPullRequest;
  unverifiedDisposition: GitHubIssueComment | undefined;
  unverifiedDispositionDecision:
    | "REJECTED_UNVERIFIED"
    | "WITHDRAWN_UNVERIFIED"
    | undefined;
}): GovernedChangeRequest["reviewState"] {
  if (hasV2Candidate) {
    if (pullRequest.state === "closed" && unverifiedDispositionDecision) {
      return unverifiedDispositionDecision === "WITHDRAWN_UNVERIFIED"
        ? "WITHDRAWN"
        : "REJECTED";
    }
    return "REAPPROVAL_REQUIRED";
  }
  if (pullRequest.state === "open") return "LEGACY_UNAPPROVABLE";
  if (unverifiedDisposition?.body.includes("WITHDRAWN_UNVERIFIED")) {
    return "WITHDRAWN";
  }
  if (unverifiedDisposition) return "REJECTED";

  return "CLOSED";
}

function resolveEvidenceView({
  hasV2Candidate,
  staleApproval,
  staleBase,
  unverifiedDispositionDecision,
}: {
  hasV2Candidate: boolean;
  staleApproval: boolean;
  staleBase: boolean;
  unverifiedDispositionDecision:
    | "REJECTED_UNVERIFIED"
    | "WITHDRAWN_UNVERIFIED"
    | undefined;
}) {
  if (staleApproval) {
    return {
      kind: "REAPPROVAL_REQUIRED" as const,
      reason: "STALE_HEAD" as const,
    };
  }
  if (staleBase) {
    return {
      kind: "REAPPROVAL_REQUIRED" as const,
      reason: "STALE_BASE" as const,
    };
  }
  if (hasV2Candidate && unverifiedDispositionDecision) {
    return {
      decision:
        unverifiedDispositionDecision === "WITHDRAWN_UNVERIFIED"
          ? ("WITHDRAWN" as const)
          : ("REJECTED" as const),
      kind: "UNVERIFIED_DISPOSITION" as const,
    };
  }
  if (hasV2Candidate) {
    return {
      kind: "REAPPROVAL_REQUIRED" as const,
      reason: "UNVERIFIED_REQUEST" as const,
    };
  }

  return { kind: "LEGACY_UNAPPROVABLE" as const };
}

async function hasStaleApprovedDecision(
  client: GitHubLiteClient,
  repository: RepoRef,
  pullRequest: GitHubPullRequest,
  comments: GitHubIssueComment[],
  request: GovernedChangeRequestEvidence,
  requestDigest: string,
): Promise<boolean> {
  for (const comment of comments) {
    const evidence = parseGovernedChangeDecisionEvidence(comment.body);

    if (
      !evidence ||
      !isImmutableComment(comment) ||
      evidence.decision !== "APPROVED" ||
      evidence.headRevisionSha === pullRequest.headSha ||
      evidence.governedChangeId !== request.governedChangeId ||
      evidence.requestDigest !== requestDigest ||
      evidence.targetRevisionDigest !== request.targetRevisionDigest
    ) {
      continue;
    }

    const authorization = await loadWorkspaceAuthorizationAtRevision(
      client,
      repository,
      evidence.authorizationRevisionSha,
    ).catch(() => null);
    if (!authorization) continue;
    const { policy, roleMapping } = authorization;

    const actorHasApproverRole = await hasGovernedChangeRole(
      client,
      repository,
      comment.author,
      roleMapping.roles.approver,
    );
    const isWorkspacePolicyApproval =
      evidence.decisionSource === "WORKSPACE_POLICY" &&
      policy.approval.mode === "AUTO_APPROVE" &&
      comment.author === request.requester &&
      (await hasGovernedChangeRole(
        client,
        repository,
        comment.author,
        roleMapping.roles.requester,
      ));
    const isAuthorizedUserApproval =
      evidence.decisionSource === "USER" &&
      authorizeGovernedChangeApproval({
        actorHasApproverRole,
        actorHasRequesterRole: await hasGovernedChangeRole(
          client,
          repository,
          comment.author,
          roleMapping.roles.requester,
        ),
        actorIsRequester: comment.author === request.requester,
        approvalMode: policy.approval.mode,
      }).allowed;

    if (isWorkspacePolicyApproval || isAuthorizedUserApproval) return true;
  }

  return false;
}

async function findVerifiedWithdrawal(
  client: GitHubLiteClient,
  repository: RepoRef,
  pullRequest: GitHubPullRequest,
  comments: GitHubIssueComment[],
  request: GovernedChangeRequestEvidence,
  requestDigest: string,
) {
  const matchingComment = comments.find((comment) => {
    const evidence = parseGovernedChangeWithdrawalEvidence(comment.body);

    return Boolean(
      evidence &&
      isImmutableComment(comment) &&
      comment.author === request.requester &&
      evidence.headRevisionSha === pullRequest.headSha &&
      evidence.governedChangeId === request.governedChangeId &&
      evidence.requestDigest === requestDigest &&
      evidence.targetRevisionDigest === request.targetRevisionDigest,
    );
  });

  return matchingComment
    ? { actor: matchingComment.author, createdAt: matchingComment.createdAt }
    : undefined;
}

async function findUnverifiedDisposition(
  client: GitHubLiteClient,
  repository: RepoRef,
  pullRequest: GitHubPullRequest,
  comments: GitHubIssueComment[],
): Promise<GitHubIssueComment | undefined> {
  const roleMapping = pullRequest.baseSha
    ? await loadGovernedChangeRoles(
        client,
        repository,
        pullRequest.baseSha,
      ).catch(() => null)
    : null;

  for (const comment of comments) {
    const evidence = parseUnverifiedGovernedChangeDisposition(comment.body);

    if (
      !evidence ||
      !isImmutableComment(comment) ||
      evidence.requestLocator !== String(pullRequest.number)
    ) {
      continue;
    }
    if (
      evidence.decision === "WITHDRAWN_UNVERIFIED" &&
      comment.author === pullRequest.author
    ) {
      return comment;
    }
    if (
      evidence.decision === "REJECTED_UNVERIFIED" &&
      roleMapping &&
      (await hasGovernedChangeRole(
        client,
        repository,
        comment.author,
        roleMapping.roles.approver,
      ))
    ) {
      return comment;
    }
  }

  return undefined;
}

async function findVerifiedDecision(
  client: GitHubLiteClient,
  repository: RepoRef,
  pullRequest: GitHubPullRequest,
  comments: GitHubIssueComment[],
  request: GovernedChangeRequestEvidence,
  requestDigest: string,
) {
  const currentAuthorization =
    pullRequest.state === "open"
      ? await loadCurrentWorkspaceAuthorization(client, repository).catch(
          () => null,
        )
      : null;

  for (const comment of [...comments].sort(compareNewestFirst)) {
    const evidence = parseGovernedChangeDecisionEvidence(comment.body);

    if (
      !evidence ||
      !isImmutableComment(comment) ||
      evidence.headRevisionSha !== pullRequest.headSha ||
      evidence.governedChangeId !== request.governedChangeId ||
      evidence.requestDigest !== requestDigest ||
      evidence.targetRevisionDigest !== request.targetRevisionDigest
    ) {
      continue;
    }

    const authorization = await loadWorkspaceAuthorizationAtRevision(
      client,
      repository,
      evidence.authorizationRevisionSha,
    ).catch(() => null);
    if (!authorization) continue;
    const authorizedAtRecordedRevision = await isDecisionAuthorized({
      authorization,
      client,
      comment,
      evidence,
      request,
    });
    const authorizedNow = currentAuthorization
      ? await isDecisionAuthorized({
          authorization: currentAuthorization,
          client,
          comment,
          evidence,
          request,
        })
      : pullRequest.state !== "open";

    if (authorizedAtRecordedRevision && authorizedNow) {
      return { actor: comment.author, createdAt: comment.createdAt, evidence };
    }
  }

  return undefined;
}

async function isDecisionAuthorized({
  authorization,
  client,
  comment,
  evidence,
  request,
}: {
  authorization: { policy: WorkspacePolicy; roleMapping: RoleMapping };
  client: GitHubLiteClient;
  comment: GitHubIssueComment;
  evidence: NonNullable<ReturnType<typeof parseGovernedChangeDecisionEvidence>>;
  request: GovernedChangeRequestEvidence;
}): Promise<boolean> {
  const actorHasApproverRole = await hasGovernedChangeRole(
    client,
    repositoryForComment(request),
    comment.author,
    authorization.roleMapping.roles.approver,
  );
  const actorHasRequesterRole = await hasGovernedChangeRole(
    client,
    repositoryForComment(request),
    comment.author,
    authorization.roleMapping.roles.requester,
  );
  const isWorkspacePolicyApproval =
    evidence.decision === "APPROVED" &&
    evidence.decisionSource === "WORKSPACE_POLICY";

  if (isWorkspacePolicyApproval) {
    return (
      authorization.policy.approval.mode === "AUTO_APPROVE" &&
      comment.author === request.requester &&
      actorHasRequesterRole
    );
  }

  if (evidence.decision === "REJECTED") return actorHasApproverRole;

  return authorizeGovernedChangeApproval({
    actorHasApproverRole,
    actorHasRequesterRole,
    actorIsRequester: comment.author === request.requester,
    approvalMode: authorization.policy.approval.mode,
  }).allowed;
}

function repositoryForComment(request: GovernedChangeRequestEvidence): RepoRef {
  const [owner, repo] = request.repository.split("/");

  return { owner: owner ?? "", repo: repo ?? "" };
}

async function loadWorkspaceAuthorizationAtRevision(
  client: GitHubLiteClient,
  repository: RepoRef,
  authorizationRevisionSha: string,
): Promise<{ policy: WorkspacePolicy; roleMapping: RoleMapping }> {
  const [policy, roleMapping] = await Promise.all([
    loadGovernedChangePolicy(client, repository, authorizationRevisionSha),
    loadGovernedChangeRoles(client, repository, authorizationRevisionSha),
  ]);

  return { policy, roleMapping };
}

async function loadCurrentWorkspaceAuthorization(
  client: GitHubLiteClient,
  repository: RepoRef,
): Promise<{ policy: WorkspacePolicy; roleMapping: RoleMapping }> {
  const workspace = await client.getRepository(repository);
  const authorizationRevisionSha = await client.getBranchHeadSha({
    ...repository,
    branch: workspace.defaultBranch,
  });

  return loadWorkspaceAuthorizationAtRevision(
    client,
    repository,
    authorizationRevisionSha,
  );
}

function isImmutableComment(comment: GitHubIssueComment): boolean {
  return Boolean(comment.updatedAt && comment.createdAt === comment.updatedAt);
}

function compareNewestFirst(
  left: GitHubIssueComment,
  right: GitHubIssueComment,
): number {
  return left.createdAt > right.createdAt
    ? -1
    : left.createdAt < right.createdAt
      ? 1
      : 0;
}
