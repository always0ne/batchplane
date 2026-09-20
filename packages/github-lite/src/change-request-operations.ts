import {
  authorizeChangeRequestApproval,
  authorizeChangeRequestRejection,
  authorizeChangeRequestCreation,
  resolveAutoApproval,
  validateRejectionReason,
} from "@batchplane/domain";
import {
  buildChangeRequestDecisionBody,
  createChangeRequestDigest,
  buildChangeRequestBody,
  buildChangeRequestWithdrawalBody,
  buildUnverifiedChangeRequestDispositionBody,
  parseChangeRequestEvidence,
  type ChangeRequestEvidence,
} from "./change-request-evidence.js";
import type {
  GitHubLiteClient,
  GitHubPullRequest,
  RepoRef,
} from "./github-types.js";
import type {
  BatchChangeDraft,
  BatchChangeBlocker,
  BatchPlaneClient,
  CreateChangeRequestResult,
  ChangeRequestDetail,
  ChangeRequest,
} from "@batchplane/ui-client";

import {
  assertCanonicalBatchId,
  getBatchDefinitionPath,
  parseBatchDefinitionYaml,
} from "./batch-definition-codec.js";
import {
  parseRepositoryYaml,
  stringifyRepositoryYaml,
  type RepositoryYamlValue,
} from "./repository-yaml.js";
import {
  assertPreparedChangeTargets,
  createPreparedChangeArtifactEvidence,
  createPreparedChangeTargetDigest,
  hasEffectivePreparedChange,
  loadExistingBatchDefinition,
  loadPreparedChangePreviewFiles,
  prepareChangeRequest,
  toBatchChangeDraft,
  writePreparedChangeRequest,
} from "./change-request-preparation.js";
import {
  hasChangeRequestRole,
  loadChangeRequestPolicy,
  loadChangeRequestRoles,
} from "./change-request-policy.js";
import {
  hasAuthoritativeChangeRequest,
  hasChangedChangeRequestBase,
} from "./change-request-verifier.js";
import {
  loadLastApprovedBatchRevision,
  verifyApprovedBatchRevision,
} from "./approved-batch-revision.js";
import { loadChangeRequestDetail } from "./change-request-projection.js";

export function createChangeRequestOperations(
  session: { owner: string; repo: string },
  client: GitHubLiteClient,
): ChangeRequestOperations {
  const context = {
    client,
    repository: { owner: session.owner, repo: session.repo },
  };

  return {
    approveChangeRequest: (input) => approveChangeRequest(context, input),
    createBatchChangeRequest: (draft) =>
      createBatchChangeRequest(context, draft),
    getBatchChangeBlocker: (input) => getBatchChangeBlocker(context, input),
    getBatchRemediationCapability: (input) =>
      getBatchRemediationCapability(context, input),
    getChangeRequest: (input) => getChangeRequest(context, input),
    loadBatchChangeDraft: (input) => loadBatchChangeDraft(context, input),
    previewBatchChange: (draft) => previewBatchChange(context, draft),
    requestBatchRemediation: (input) => requestBatchRemediation(context, input),
    rejectChangeRequest: (input) => rejectChangeRequest(context, input),
    withdrawChangeRequest: (input) => withdrawChangeRequest(context, input),
  };
}

type ChangeRequestOperations = Required<
  Pick<
    BatchPlaneClient,
    | "approveChangeRequest"
    | "createBatchChangeRequest"
    | "getChangeRequest"
    | "getBatchChangeBlocker"
    | "getBatchRemediationCapability"
    | "loadBatchChangeDraft"
    | "previewBatchChange"
    | "requestBatchRemediation"
    | "rejectChangeRequest"
    | "withdrawChangeRequest"
  >
>;

type ChangeRequestOperationsContext = {
  client: GitHubLiteClient;
  repository: RepoRef;
};

