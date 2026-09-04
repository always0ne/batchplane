import {
  authorizeGovernedChangeApproval,
  authorizeGovernedChangeRejection,
  authorizeGovernedChangeCreation,
  createGovernedChangeRequestDigest,
  resolveAutoApproval,
  validateRejectionReason,
  type GovernedChangeRequestEvidence,
} from "@batchplane/domain";
import {
  buildGovernedChangeDecisionBody,
  buildGovernedChangeRequestBody,
  buildGovernedChangeWithdrawalBody,
  buildUnverifiedGovernedChangeDispositionBody,
  parseGovernedChangeRequestEvidence,
  type GitHubLiteClient,
  type GitHubPullRequest,
  type RepoRef,
} from "./index.js";
import type {
  BatchChangeDraft,
  BatchPlaneClient,
  CreateGovernedChangeResult,
  GovernedChangeDetail,
  GovernedChangeRequest,
} from "@batchplane/ui-client";

import { assertCanonicalBatchId } from "./batch-definition-codec.js";
import {
  assertPreparedChangeTargets,
  createPreparedChangeArtifactEvidence,
  createPreparedChangeTargetDigest,
  loadExistingBatchDefinition,
  loadPreparedChangePreviewFiles,
  prepareGovernedChange,
  toBatchChangeDraft,
  writePreparedGovernedChange,
} from "./governed-change-preparation.js";
import {
  hasGovernedChangeRole,
  loadGovernedChangePolicy,
  loadGovernedChangeRoles,
} from "./governed-change-policy.js";
import {
  hasAuthoritativeGovernedChangeRequest,
  hasChangedGovernedChangeBase,
} from "./governed-change-verifier.js";
import { loadGovernedChangeDetail } from "./governed-change-projection.js";

export function createGovernedChangeOperations(
  session: { owner: string; repo: string; token: string },
  client: GitHubLiteClient,
): Required<
  Pick<
    BatchPlaneClient,
    | "approveGovernedChange"
    | "createBatchChangeRequest"
    | "getGovernedChange"
    | "loadBatchChangeDraft"
    | "previewBatchChange"
    | "rejectGovernedChange"
    | "withdrawGovernedChange"
  >