async function loadBatchChangeDraft(
  { client, repository }: ChangeRequestOperationsContext,
  { batchId, mode }: Parameters<BatchPlaneClient["loadBatchChangeDraft"]>[0],
) {
  if (mode === "create") {
    const user = await client.getCurrentUser();
    const empty = createEmptyBatchDraft();
    return {
      batch: { ...empty.batch, owner: user.login },
      defaultOwner: user.login,
      execution: empty.execution,
      changeRequestId: createChangeRequestId("new-batch"),
      mode,
      schedules: [],
    };
  }

  const canonicalBatchId = assertCanonicalBatchId(batchId ?? "");
  const fallbackOwner = (await client.getCurrentUser()).login;
  const batch = await loadExistingBatchDraftDefinition(
    repository,
    client,
    canonicalBatchId,
    fallbackOwner,
  );

  if (!batch) throw new Error("The governed batch could not be found.");
  const draft = toBatchChangeDraft(batch);
  const owner = draft.batch.owner.trim() || fallbackOwner;

  return {
    batch: { ...draft.batch, owner },
    defaultOwner: fallbackOwner,
    changeRequestId: createChangeRequestId(batch.batchId),
    execution: draft.execution,
    mode,
    schedules: batch.schedules ?? [],
    targetBatchId: batch.batchId,
  };
}

async function loadExistingBatchDraftDefinition(
  repository: RepoRef,
  client: GitHubLiteClient,
  batchId: string,
  fallbackOwner: string,
) {
  try {
    return await loadExistingBatchDefinition(repository, client, batchId);
  } catch (error) {
    const repo = await client.getRepository(repository);
    const file = await client.getFile({
      ...repository,
      path: getBatchDefinitionPath(batchId),
      ref: repo.defaultBranch,
    });
    const parsed = file ? parseRepositoryYaml(file.content) : undefined;
    const document = parsed?.ok ? parsed.value : undefined;
    const spec = isYamlRecord(document) ? document.spec : undefined;

    if (
      !isYamlRecord(document) ||
      !isYamlRecord(spec) ||
      typeof spec.owner !== "string" ||
      spec.owner.trim()
    ) {
      throw error;
    }

    return parseBatchDefinitionYaml(
      stringifyRepositoryYaml({
        ...document,
        spec: { ...spec, owner: fallbackOwner },
      }),
    );
  }
}

function isYamlRecord(
  value: unknown,
): value is Record<string, RepositoryYamlValue | undefined> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function getBatchChangeBlocker(
  { client, repository }: ChangeRequestOperationsContext,
  { batchId }: Parameters<BatchPlaneClient["getBatchChangeBlocker"]>[0],
) {
  return findPendingBatchControl(
    client,
    repository,
    assertCanonicalBatchId(batchId),
  );
}

async function getBatchRemediationCapability(
  context: ChangeRequestOperationsContext,
  { batchId }: Parameters<BatchPlaneClient["getBatchRemediationCapability"]>[0],
) {
  assertCanonicalBatchId(batchId);

  try {
    const control = await verifyApprovedBatchRevision({
      batchId,
      client: context.client,
      repository: context.repository,
    });
    if (control.controlStatus !== "BYPASSED") {
      return { availableKinds: [], canRequest: false };
    }
    if (
      await findPendingBatchControl(context.client, context.repository, batchId)
    ) {
      return { availableKinds: [], canRequest: false };
    }
    await loadChangeRequestCreation(context);
    const historical = await loadLastApprovedBatchRevision({
      batchId,
      client: context.client,
      repository: context.repository,
    });
    return {
      availableKinds: [
        "REVIEW_CURRENT" as const,
        ...(historical.status === "VERIFIED"
          ? ["RESTORE_LAST_APPROVED" as const]
          : []),
      ],
      canRequest: true,
    };
  } catch {
    return { availableKinds: [], canRequest: false };
  }
}

async function previewBatchChange(
  { client, repository }: ChangeRequestOperationsContext,
  draft: BatchChangeDraft,
) {
  const normalizedDraft = normalizeDraftOwner(
    draft,
    (await client.getCurrentUser()).login,
  );
  assertChangeBatchIdentity(normalizedDraft);
  const prepared = prepareChangeRequest(
    normalizedDraft,
    normalizedDraft.changeRequestId ??
      createChangeRequestId(normalizedDraft.batch.batchId),
  );
  const defaultBranch = (await client.getRepository(repository)).defaultBranch;
  const files = await loadPreparedChangePreviewFiles(
    client,
    repository,
    defaultBranch,
    prepared.files,
  );

  return {
    files,
    hasEffectiveChanges: hasEffectivePreparedChange(files),
    targetRevisionDigest: await createPreparedChangeTargetDigest({
      client,
      prepared,
      ref: defaultBranch,
      repository,
    }),
  };
}

async function createBatchChangeRequest(
  context: ChangeRequestOperationsContext,
  draft: BatchChangeDraft,
): Promise<CreateChangeRequestResult> {
  assertChangeBatchIdentity(draft);
  await rejectPendingBatchControl(
    context.client,
    context.repository,
    assertCanonicalBatchId(draft.batch.batchId),
  );

  const creation = await loadChangeRequestCreation(context);
  const normalizedDraft = normalizeDraftOwner(draft, creation.actor.login);
  const preparedChange = await prepareNewChangeRequest(
    context,
    normalizedDraft,
    creation.baseRevisionSha,
  );
  const pullRequest = await openChangeRequestPullRequest(
    context,
    normalizedDraft,
    creation,
    preparedChange,
  );

  return finishCreatedChangeRequest(context, creation, pullRequest);
}

function normalizeDraftOwner(
  draft: BatchChangeDraft,
  authenticatedRequester: string,
): BatchChangeDraft {
  const owner = draft.batch.owner.trim() || authenticatedRequester;

  return {
    ...draft,
    batch: { ...draft.batch, owner },
  };
}

async function requestBatchRemediation(
  context: ChangeRequestOperationsContext,
  input: Parameters<BatchPlaneClient["requestBatchRemediation"]>[0],
): Promise<CreateChangeRequestResult> {
  assertCanonicalBatchId(input.batchId);
  const control = await verifyApprovedBatchRevision({
    batchId: input.batchId,
    client: context.client,
    repository: context.repository,
  });
  if (control.controlStatus !== "BYPASSED") {
    throw new Error(
      "Batch remediation requires an observed unapproved Batch revision.",
    );
  }

  if (input.kind === "REVIEW_CURRENT") {
    const draft = await loadBatchChangeDraft(context, {
      batchId: input.batchId,
      mode: "change",
    });

    return createBatchChangeRequest(context, {
      ...draft,
      remediation: input.kind,
    });
  }

  const historical = await loadLastApprovedBatchRevision({
    batchId: input.batchId,
    client: context.client,
    repository: context.repository,
  });
  if (historical.status !== "VERIFIED") {
    throw new Error(
      historical.status === "UNKNOWN"
        ? "The last approved Batch revision could not be recovered."
        : "No verified historical Batch revision is available to restore.",
    );
  }

  const current = await loadExistingBatchDefinition(
    context.repository,
    context.client,
    input.batchId,
  );
  const historicalDraft = toBatchChangeDraft(historical.batch);
  const currentDraft = current ? toBatchChangeDraft(current) : undefined;

  return createBatchChangeRequest(context, {
    batch: historicalDraft.batch,
    execution: {
      ...historicalDraft.execution,
      ...(historical.artifact ? { upload: historical.artifact } : {}),
      ...(currentDraft?.execution.existingFile
        ? { existingFile: currentDraft.execution.existingFile }
        : {}),
      ...(current &&
      !historical.artifact &&
      currentDraft?.execution.existingFile
        ? { removeExistingArtifact: true }
        : {}),
    },
    changeRequestId: createChangeRequestId(input.batchId),
    mode: current ? "change" : "create",
    remediation: "RESTORE_LAST_APPROVED",
    schedules: historical.batch.schedules ?? [],
    ...(current ? { targetBatchId: input.batchId } : {}),
  });
}