> {
  const repository = { owner: session.owner, repo: session.repo };

  return {
    async loadBatchChangeDraft({ batchId, mode }) {
      if (mode === "create") {
        return {
          batch: createEmptyBatchDraft(),
          governedChangeId: createGovernedChangeId("new-batch"),
          mode,
          schedules: [],
        };
      }

      const batch = await loadExistingBatchDefinition(
        repository,
        client,
        batchId,
      );

      if (!batch) {
        throw new Error("The governed batch could not be found.");
      }

      return {
        batch: toBatchChangeDraft(batch),
        governedChangeId: createGovernedChangeId(batch.batchId),
        mode,
        schedules: batch.schedules ?? [],
      };
    },

    async previewBatchChange(draft) {
      const prepared = prepareGovernedChange(
        draft,
        draft.governedChangeId ?? createGovernedChangeId(draft.batch.batchId),
      );
      const defaultBranch = (await client.getRepository(repository))
        .defaultBranch;
      const files = await loadPreparedChangePreviewFiles(
        client,
        repository,
        defaultBranch,
        prepared.files,
      );

      return {
        files,
        targetRevisionDigest: await createPreparedChangeTargetDigest({
          client,
          prepared,
          ref: defaultBranch,
          repository,
        }),
      };
    },

    async createBatchChangeRequest(draft) {
      const [actor, repo] = await Promise.all([
        client.getCurrentUser(),
        client.getRepository(repository),
      ]);
      const baseRevisionSha = await client.getBranchHeadSha({
        ...repository,
        branch: repo.defaultBranch,
      });
      const { policy, roleMapping } =
        await loadWorkspaceAuthorizationAtRevision(
          client,
          repository,
          baseRevisionSha,
        );
      const actorHasRequesterRole = await hasGovernedChangeRole(
        client,
        repository,
        actor.login,
        roleMapping.roles.requester,
      );
      const creation = authorizeGovernedChangeCreation({
        actorHasRequesterRole,
      });

      if (!creation.allowed) {
        throw new Error(
          "Workspace requester role is required to create a change.",
        );
      }

      const governedChangeId =
        draft.governedChangeId ?? createGovernedChangeId(draft.batch.batchId);
      const prepared = prepareGovernedChange(draft, governedChangeId);
      const previewFiles = await loadPreparedChangePreviewFiles(
        client,
        repository,
        baseRevisionSha,
        prepared.files,
      );

      if (previewFiles.every((file) => file.status === "UNCHANGED")) {
        throw new Error(
          "The proposed governed change does not modify any file.",
        );
      }

      assertPreparedChangeTargets(prepared.type, previewFiles);

      const targetRevisionDigest = await createPreparedChangeTargetDigest({
        client,
        prepared,
        ref: baseRevisionSha,
        repository,
      });
      const branch = createGovernedChangeBranchName(
        prepared.batch.batchId,
        draft.mode,
        governedChangeId,
      );

      await writePreparedGovernedChange({
        branch,
        baseSha: baseRevisionSha,
        client,
        prepared,
        repository,
        title: prepared.title,
      });

      const createdPullRequest = await client.createPullRequest({
        ...repository,
        base: repo.defaultBranch,
        body: "BatchPlane governed change evidence is being prepared.",
        head: branch,
        title: prepared.title,
      });
      await rejectStaleBaseChange({
        baseRevisionSha,
        client,
        pullRequest: createdPullRequest,
        repository,
      });
      const requestEvidence: GovernedChangeRequestEvidence = {
        artifacts: await createPreparedChangeArtifactEvidence({
          client,
          prepared,
          ref: baseRevisionSha,
          repository,
        }),
        baseRevisionSha,
        batchId: prepared.batch.batchId,
        governedChangeId,
        headRevisionSha: requireHeadSha(createdPullRequest),
        repository: `${repository.owner}/${repository.repo}`,
        requester: actor.login,
        requestedAt: requirePullRequestCreatedAt(createdPullRequest),
        targetRevisionDigest,
        type: prepared.type,
        version: "batchplane.io/governed-change/v2",
        workspace: `${repository.owner}/${repository.repo}`,
      };
      const pullRequest = await client.updatePullRequest({
        ...repository,
        body: buildGovernedChangeRequestBody(requestEvidence),
        pullNumber: createdPullRequest.number,
      });
      const request = await loadGovernedChangeDetail(
        client,
        repository,
        pullRequest,
      );
      const autoApproval = resolveAutoApproval({
        actorHasRequesterRole,
        approvalMode: policy.approval.mode,
      });

      if (
        autoApproval.allowed &&
        autoApproval.decisionSource === "WORKSPACE_POLICY"
      ) {
        return {
          request: await applyWorkspaceAutoApproval({
            client,
            pullRequest,
            repository,
          }),
        };
      }

      return { request } satisfies CreateGovernedChangeResult;
    },

    async getGovernedChange({ requestLocator }) {
      const pullRequest = await loadPullRequest(
        client,
        repository,
        requestLocator,
      );

      if (!pullRequest) {
        return null;
      }

      return loadGovernedChangeDetail(client, repository, pullRequest);
    },

    async approveGovernedChange({ requestLocator }) {
      const pullRequest = await requirePullRequest(
        client,
        repository,
        requestLocator,
      );
      const detail = await requireApprovableChange(
        client,
        repository,
        pullRequest,
      );

      if (detail.reviewState === "REAPPROVAL_REQUIRED") return detail;

      if (detail.reviewState === "APPROVED_PENDING_MERGE") {
        return mergeApprovedChange({ client, detail, pullRequest, repository });
      }

      const actor = await client.getCurrentUser();
      const { authorizationRevisionSha, policy, roleMapping } =
        await loadCurrentWorkspaceAuthorization(client, repository);
      const actorHasApproverRole = await hasGovernedChangeRole(
        client,
        repository,
        actor.login,
        roleMapping.roles.approver,
      );
      const requestEvidence = parseGovernedChangeRequestEvidence(
        pullRequest.body,
      )!;
      const actorHasRequesterRole = await hasGovernedChangeRole(
        client,
        repository,
        actor.login,
        roleMapping.roles.requester,
      );
      const authorization = authorizeGovernedChangeApproval({
        actorHasApproverRole,
        actorHasRequesterRole,
        actorIsRequester: actor.login === requestEvidence.requester,
        approvalMode: policy.approval.mode,
      });

      if (!authorization.allowed) {
        throw new Error(authorization.reason);
      }

      return approveAndMerge({
        client,
        detail,
        decisionSource: "USER",
        authorizationRevisionSha,
        pullRequest,
        repository,
      });
    },

    async rejectGovernedChange({ reason, requestLocator }) {
      if (!validateRejectionReason(reason)) {
        throw new Error("A rejection reason is required.");
      }

      const pullRequest = await requirePullRequest(
        client,
        repository,
        requestLocator,
      );
      const actor = await client.getCurrentUser();
      const { authorizationRevisionSha, roleMapping } =
        await loadCurrentWorkspaceAuthorization(client, repository);
      const actorHasApproverRole = await hasGovernedChangeRole(
        client,
        repository,
        actor.login,
        roleMapping.roles.approver,
      );
      const authorization = authorizeGovernedChangeRejection({
        actorHasApproverRole,
      });

      if (!authorization.allowed) {
        throw new Error(authorization.reason);
      }

      const requestEvidence = parseGovernedChangeRequestEvidence(
        pullRequest.body,
      );
      const requestIsVerified = await hasAuthoritativeGovernedChangeRequest(
        client,
        repository,
        pullRequest,
        requestEvidence,
      );

      if (!requestIsVerified || !requestEvidence) {
        if (pullRequest.state !== "open") {
          throw new Error(
            "The governed change is no longer awaiting a decision.",
          );
        }
        await closeUnverifiedChange({
          client,
          decision: "REJECTED_UNVERIFIED",
          reason: reason.trim(),
          pullRequest,
          repository,
        });
        return loadGovernedChangeDetail(
          client,
          repository,
          await requirePullRequest(client, repository, requestLocator),
        );
      }

      const requestDigest =
        await createGovernedChangeRequestDigest(requestEvidence);
      await client.createIssueComment({
        ...repository,
        body: buildGovernedChangeDecisionBody({
          authorizationRevisionSha,
          headRevisionSha: pullRequest.headSha ?? "",
          decision: "REJECTED",
          decisionSource: "USER",
          governedChangeId: requestEvidence.governedChangeId,
          requestDigest,
          targetRevisionDigest: requestEvidence.targetRevisionDigest,
          version: "batchplane.io/governed-change/v2",
          rejectionReason: reason.trim(),
        }),
        issueNumber: pullRequest.number,
      });
      await client.closeIssue({
        ...repository,
        issueNumber: pullRequest.number,
      });
      const closedPullRequest = await requirePullRequest(
        client,
        repository,
        requestLocator,
      );

      return loadGovernedChangeDetail(client, repository, closedPullRequest);
    },

    async withdrawGovernedChange({ requestLocator }) {
      const pullRequest = await requirePullRequest(
        client,
        repository,
        requestLocator,
      );
      const actor = await client.getCurrentUser();
      const requestEvidence = parseGovernedChangeRequestEvidence(
        pullRequest.body,
      );

      if (pullRequest.author !== actor.login || pullRequest.state !== "open") {
        throw new Error(
          "Only the requester can withdraw an open governed change.",
        );
      }

      const requestIsVerified = await hasAuthoritativeGovernedChangeRequest(
        client,
        repository,
        pullRequest,
        requestEvidence,
      );
      if (!requestIsVerified || !requestEvidence) {
        await closeUnverifiedChange({
          client,
          decision: "WITHDRAWN_UNVERIFIED",
          pullRequest,
          repository,
        });
        return loadGovernedChangeDetail(
          client,
          repository,
          await requirePullRequest(client, repository, requestLocator),
        );
      }

      await client.createIssueComment({
        ...repository,
        body: buildGovernedChangeWithdrawalBody({
          headRevisionSha: requireHeadSha(pullRequest),
          decision: "WITHDRAWN",
          governedChangeId: requestEvidence.governedChangeId,
          requestDigest:
            await createGovernedChangeRequestDigest(requestEvidence),
          targetRevisionDigest: requestEvidence.targetRevisionDigest,
          version: "batchplane.io/governed-change/v2",
        }),
        issueNumber: pullRequest.number,
      });
      await client.closeIssue({
        ...repository,
        issueNumber: pullRequest.number,
      });
      const closedPullRequest = await requirePullRequest(
        client,
        repository,
        requestLocator,
      );
      return loadGovernedChangeDetail(client, repository, closedPullRequest);
    },
  };
}

async function loadPullRequest(
  client: GitHubLiteClient,
  repository: RepoRef,
  requestLocator: string,
): Promise<GitHubPullRequest | null> {
  const pullNumber = Number(requestLocator);

  return Number.isInteger(pullNumber) && pullNumber > 0
    ? client.getPullRequest({ ...repository, pullNumber })
    : null;
}

async function requirePullRequest(
  client: GitHubLiteClient,
  repository: RepoRef,
  requestLocator: string,
): Promise<GitHubPullRequest> {
  const pullRequest = await loadPullRequest(client, repository, requestLocator);

  if (!pullRequest) {
    throw new Error("The governed change could not be found.");
  }

  return pullRequest;
}

async function loadWorkspaceAuthorizationAtRevision(
  client: GitHubLiteClient,
  repository: RepoRef,
  authorizationRevisionSha: string,
) {
  const [policy, roleMapping] = await Promise.all([
    loadGovernedChangePolicy(client, repository, authorizationRevisionSha),
    loadGovernedChangeRoles(client, repository, authorizationRevisionSha),
  ]);

  return { authorizationRevisionSha, policy, roleMapping };
}

async function loadCurrentWorkspaceAuthorization(
  client: GitHubLiteClient,
  repository: RepoRef,
) {
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

function createGovernedChangeId(batchId: string): string {
  const canonicalBatchId = assertCanonicalBatchId(batchId);
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, "")
    .slice(0, 14);
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(16).slice(2, 10);

  return `bgc-${timestamp}-${canonicalBatchId}-${suffix}`;
}