async function getChangeRequest(
  { client, repository }: ChangeRequestOperationsContext,
  { requestLocator }: Parameters<BatchPlaneClient["getChangeRequest"]>[0],
) {
  const pullRequest = await loadPullRequest(client, repository, requestLocator);
  return pullRequest
    ? loadChangeRequestDetail(client, repository, pullRequest)
    : null;
}

async function approveChangeRequest(
  { client, repository }: ChangeRequestOperationsContext,
  { requestLocator }: Parameters<BatchPlaneClient["approveChangeRequest"]>[0],
) {
  const pullRequest = await requirePullRequest(
    client,
    repository,
    requestLocator,
  );
  const detail = await requireApprovableChange(client, repository, pullRequest);

  if (detail.reviewState === "REAPPROVAL_REQUIRED") return detail;

  const authorization = await requireCurrentApprovalAuthorization({
    client,
    pullRequest,
    repository,
  });
  if (detail.reviewState === "APPROVED_PENDING_MERGE") {
    return mergeApprovedChange({ client, detail, pullRequest, repository });
  }

  return approveAndMerge({
    authorizationRevisionSha: authorization.authorizationRevisionSha,
    client,
    decisionSource: "USER",
    detail,
    pullRequest,
    repository,
  });
}

async function rejectChangeRequest(
  { client, repository }: ChangeRequestOperationsContext,
  {
    reason,
    requestLocator,
  }: Parameters<BatchPlaneClient["rejectChangeRequest"]>[0],
) {
  if (!validateRejectionReason(reason)) {
    throw new Error("A rejection reason is required.");
  }

  const pullRequest = await requirePullRequest(
    client,
    repository,
    requestLocator,
  );
  const authorizationRevisionSha = await requireCurrentRejectionAuthorization(
    client,
    repository,
  );
  const requestEvidence = parseChangeRequestEvidence(pullRequest.body);
  const requestIsVerified = await hasAuthoritativeChangeRequest(
    client,
    repository,
    pullRequest,
    requestEvidence,
  );

  if (!requestIsVerified || !requestEvidence) {
    return rejectUnverifiedChangeRequest({
      client,
      pullRequest,
      reason,
      repository,
      requestLocator,
    });
  }

  return rejectVerifiedChangeRequest({
    authorizationRevisionSha,
    client,
    pullRequest,
    reason,
    repository,
    requestEvidence,
    requestLocator,
  });
}

async function withdrawChangeRequest(
  { client, repository }: ChangeRequestOperationsContext,
  { requestLocator }: Parameters<BatchPlaneClient["withdrawChangeRequest"]>[0],
) {
  const pullRequest = await requirePullRequest(
    client,
    repository,
    requestLocator,
  );
  const actor = await client.getCurrentUser();
  const requestEvidence = parseChangeRequestEvidence(pullRequest.body);

  if (pullRequest.author !== actor.login || pullRequest.state !== "open") {
    throw new Error("Only the requester can withdraw an open change request.");
  }

  const requestIsVerified = await hasAuthoritativeChangeRequest(
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
    return loadRefreshedChangeRequest(client, repository, requestLocator);
  }

  await client.createIssueComment({
    ...repository,
    body: buildChangeRequestWithdrawalBody({
      decision: "WITHDRAWN",
      governedChangeId: requestEvidence.governedChangeId,
      headRevisionSha: requireHeadSha(pullRequest),
      requestDigest: await createChangeRequestDigest(requestEvidence),
      targetRevisionDigest: requestEvidence.targetRevisionDigest,
      version: "batchplane.io/governed-change/v2",
    }),
    issueNumber: pullRequest.number,
  });
  await client.closeIssue({ ...repository, issueNumber: pullRequest.number });
  return loadRefreshedChangeRequest(client, repository, requestLocator);
}