function createEmptyBatchDraft(): BatchChangeDraft["batch"] {
  return {
    batchId: "",
    criticality: "MEDIUM",
    domain: "",
    environment: "PROD",
    name: "",
    owner: "",
    runCommand: "",
    runnerLabel: "ubuntu-latest",
    status: "ACTIVE",
    workflowRef: "main",
  };
}

function createGovernedChangeBranchName(
  batchId: string,
  mode: BatchChangeDraft["mode"],
  governedChangeId: string,
): string {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, "")
    .slice(0, 14);
  const batchSlug = assertCanonicalBatchId(batchId).toLowerCase();
  const changeSlug = toSafeBranchSegment(governedChangeId);
  const verb = mode === "create" ? "register" : mode;

  return `batchplane/${verb}/${batchSlug.slice(0, 48)}-${timestamp}-${changeSlug}`;
}

function toSafeBranchSegment(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^[.-]+|[.-]+$/g, "")
      .slice(-48) || "change"
  );
}

function requirePullRequestCreatedAt(pullRequest: GitHubPullRequest): string {
  if (!pullRequest.createdAt) {
    throw new Error("GitHub did not return the governed change creation time.");
  }

  return pullRequest.createdAt;
}

function requireBaseSha(pullRequest: GitHubPullRequest): string {
  if (!pullRequest.baseSha) {
    throw new Error("GitHub did not return the governed change base SHA.");
  }

  return pullRequest.baseSha;
}

function requireHeadSha(pullRequest: GitHubPullRequest): string {
  if (!pullRequest.headSha) {
    throw new Error("GitHub did not return the governed change head SHA.");
  }

  return pullRequest.headSha;
}

async function requireApprovableChange(
  client: GitHubLiteClient,
  repository: RepoRef,
  pullRequest: GitHubPullRequest,
): Promise<GovernedChangeDetail> {
  const detail = await loadGovernedChangeDetail(
    client,
    repository,
    pullRequest,
  );

  if (!pullRequest.headSha || detail.reviewState === "LEGACY_UNAPPROVABLE") {
    return { ...detail, reviewState: "REAPPROVAL_REQUIRED" };
  }

  if (detail.reviewState === "REAPPROVAL_REQUIRED") return detail;

  if (
    detail.reviewState !== "OPEN" &&
    detail.reviewState !== "APPROVED_PENDING_MERGE"
  ) {
    throw new Error("The governed change is no longer awaiting approval.");
  }

  if (
    !(await hasAuthoritativeGovernedChangeRequest(
      client,
      repository,
      pullRequest,
      parseGovernedChangeRequestEvidence(pullRequest.body),
    ))
  ) {
    return { ...detail, reviewState: "REAPPROVAL_REQUIRED" };
  }

  return detail;
}

async function closeUnverifiedChange({
  client,
  decision,
  reason,
  pullRequest,
  repository,
}: {
  client: GitHubLiteClient;
  decision: "REJECTED_UNVERIFIED" | "WITHDRAWN_UNVERIFIED";
  pullRequest: GitHubPullRequest;
  reason?: string;
  repository: RepoRef;
}): Promise<void> {
  await client.createIssueComment({
    ...repository,
    body: buildUnverifiedGovernedChangeDispositionBody({
      decision,
      ...(reason ? { reason } : {}),
      requestLocator: String(pullRequest.number),
      version: "batchplane.io/governed-change/v2",
    }),
    issueNumber: pullRequest.number,
  });
  await client.closeIssue({ ...repository, issueNumber: pullRequest.number });
}

async function rejectStaleBaseChange({
  baseRevisionSha,
  client,
  pullRequest,
  repository,
}: {
  baseRevisionSha: string;
  client: GitHubLiteClient;
  pullRequest: GitHubPullRequest;
  repository: RepoRef;
}): Promise<void> {
  if (requireBaseSha(pullRequest) === baseRevisionSha) {
    return;
  }

  await closeUnverifiedChange({
    client,
    decision: "WITHDRAWN_UNVERIFIED",
    reason: "BASE_REVISION_CHANGED",
    pullRequest,
    repository,
  });
  throw new Error(
    "BASE_REVISION_CHANGED: the Workspace base changed while the governed pull request was created. Retry the change.",
  );
}

async function approveAndMerge({
  authorizationRevisionSha,
  client,
  detail,
  decisionSource,
  pullRequest,
  repository,
}: {
  authorizationRevisionSha: string;
  client: GitHubLiteClient;
  detail: GovernedChangeDetail;
  decisionSource: "USER" | "WORKSPACE_POLICY";
  pullRequest: GitHubPullRequest;
  repository: RepoRef;
}): Promise<GovernedChangeDetail> {
  const requestEvidence = parseGovernedChangeRequestEvidence(pullRequest.body);

  if (!requestEvidence || !pullRequest.headSha) {
    return { ...detail, reviewState: "REAPPROVAL_REQUIRED" };
  }

  const requestDigest =
    await createGovernedChangeRequestDigest(requestEvidence);
  await client.createIssueComment({
    ...repository,
    body: buildGovernedChangeDecisionBody({
      authorizationRevisionSha,
      headRevisionSha: pullRequest.headSha,
      decision: "APPROVED",
      decisionSource,
      governedChangeId: requestEvidence.governedChangeId,
      requestDigest,
      targetRevisionDigest: requestEvidence.targetRevisionDigest,
      version: "batchplane.io/governed-change/v2",
    }),
    issueNumber: pullRequest.number,
  });

  const refreshedPullRequest = await requirePullRequest(
    client,
    repository,
    String(pullRequest.number),
  );
  const refreshedDetail = await loadGovernedChangeDetail(
    client,
    repository,
    refreshedPullRequest,
  );

  return refreshedDetail.reviewState === "APPROVED_PENDING_MERGE"
    ? mergeApprovedChange({
        client,
        detail: refreshedDetail,
        pullRequest: refreshedPullRequest,
        repository,
      })
    : refreshedDetail;
}