async function loadChangeRequestCreation({
  client,
  repository,
}: ChangeRequestOperationsContext) {
  const [actor, workspace] = await Promise.all([
    client.getCurrentUser(),
    client.getRepository(repository),
  ]);
  const baseRevisionSha = await client.getBranchHeadSha({
    ...repository,
    branch: workspace.defaultBranch,
  });
  const { policy, roleMapping } = await loadWorkspaceAuthorizationAtRevision(
    client,
    repository,
    baseRevisionSha,
  );
  const actorHasRequesterRole = await hasChangeRequestRole(
    client,
    repository,
    actor.login,
    roleMapping.roles.requester,
  );
  const creation = authorizeChangeRequestCreation({ actorHasRequesterRole });

  if (!creation.allowed) {
    throw new Error("Workspace requester role is required to create a change.");
  }

  return {
    actor,
    actorHasRequesterRole,
    baseRevisionSha,
    defaultBranch: workspace.defaultBranch,
    policy,
  };
}

async function prepareNewChangeRequest(
  { client, repository }: ChangeRequestOperationsContext,
  draft: BatchChangeDraft,
  baseRevisionSha: string,
) {
  const changeRequestId =
    draft.changeRequestId ?? createChangeRequestId(draft.batch.batchId);
  const prepared = prepareChangeRequest(draft, changeRequestId);
  const previewFiles = await loadPreparedChangePreviewFiles(
    client,
    repository,
    baseRevisionSha,
    prepared.files,
  );

  if (!hasEffectivePreparedChange(previewFiles) && !draft.remediation) {
    throw new Error("The proposed change request does not modify any file.");
  }

  assertPreparedChangeTargets(prepared.type, previewFiles);
  return {
    changeRequestId,
    prepared,
    targetRevisionDigest: await createPreparedChangeTargetDigest({
      client,
      prepared,
      ref: baseRevisionSha,
      repository,
    }),
  };
}

async function openChangeRequestPullRequest(
  { client, repository }: ChangeRequestOperationsContext,
  draft: BatchChangeDraft,
  creation: Awaited<ReturnType<typeof loadChangeRequestCreation>>,
  preparedChange: Awaited<ReturnType<typeof prepareNewChangeRequest>>,
) {
  const { baseRevisionSha, defaultBranch } = creation;
  const { changeRequestId, prepared, targetRevisionDigest } = preparedChange;
  const branch = createChangeRequestBranchName(
    prepared.batch.batchId,
    draft.mode,
    changeRequestId,
  );

  await writePreparedChangeRequest({
    branch,
    baseSha: baseRevisionSha,
    client,
    prepared,
    repository,
    title: prepared.title,
  });
  const createdPullRequest = await client.createPullRequest({
    ...repository,
    base: defaultBranch,
    body: "BatchPlane change request evidence is being prepared.",
    head: branch,
    title: prepared.title,
  });
  await rejectStaleBaseChange({
    baseRevisionSha,
    client,
    pullRequest: createdPullRequest,
    repository,
  });

  const requestEvidence: ChangeRequestEvidence = {
    artifacts: await createPreparedChangeArtifactEvidence({
      client,
      prepared,
      ref: baseRevisionSha,
      repository,
    }),
    baseRevisionSha,
    batchId: prepared.batch.batchId,
    governedChangeId: changeRequestId,
    headRevisionSha: requireHeadSha(createdPullRequest),
    repository: `${repository.owner}/${repository.repo}`,
    requester: creation.actor.login,
    requestedAt: requirePullRequestCreatedAt(createdPullRequest),
    ...(draft.remediation ? { remediation: draft.remediation } : {}),
    targetRevisionDigest,
    type: prepared.type,
    version: "batchplane.io/governed-change/v2",
    workspace: `${repository.owner}/${repository.repo}`,
  };

  return client.updatePullRequest({
    ...repository,
    body: buildChangeRequestBody(requestEvidence),
    pullNumber: createdPullRequest.number,
  });
}

async function finishCreatedChangeRequest(
  { client, repository }: ChangeRequestOperationsContext,
  creation: Awaited<ReturnType<typeof loadChangeRequestCreation>>,
  pullRequest: GitHubPullRequest,
): Promise<CreateChangeRequestResult> {
  const request = await loadChangeRequestDetail(
    client,
    repository,
    pullRequest,
  );
  const autoApproval = resolveAutoApproval({
    actorHasRequesterRole: creation.actorHasRequesterRole,
    approvalMode: creation.policy.approval.mode,
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

  return { request };
}

async function requireCurrentRejectionAuthorization(
  client: GitHubLiteClient,
  repository: RepoRef,
): Promise<string> {
  const actor = await client.getCurrentUser();
  const { authorizationRevisionSha, roleMapping } =
    await loadCurrentWorkspaceAuthorization(client, repository);
  const actorHasApproverRole = await hasChangeRequestRole(
    client,
    repository,
    actor.login,
    roleMapping.roles.approver,
  );
  const authorization = authorizeChangeRequestRejection({
    actorHasApproverRole,
  });

  if (!authorization.allowed) throw new Error(authorization.reason);

  return authorizationRevisionSha;
}

async function rejectUnverifiedChangeRequest({
  client,
  pullRequest,
  reason,
  repository,
  requestLocator,
}: {
  client: GitHubLiteClient;
  pullRequest: GitHubPullRequest;
  reason: string;
  repository: RepoRef;
  requestLocator: string;
}): Promise<ChangeRequestDetail> {
  if (pullRequest.state !== "open") {
    throw new Error("The change request is no longer awaiting a decision.");
  }

  await closeUnverifiedChange({
    client,
    decision: "REJECTED_UNVERIFIED",
    reason: reason.trim(),
    pullRequest,
    repository,
  });
  return loadRefreshedChangeRequest(client, repository, requestLocator);
}

async function rejectVerifiedChangeRequest({
  authorizationRevisionSha,
  client,
  pullRequest,
  reason,
  repository,
  requestEvidence,
  requestLocator,
}: {
  authorizationRevisionSha: string;
  client: GitHubLiteClient;
  pullRequest: GitHubPullRequest;
  reason: string;
  repository: RepoRef;
  requestEvidence: ChangeRequestEvidence;
  requestLocator: string;
}): Promise<ChangeRequestDetail> {
  if (pullRequest.state !== "open") {
    throw new Error("The change request is no longer awaiting a decision.");
  }

  await client.createIssueComment({
    ...repository,
    body: buildChangeRequestDecisionBody({
      authorizationRevisionSha,
      decision: "REJECTED",
      decisionSource: "USER",
      governedChangeId: requestEvidence.governedChangeId,
      headRevisionSha: pullRequest.headSha ?? "",
      rejectionReason: reason.trim(),
      requestDigest: await createChangeRequestDigest(requestEvidence),
      targetRevisionDigest: requestEvidence.targetRevisionDigest,
      version: "batchplane.io/governed-change/v2",
    }),
    issueNumber: pullRequest.number,
  });
  await client.closeIssue({ ...repository, issueNumber: pullRequest.number });
  return loadRefreshedChangeRequest(client, repository, requestLocator);
}

async function loadRefreshedChangeRequest(
  client: GitHubLiteClient,
  repository: RepoRef,
  requestLocator: string,
): Promise<ChangeRequestDetail> {
  return loadChangeRequestDetail(
    client,
    repository,
    await requirePullRequest(client, repository, requestLocator),
  );
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
    throw new Error("The change request could not be found.");
  }

  return pullRequest;
}

async function loadWorkspaceAuthorizationAtRevision(
  client: GitHubLiteClient,
  repository: RepoRef,
  authorizationRevisionSha: string,
) {
  const [policy, roleMapping] = await Promise.all([
    loadChangeRequestPolicy(client, repository, authorizationRevisionSha),
    loadChangeRequestRoles(client, repository, authorizationRevisionSha),
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

function createChangeRequestId(batchId: string): string {
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

function assertChangeBatchIdentity(draft: BatchChangeDraft): void {
  if (draft.mode === "create") return;

  if (!draft.targetBatchId || draft.batch.batchId !== draft.targetBatchId) {
    throw new Error("Batch ID cannot change in a change request.");
  }
}

function createEmptyBatchDraft(): Pick<
  BatchChangeDraft,
  "batch" | "execution"
> {
  return {
    batch: {
      batchId: "",
      criticality: "MEDIUM",
      domain: "",
      environment: "PROD",
      name: "",
      owner: "",
      status: "ACTIVE",
    },
    execution: {
      command: "",
      platform: "GITHUB_ACTIONS",
      ref: "main",
      runnerLabel: "ubuntu-latest",
    },
  };
}

function createChangeRequestBranchName(
  batchId: string,
  mode: BatchChangeDraft["mode"],
  changeRequestId: string,
): string {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, "")
    .slice(0, 14);
  const batchSlug = assertCanonicalBatchId(batchId).toLowerCase();
  const changeSlug = toSafeBranchSegment(changeRequestId);
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
    throw new Error("GitHub did not return the change request creation time.");
  }

  return pullRequest.createdAt;
}

function requireBaseSha(pullRequest: GitHubPullRequest): string {
  if (!pullRequest.baseSha) {
    throw new Error("GitHub did not return the change request base SHA.");
  }

  return pullRequest.baseSha;
}

function requireHeadSha(pullRequest: GitHubPullRequest): string {
  if (!pullRequest.headSha) {
    throw new Error("GitHub did not return the change request head SHA.");
  }

  return pullRequest.headSha;
}

async function requireApprovableChange(
  client: GitHubLiteClient,
  repository: RepoRef,
  pullRequest: GitHubPullRequest,
): Promise<ChangeRequestDetail> {
  const detail = await loadChangeRequestDetail(client, repository, pullRequest);

  if (!pullRequest.headSha || detail.reviewState === "LEGACY_UNAPPROVABLE") {
    return { ...detail, reviewState: "REAPPROVAL_REQUIRED" };
  }

  if (detail.reviewState === "REAPPROVAL_REQUIRED") return detail;

  if (
    detail.reviewState !== "OPEN" &&
    detail.reviewState !== "APPROVED_PENDING_MERGE"
  ) {
    throw new Error("The change request is no longer awaiting approval.");
  }

  if (
    !(await hasAuthoritativeChangeRequest(
      client,
      repository,
      pullRequest,
      parseChangeRequestEvidence(pullRequest.body),
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
    body: buildUnverifiedChangeRequestDispositionBody({
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
  detail: ChangeRequestDetail;
  decisionSource: "USER" | "WORKSPACE_POLICY";
  pullRequest: GitHubPullRequest;
  repository: RepoRef;
}): Promise<ChangeRequestDetail> {
  const requestEvidence = parseChangeRequestEvidence(pullRequest.body);

  if (!requestEvidence || !pullRequest.headSha) {
    return { ...detail, reviewState: "REAPPROVAL_REQUIRED" };
  }

  const requestDigest = await createChangeRequestDigest(requestEvidence);
  await client.createIssueComment({
    ...repository,
    body: buildChangeRequestDecisionBody({
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
  const refreshedDetail = await loadChangeRequestDetail(
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
  detail: ChangeRequestDetail;
  pullRequest: GitHubPullRequest;
  repository: RepoRef;
}): Promise<ChangeRequestDetail> {
  if (detail.reviewState !== "APPROVED_PENDING_MERGE") {
    return detail;
  }

  const evidence = parseChangeRequestEvidence(pullRequest.body);
  if (
    !evidence ||
    !pullRequest.headSha ||
    (await hasChangedChangeRequestBase(client, repository, evidence))
  ) {
    return loadChangeRequestDetail(client, repository, pullRequest);
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

  return loadChangeRequestDetail(client, repository, refreshed);
}

async function requireCurrentApprovalAuthorization({
  client,
  pullRequest,
  repository,
}: {
  client: GitHubLiteClient;
  pullRequest: GitHubPullRequest;
  repository: RepoRef;
}): Promise<{ authorizationRevisionSha: string }> {
  const evidence = parseChangeRequestEvidence(pullRequest.body);

  if (!evidence) {
    throw new Error("The change request evidence is unavailable.");
  }

  const [actor, authorization] = await Promise.all([
    client.getCurrentUser(),
    loadCurrentWorkspaceAuthorization(client, repository),
  ]);
  const [actorHasApproverRole, actorHasRequesterRole] = await Promise.all([
    hasChangeRequestRole(
      client,
      repository,
      actor.login,
      authorization.roleMapping.roles.approver,
    ),
    hasChangeRequestRole(
      client,
      repository,
      actor.login,
      authorization.roleMapping.roles.requester,
    ),
  ]);
  const decision = authorizeChangeRequestApproval({
    actorHasApproverRole,
    actorHasRequesterRole,
    actorIsRequester: actor.login === evidence.requester,
    approvalMode: authorization.policy.approval.mode,
  });

  if (!decision.allowed) throw new Error(decision.reason);

  return { authorizationRevisionSha: authorization.authorizationRevisionSha };
}

async function rejectPendingBatchControl(
  client: GitHubLiteClient,
  repository: RepoRef,
  batchId: string,
): Promise<void> {
  const blocker = await findPendingBatchControl(client, repository, batchId);

  if (blocker) {
    throw new Error(
      `A pending ${blocker.kind === "CHANGE_REQUEST" ? "change request" : "execution request"} already controls this batch: ${blocker.requestLocator}.`,
    );
  }
}

async function findPendingBatchControl(
  client: GitHubLiteClient,
  repository: RepoRef,
  batchId: string,
): Promise<BatchChangeBlocker | null> {
  const [pullRequests, issues] = await Promise.all([
    client.listPullRequests({ ...repository, state: "open" }),
    client.listIssues({ ...repository, state: "open" }),
  ]);

  for (const pullRequest of pullRequests) {
    const evidence = parseChangeRequestEvidence(pullRequest.body);
    if (!evidence || evidence.batchId !== batchId) continue;

    const detail = await loadChangeRequestDetail(
      client,
      repository,
      pullRequest,
    );
    if (
      detail.reviewState === "OPEN" ||
      detail.reviewState === "APPROVED_PENDING_MERGE"
    ) {
      return {
        kind: "CHANGE_REQUEST",
        requestLocator: String(pullRequest.number),
        title: pullRequest.title,
      };
    }
  }

  const issue = issues.find(
    (candidate) =>
      !candidate.isPullRequest &&
      candidate.labels.includes("batchplane:execution-request") &&
      readExecutionRequestBatchId(candidate.body) === batchId &&
      !hasTerminalExecutionLabel(candidate.labels),
  );

  return issue
    ? {
        kind: "EXECUTION_REQUEST",
        requestLocator: String(issue.number),
        title: issue.title,
      }
    : null;
}

function readExecutionRequestBatchId(body: string): string | null {
  const match =
    /<!--\s*batchplane:execution-request[\s\S]*?^batchId=(.+)$/m.exec(body);

  return match?.[1]?.trim() || null;
}

function hasTerminalExecutionLabel(labels: string[]): boolean {
  return ["dispatched", "dispatch-failed", "gate-blocked", "rejected"].some(
    (status) => labels.includes(`batchplane:${status}`),
  );
}

async function resolveUnmergedChangeState(
  client: GitHubLiteClient,
  repository: RepoRef,
  pullRequest: GitHubPullRequest,
): Promise<ChangeRequestDetail> {
  return loadChangeRequestDetail(client, repository, pullRequest);
}

async function applyWorkspaceAutoApproval({
  client,
  pullRequest,
  repository,
}: {
  client: GitHubLiteClient;
  pullRequest: GitHubPullRequest;
  repository: RepoRef;
}): Promise<ChangeRequest> {
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
  const evidence = parseChangeRequestEvidence(refreshedPullRequest.body);

  const actor = await client.getCurrentUser();
  const { authorizationRevisionSha, policy, roleMapping } =
    await loadCurrentWorkspaceAuthorization(client, repository);
  const actorHasRequesterRole = evidence
    ? await hasChangeRequestRole(
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

  return loadChangeRequestDetail(client, repository, projectedPullRequest);
}