async function mergeApprovedChange({
  client,
  detail,
  pullRequest,
  repository,
}: {
  client: GitHubLiteClient;
  detail: GovernedChangeDetail;
  pullRequest: GitHubPullRequest;
  repository: RepoRef;
}): Promise<GovernedChangeDetail> {
  if (detail.reviewState !== "APPROVED_PENDING_MERGE") {
    return detail;
  }

  const evidence = parseGovernedChangeRequestEvidence(pullRequest.body);
  if (
    !evidence ||
    !pullRequest.headSha ||
    (await hasChangedGovernedChangeBase(client, repository, evidence))
  ) {
    return loadGovernedChangeDetail(client, repository, pullRequest);
  }

  // This check and the GitHub merge are not atomic; GitHub may advance base afterward.
  const mergeResult = await client.mergePullRequest({
    ...repository,
    commitTitle: `${pullRequest.title} (#${pullRequest.number})`,
    expectedHeadSha: pullRequest.headSha,
    pullNumber: pullRequest.number,
  });

  const refreshed = await requirePullRequest(
    client,
    repository,
    String(pullRequest.number),
  );

  if (!mergeResult.merged) {
    return resolveUnmergedChangeState(client, repository, refreshed);
  }

  return loadGovernedChangeDetail(client, repository, refreshed);
}

async function resolveUnmergedChangeState(
  client: GitHubLiteClient,
  repository: RepoRef,
  pullRequest: GitHubPullRequest,
): Promise<GovernedChangeDetail> {
  return loadGovernedChangeDetail(client, repository, pullRequest);
}

async function applyWorkspaceAutoApproval({
  client,
  pullRequest,
  repository,
}: {
  client: GitHubLiteClient;
  pullRequest: GitHubPullRequest;
  repository: RepoRef;
}): Promise<GovernedChangeRequest> {
  const refreshedPullRequest = await requirePullRequest(
    client,
    repository,
    String(pullRequest.number),
  );
  const detail = await requireApprovableChange(
    client,
    repository,
    refreshedPullRequest,
  );
  const evidence = parseGovernedChangeRequestEvidence(
    refreshedPullRequest.body,
  );
  const actor = await client.getCurrentUser();
  const { authorizationRevisionSha, policy, roleMapping } =
    await loadCurrentWorkspaceAuthorization(client, repository);
  const actorHasRequesterRole = evidence
    ? await hasGovernedChangeRole(
        client,
        repository,
        actor.login,
        roleMapping.roles.requester,
      )
    : false;

  if (
    !evidence ||
    actor.login !== evidence.requester ||
    policy.approval.mode !== "AUTO_APPROVE" ||
    !actorHasRequesterRole
  ) {
    return { ...detail, reviewState: "REAPPROVAL_REQUIRED" };
  }
  await approveAndMerge({
    authorizationRevisionSha,
    client,
    detail,
    decisionSource: "WORKSPACE_POLICY",
    pullRequest: refreshedPullRequest,
    repository,
  });

  const projectedPullRequest = await requirePullRequest(
    client,
    repository,
    String(pullRequest.number),
  );

  return loadGovernedChangeDetail(client, repository, projectedPullRequest);
}
