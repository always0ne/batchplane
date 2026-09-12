import {
  buildExecutionRequestIssue,
  createExecutionRequestId,
  type BatchDefinition,
  type BatchPlaneRuntimePorts,
  type ExecutionRun,
} from "@batchplane/domain";
import { ExecutionRequestCreationUnavailableError } from "@batchplane/ui-client";
import type {
  ApprovalRequestInventory,
  BatchPlaneClient,
  ExecutionAttempt,
  ExecutionRequest,
  ExecutionRequestDraft,
  ExecutionRequestInput,
  ExecutionRequestPreview,
  MyWorkItem,
  MyWorkInventory,
  RequestInventoryItem,
  WorkspaceRequestInventory,
} from "@batchplane/ui-client";

import {
  buildExecutionApprovalComment,
  buildExecutionRejectionComment,
  getGovernedChangeRequestKind,
  parseExecutionRequestDetail,
  type ExecutionApprovalRequest,
} from "./execution-approval-legacy.js";
import {
  deriveRegistrationReviewState,
  parseRegistrationApprovalDecision,
  parseRegistrationRequestSummary,
} from "./registration-approval-legacy.js";
import { parseGovernedChangeRequestEvidence } from "./governed-change-evidence.js";

type ExecutionApprovalClient = Pick<
  BatchPlaneClient,
  | "approveExecutionRequest"
  | "createExecutionRequest"
  | "getExecutionRequest"
  | "getMyWork"
  | "listApprovalRequests"
  | "listWorkspaceRequests"
  | "loadExecutionRequestDraft"
  | "previewExecutionRequest"
  | "rejectExecutionRequest"
>;

type ExecutionRequestInventoryItem = Extract<
  RequestInventoryItem,
  { kind: "EXECUTION" }
>;

export function createGitHubLiteExecutionApprovalClient({
  runtime,
}: {
  runtime: BatchPlaneRuntimePorts;
}): ExecutionApprovalClient {
  return {
    async loadExecutionRequestDraft({ batchId }) {
      const repository = await runtime.settings.getRepository();
      const [batches, user, policy] = await Promise.all([
        runtime.batches.listBatchDefinitions({ ref: repository.defaultBranch }),
        runtime.settings.getCurrentUser(),
        runtime.settings.getWorkspacePolicy({ ref: repository.defaultBranch }),
      ]);
      const batch = batches.find((candidate) => candidate.batchId === batchId);

      if (!batch) return { batchId, type: "not-found" as const };

      const requestedAt = new Date();
      const approvedBatchRevision =
        await runtime.executions.getApprovedBatchRevision({
          batchId,
        });

      return {
        draft: {
          approvedBatchRevision,
          batch: toDraftBatch(batch),
          creationCapability: creationCapabilityFor(batch),
          requestId: createExecutionRequestId(batch.batchId, requestedAt),
          requestedAt: requestedAt.toISOString(),
          requestedBy: user.login,
          workspaceApprovalMode: policy.approval.mode,
          workspaceLabel: workspaceLabel(repository),
        },
        type: "ready" as const,
      };
    },

    async previewExecutionRequest(input) {
      return {
        request: projectPreview(
          await buildRequestIssue(input),
          input.draft.workspaceLabel,
        ),
      };
    },

    async createExecutionRequest(input) {
      const issue = await buildRequestIssue(input);
      const created = await runtime.executions.createExecutionRequest({
        body: issue.body,
        labels: issue.labels,
        title: issue.title,
      });
      const createdRequest = requireParsedRequest(created, []);

      if (input.draft.workspaceApprovalMode !== "AUTO_APPROVE") {
        return {
          request: projectRequest(
            createdRequest,
            capabilityFor(createdRequest, input.draft),
            undefined,
            input.draft.workspaceLabel,
            approvalNoticeFor(createdRequest, input.draft),
          ),
        };
      }

      const approvalBody = buildExecutionApprovalComment({
        approvalMode: input.draft.workspaceApprovalMode,
        approvalType: "WORKSPACE_AUTO_APPROVED",
        approvedAt: new Date(),
        approver: input.draft.requestedBy,
        request: createdRequest,
      });
      let approvalComment;

      try {
        approvalComment = await runtime.approvals.approveExecution({
          body: approvalBody,
          issueNumber: created.number,
        });
      } catch {
        return {
          postCreateError: { code: "AUTO_APPROVAL_RECORDING_FAILED" },
          request: projectRequest(
            createdRequest,
            capabilityFor(createdRequest, input.draft),
            undefined,
            input.draft.workspaceLabel,
            approvalNoticeFor(createdRequest, input.draft),
          ),
        };
      }
      const approvedRequest = requireParsedRequest(created, [approvalComment]);

      return {
        request: projectRequest(
          approvedRequest,
          capabilityFor(approvedRequest, input.draft),
          undefined,
          input.draft.workspaceLabel,
          approvalNoticeFor(approvedRequest, input.draft),
        ),
      };
    },

    async getExecutionRequest({ requestLocator }) {
      const issueNumber = parseLocator(requestLocator);
      const issue = await runtime.approvals.getExecutionRequestIssue({
        issueNumber,
      });
      if (!issue) return null;
      const comments = await runtime.approvals.listExecutionRequestComments({
        issueNumber,
      });
      const parsed = parseExecutionRequestDetail(issue, comments);
      if (!parsed) return null;

      const [draft, attempts, sourceChange] = await Promise.all([
        loadCapabilityDraft(runtime),
        loadAttempts(runtime, parsed),
        loadSourceChange(runtime, parsed),
      ]);

      return projectRequest(
        parsed,
        capabilityFor(parsed, draft),
        attempts,
        draft.workspaceLabel,
        approvalNoticeFor(parsed, draft),
        sourceChange,
      );
    },

    async approveExecutionRequest({ requestLocator }) {
      const { comments, issue, parsed } = await loadCurrentRequest(
        runtime,
        requestLocator,
      );
      const draft = await loadCapabilityDraft(runtime);
      const capability = capabilityFor(parsed, draft);
      if (!capability.canApprove)
        throw new Error("The execution request is not currently approvable.");

      const approvalComment = await runtime.approvals.approveExecution({
        body: buildExecutionApprovalComment({
          approvalMode: draft.workspaceApprovalMode,
          approvedAt: new Date(),
          approver: draft.requestedBy,
          request: parsed,
        }),
        issueNumber: issue.number,
      });
      const updated = requireParsedRequest(issue, [
        ...comments,
        approvalComment,
      ]);

      return projectRequest(
        updated,
        capabilityFor(updated, draft),
        undefined,
        draft.workspaceLabel,
        approvalNoticeFor(updated, draft),
      );
    },

    async rejectExecutionRequest({ reason, requestLocator }) {
      const normalizedReason = reason.trim();
      if (!normalizedReason) throw new Error("A rejection reason is required.");

      const { comments, issue, parsed } = await loadCurrentRequest(
        runtime,
        requestLocator,
      );
      const draft = await loadCapabilityDraft(runtime);
      const capability = capabilityFor(parsed, draft);
      if (!capability.canReject)
        throw new Error("The execution request is not currently rejectable.");

      const rejectedAt = new Date();
      const body = buildExecutionRejectionComment({
        reason: normalizedReason,
        rejectedAt,
        rejector: draft.requestedBy,
        request: parsed,
      });
      await runtime.approvals.rejectExecution({
        body,
        issueNumber: issue.number,
      });

      const localComment = {
        author: draft.requestedBy,
        body,
        createdAt: rejectedAt.toISOString(),
        id: Number.MAX_SAFE_INTEGER,
        issueNumber: issue.number,
      };
      const updated = requireParsedRequest(issue, [...comments, localComment]);

      return projectRequest(
        updated,
        capabilityFor(updated, draft),
        undefined,
        draft.workspaceLabel,
        approvalNoticeFor(updated, draft),
      );
    },

    async listApprovalRequests(): Promise<ApprovalRequestInventory> {
      const [repository, requests] = await Promise.all([
        runtime.settings.getRepository(),
        loadRequestInventory(runtime),
      ]);

      return {
        requests: requests.filter((item) =>
          item.kind === "EXECUTION"
            ? item.request.triggerType !== "SCHEDULE" &&
              item.request.status === "REQUESTED" &&
              item.request.sourceState === "OPEN"
            : item.request.reviewState === "OPEN",
        ),
        workspaceDefaultBranch: repository.defaultBranch,
      };
    },

    async listWorkspaceRequests(): Promise<WorkspaceRequestInventory> {
      return { requests: await loadRequestInventory(runtime) };
    },

    async getMyWork(): Promise<MyWorkInventory> {
      const [actor, requests, runs] = await Promise.all([
        runtime.settings.getCurrentUser(),
        loadRequestInventory(runtime),
        runtime.executions.listExecutionRuns({ limit: 100 }),
      ]);

      return {
        currentUser: actor.login,
        items: [
          ...requests.flatMap((item) => requestWorkItems(item, actor.login)),
          ...failureFollowUpWorkItems(
            runs,
            requests.filter(
              (item): item is ExecutionRequestInventoryItem =>
                item.kind === "EXECUTION",
            ),
            actor.login,
          ),
        ],
      };
    },
  };
}

function buildRequestIssue(input: ExecutionRequestInput) {
  if (!input.draft.creationCapability.canCreate) {
    throw new ExecutionRequestCreationUnavailableError(
      input.draft.creationCapability.unavailableReasons,
    );
  }
  const requestedAt = parseTimestamp(input.draft.requestedAt, "requested time");
  const expiresAt = parseTimestamp(input.expiresAt, "expiry time");
  if (expiresAt <= requestedAt)
    throw new Error(
      "The execution request expiry must be after its requested time.",
    );

  return buildExecutionRequestIssue({
    approvedBatchRevision: input.draft.approvedBatchRevision,
    batch: toBatchDefinition(input.draft),
    expiresAt,
    parameters: input.parameters,
    reason: input.reason,
    requestId: input.draft.requestId,
    requestedAt,
    requestedBy: input.draft.requestedBy,
    workflowRef: input.workflowRef,
  });
}

function projectPreview(
  issue: Awaited<ReturnType<typeof buildRequestIssue>>,
  workspaceLabel: string,
) {
  const parsed = requireParsedRequest(
    {
      author: parsedAuthor(issue),
      body: issue.body,
      isPullRequest: false,
      labels: issue.labels,
      number: 0,
      state: "open",
      title: issue.title,
      url: "",
    },
    [],
  );
  const projected = projectRequest(
    parsed,
    {
      canApprove: false,
      canReject: false,
      approveUnavailableReason: "NOT_AWAITING_APPROVAL",
      rejectUnavailableReason: "NOT_AWAITING_APPROVAL",
    },
    undefined,
    workspaceLabel,
  );

  const preview: ExecutionRequestPreview["request"] &
    Partial<
      Pick<
        ExecutionRequest,
        | "attempts"
        | "capability"
        | "requestLocator"
        | "sourceLabel"
        | "sourceUrl"
      >
    > = { ...projected };
  delete preview.attempts;
  delete preview.capability;
  delete preview.requestLocator;
  delete preview.sourceLabel;
  delete preview.sourceUrl;
  return preview;
}

function parsedAuthor(issue: Awaited<ReturnType<typeof buildRequestIssue>>) {
  return issue.request.requestedBy;
}

async function loadCurrentRequest(
  runtime: BatchPlaneRuntimePorts,
  requestLocator: string,
) {
  const issueNumber = parseLocator(requestLocator);
  const issue = await runtime.approvals.getExecutionRequestIssue({
    issueNumber,
  });
  if (!issue) throw new Error("The execution request could not be found.");
  const comments = await runtime.approvals.listExecutionRequestComments({
    issueNumber,
  });
  const parsed = requireParsedRequest(issue, comments);
  return { comments, issue, parsed };
}

async function loadCapabilityDraft(
  runtime: BatchPlaneRuntimePorts,
): Promise<
  Pick<
    ExecutionRequestDraft,
    "requestedBy" | "workspaceApprovalMode" | "workspaceLabel"
  >
> {
  const [user, repository] = await Promise.all([
    runtime.settings.getCurrentUser(),
    runtime.settings.getRepository(),
  ]);
  const policy = await runtime.settings.getWorkspacePolicy({
    ref: repository.defaultBranch,
  });
  return {
    requestedBy: user.login,
    workspaceApprovalMode: policy.approval.mode,
    workspaceLabel: workspaceLabel(repository),
  };
}

function capabilityFor(
  request: ExecutionApprovalRequest,
  context: Pick<ExecutionRequestDraft, "requestedBy" | "workspaceApprovalMode">,
) {
  const pending =
    request.triggerType !== "SCHEDULE" && request.status === "REQUESTED";
  const selfBlocked =
    request.requestedBy === context.requestedBy &&
    context.workspaceApprovalMode === "SELF_APPROVAL_BLOCKED";

  return {
    canApprove: pending && !selfBlocked,
    canReject: pending,
    ...(!pending
      ? {
          approveUnavailableReason: "NOT_AWAITING_APPROVAL" as const,
          rejectUnavailableReason: "NOT_AWAITING_APPROVAL" as const,
        }
      : selfBlocked
        ? { approveUnavailableReason: "SELF_APPROVAL_BLOCKED" as const }
        : {}),
  };
}

async function loadExecutionRequestItems(
  runtime: BatchPlaneRuntimePorts,
): Promise<ExecutionRequestInventoryItem[]> {
  const issues = await runtime.approvals.listExecutionRequestIssues({
    state: "all",
  });
  const [user, repository] = await Promise.all([
    runtime.settings.getCurrentUser(),
    runtime.settings.getRepository(),
  ]);
  const policy = await runtime.settings.getWorkspacePolicy({
    ref: repository.defaultBranch,
  });
  const capabilityContext = {
    requestedBy: user.login,
    workspaceApprovalMode: policy.approval.mode,
    workspaceLabel: workspaceLabel(repository),
  };

  const registrationRequests = await runtime.approvals.listRegistrationRequests(
    {
      baseBranch: repository.defaultBranch,
      state: "all",
    },
  );

  return Promise.all(
    issues.map(async (issue): Promise<ExecutionRequestInventoryItem | null> => {
      const comments = await runtime.approvals.listExecutionRequestComments({
        issueNumber: issue.number,
      });
      const parsed = parseExecutionRequestDetail(issue, comments);
      if (!parsed) return null;
      return {
        actor: parsed.requestedBy || issue.author,
        kind: "EXECUTION",
        request: projectRequest(
          parsed,
          capabilityFor(parsed, capabilityContext),
          undefined,
          workspaceLabel(repository),
          approvalNoticeFor(parsed, capabilityContext),
          sourceChangeFor(parsed, registrationRequests),
        ),
        targetLabel: parsed.schedule
          ? [parsed.batchId, parsed.schedule.scheduleId].join(" / ")
          : parsed.batchId,
        title: issue.title,
        updatedAt: issue.updatedAt ?? issue.createdAt ?? parsed.requestedAt,
      };
    }),
  ).then((items) =>
    items.filter(
      (item): item is ExecutionRequestInventoryItem => item !== null,
    ),
  );
}

async function loadRequestInventory(
  runtime: BatchPlaneRuntimePorts,
): Promise<RequestInventoryItem[]> {
  const [execution, governed] = await Promise.all([
    loadExecutionRequestItems(runtime),
    loadGovernedChangeRequestItems(runtime),
  ]);

  return [...execution, ...governed];
}

async function loadGovernedChangeRequestItems(
  runtime: BatchPlaneRuntimePorts,
): Promise<Extract<RequestInventoryItem, { kind: "GOVERNED_CHANGE" }>[]> {
  const repository = await runtime.settings.getRepository();
  const pullRequests = await runtime.approvals.listRegistrationRequests({
    baseBranch: repository.defaultBranch,
    state: "all",
  });
  const comments = await Promise.all(
    pullRequests.map((pullRequest) =>
      runtime.approvals.listExecutionRequestComments({
        issueNumber: pullRequest.number,
      }),
    ),
  );

  return pullRequests.flatMap((pullRequest, index) => {
    const kind = getGovernedChangeRequestKind(pullRequest);
    if (!kind) return [];

    try {
      const summary = parseRegistrationRequestSummary(pullRequest);
      const decision = parseRegistrationApprovalDecision(comments[index] ?? []);
      const reviewState = deriveRegistrationReviewState(pullRequest, decision);

      return [
        {
          actor: pullRequest.author,
          changeKind: toGovernedChangeKind(kind, summary.requestType),
          kind: "GOVERNED_CHANGE" as const,
          request: {
            batchId: summary.batchId,
            requestLocator: String(pullRequest.number),
            requester: pullRequest.author,
            reviewState,
            sourceLabel: `PR #${pullRequest.number}`,
            sourceState: pullRequest.state === "open" ? "OPEN" : "CLOSED",
            sourceUrl: pullRequest.url,
            title: `#${pullRequest.number} ${pullRequest.title}`,
            workspaceLabel: workspaceLabel(repository),
          },
          targetLabel: summary.batchId,
          title: pullRequest.title,
          updatedAt: pullRequest.updatedAt ?? pullRequest.createdAt ?? "",
        },
      ];
    } catch {
      return [];
    }
  });
}

async function loadAttempts(
  runtime: BatchPlaneRuntimePorts,
  request: ExecutionApprovalRequest,
) {
  try {
    const runs = await runtime.executions.listExecutionRuns({
      batchId: request.batchId,
      limit: 10,
      requestId: request.requestId,
      workflowPath: request.workflow?.path,
    });
    return { attempts: runs.map(toAttempt), type: "loaded" as const };
  } catch {
    return { type: "unavailable" as const };
  }
}

function projectRequest(
  request: ExecutionApprovalRequest,
  capability: ExecutionRequest["capability"],
  attempts: ExecutionRequest["attempts"] = { attempts: [], type: "loaded" },
  workspace = "",
  approvalNotice?: ExecutionRequest["approvalNotice"],
  sourceChange?: ExecutionRequest["evidence"]["sourceChange"],
): ExecutionRequest {
  return {
    ...(request.approvalDecision
      ? {
          approvalDecision: {
            ...request.approvalDecision,
            source: request.comments.some((comment) =>
              comment.body.includes("Approval source: WORKSPACE_POLICY"),
            )
              ? ("WORKSPACE_POLICY" as const)
              : ("USER" as const),
          },
        }
      : {}),
    ...(approvalNotice ? { approvalNotice } : {}),
    attempts,
    batch: {
      criticality: request.canonicalPayload?.spec.batch.criticality ?? "",
      domain: request.canonicalPayload?.spec.batch.domain ?? "",
      environment: request.canonicalPayload?.spec.batch.environment ?? "",
      name: request.canonicalPayload?.spec.batch.name ?? "",
      owner: request.canonicalPayload?.spec.batch.owner ?? "",
    },
    batchId: request.batchId,
    capability,
    ...(request.dispatcherStatus
      ? { dispatcher: request.dispatcherStatus }
      : {}),
    evidence: {
      approvedBatchRevision:
        request.canonicalPayload?.spec.approvedBatchRevision ?? null,
      canonicalPayload: request.canonicalPayload
        ? JSON.stringify(request.canonicalPayload, null, 2)
        : request.issue.body,
      requestDigest: request.requestDigest,
      ...(sourceChange ? { sourceChange } : {}),
    },
    ...(request.execution ? { execution: request.execution } : {}),
    expiresAt: request.expiresAt,
    ...(request.gateDecision ? { gateDecision: request.gateDecision } : {}),
    reason: request.reason,
    requestId: request.requestId,
    requestLocator: String(request.issue.number),
    requestedAt: request.requestedAt,
    requestedBy: request.requestedBy,
    ...(request.schedule ? { schedule: request.schedule } : {}),
    sourceLabel: `Issue #${request.issue.number}`,
    sourceState: request.issue.state === "open" ? "OPEN" : "CLOSED",
    sourceUrl: request.issue.url,
    status: request.status,
    title: `#${request.issue.number} ${request.issue.title}`,
    triggerType: request.triggerType,
    updatedAt: request.issue.updatedAt ?? "",
    ...(request.workflow ? { workflow: request.workflow } : {}),
    workspaceLabel: workspace,
  };
}

async function loadSourceChange(
  runtime: BatchPlaneRuntimePorts,
  request: ExecutionApprovalRequest,
): Promise<ExecutionRequest["evidence"]["sourceChange"]> {
  if (!request.canonicalPayload?.spec.approvedBatchRevision) return undefined;

  const repository = await runtime.settings.getRepository();
  const pullRequests = await runtime.approvals.listRegistrationRequests({
    baseBranch: repository.defaultBranch,
    state: "all",
  });

  return sourceChangeFor(request, pullRequests);
}

function sourceChangeFor(
  request: ExecutionApprovalRequest,
  pullRequests: Awaited<
    ReturnType<BatchPlaneRuntimePorts["approvals"]["listRegistrationRequests"]>
  >,
): ExecutionRequest["evidence"]["sourceChange"] {
  const revision = request.canonicalPayload?.spec.approvedBatchRevision;
  if (!revision) return undefined;

  const matches = pullRequests.flatMap((pullRequest) => {
    const evidence = parseGovernedChangeRequestEvidence(pullRequest.body);

    return evidence &&
      evidence.governedChangeId === revision.governedChangeId &&
      evidence.targetRevisionDigest === revision.targetRevisionDigest &&
      evidence.batchId === request.batchId
      ? [
          {
            label: `PR #${pullRequest.number}`,
            requestLocator: String(pullRequest.number),
          },
        ]
      : [];
  });

  return matches.length === 1 ? matches[0] : undefined;
}

function approvalNoticeFor(
  request: ExecutionApprovalRequest,
  context: Pick<ExecutionRequestDraft, "requestedBy" | "workspaceApprovalMode">,
): ExecutionRequest["approvalNotice"] {
  if (
    request.requestedBy !== context.requestedBy ||
    (context.workspaceApprovalMode !== "SELF_APPROVAL_ALLOWED" &&
      context.workspaceApprovalMode !== "AUTO_APPROVE")
  ) {
    return undefined;
  }

  return {
    kind: "SELF_APPROVAL_ALLOWED",
    mode: context.workspaceApprovalMode,
  };
}

function toAttempt(
  run: ExecutionRun & { nativeSchedule?: ExecutionAttempt["nativeSchedule"] },
): ExecutionAttempt {
  return {
    ...(run.actor ? { actor: run.actor } : {}),
    attempt: run.runAttempt ?? 1,
    attemptLocator: run.runId,
    ...(run.completedAt ? { completedAt: run.completedAt } : {}),
    ...(run.gateDecision ? { gateDecision: run.gateDecision } : {}),
    ...(run.jobs ? { jobs: run.jobs } : {}),
    ...(run.nativeSchedule ? { nativeSchedule: run.nativeSchedule } : {}),
    requestId: run.requestId,
    sourceLabel: run.workflowRunId ?? run.runId,
    ...(run.workflowRunUrl ? { sourceUrl: run.workflowRunUrl } : {}),
    ...(run.startedAt ? { startedAt: run.startedAt } : {}),
    status: run.status,
    workflow: {
      ...(run.workflowName ? { name: run.workflowName } : {}),
      ...(run.workflowPath ? { path: run.workflowPath } : {}),
    },
  };
}

function requestWorkItems(
  item: RequestInventoryItem,
  actor: string,
): MyWorkItem[] {
  const mine =
    item.kind === "EXECUTION"
      ? item.request.requestedBy === actor
      : item.request.requester === actor;
  const priority =
    item.kind === "EXECUTION" &&
    ["DISPATCH_FAILED", "GATE_BLOCKED"].includes(item.request.status)
      ? ("HIGH" as const)
      : ("NORMAL" as const);
  const awaitsDecision =
    item.kind === "EXECUTION"
      ? !mine && item.request.capability.canApprove
      : !mine && item.request.reviewState === "OPEN";
  return [
    ...(mine
      ? [
          {
            itemType: "REQUESTED_BY_YOU" as const,
            occurredAt:
              item.kind === "EXECUTION"
                ? executionWorkOccurredAt(item)
                : item.updatedAt,
            priority,
            request: item,
          },
        ]
      : []),
    ...(awaitsDecision
      ? [
          {
            itemType: "AWAITING_YOUR_DECISION" as const,
            occurredAt:
              item.kind === "EXECUTION"
                ? executionWorkOccurredAt(item)
                : item.updatedAt,
            priority: "HIGH" as const,
            request: item,
          },
        ]
      : []),
  ];
}

function executionWorkOccurredAt(item: ExecutionRequestInventoryItem): string {
  return item.request.requestedAt || item.request.updatedAt || "";
}

function toGovernedChangeKind(
  kind: ReturnType<typeof getGovernedChangeRequestKind>,
  requestType: "REGISTER" | "CHANGE" | "DELETE",
) {
  if (kind === "schedule") {
    return requestType === "REGISTER"
      ? ("SCHEDULE_REGISTER" as const)
      : ("SCHEDULE_CHANGE" as const);
  }
  if (requestType === "REGISTER") return "BATCH_REGISTER" as const;
  if (requestType === "DELETE") return "BATCH_DELETE" as const;
  return "BATCH_CHANGE" as const;
}

function failureFollowUpWorkItems(
  runs: ExecutionRun[],
  requests: ExecutionRequestInventoryItem[],
  actor: string,
): MyWorkItem[] {
  const requestsById = new Map(
    requests.map((item) => [item.request.requestId, item.request]),
  );
  const requestedByMe = new Set(
    requests
      .filter((item) => item.request.requestedBy === actor)
      .map((item) => item.request.requestId),
  );
  return runs.flatMap((run) => {
    if (run.status !== "FAILED" && run.status !== "BLOCKED") return [];
    const request = requestsById.get(run.requestId);
    const assignedInitialFollowUp =
      request?.triggerType === "SCHEDULE"
        ? request.batch.owner === actor
        : requestedByMe.has(run.requestId);
    const followUps = run.failureFollowUps ?? [];
    const source = toAttempt(run);
    const title = `${run.batchId || run.workflowName || `Run ${run.runId}`} - Run ${run.runId}`;
    const base = {
      attemptLocator: run.runId,
      batchId: run.batchId,
      isGateBlocked: run.status === "BLOCKED",
      requestId: run.requestId,
      sourceLabel: source.sourceLabel,
      ...(source.sourceUrl ? { sourceUrl: source.sourceUrl } : {}),
      title,
    };
    const reviewable = followUps.filter(
      (followUp) =>
        followUp.reviewStatus === "AWAITING_REVIEW" &&
        followUp.reviewCapability?.canReview,
    );
    const revise = followUps.filter(
      (followUp) =>
        ["CHANGES_REQUESTED", "REJECTED"].includes(followUp.reviewStatus) &&
        (followUp.owner === actor || followUp.author === actor),
    );
    const ongoing = followUps.filter(
      (followUp) =>
        followUp.reviewStatus === "AWAITING_REVIEW" &&
        ["OPEN", "INVESTIGATING"].includes(followUp.status) &&
        (followUp.owner === actor || followUp.author === actor) &&
        !reviewable.some(
          (candidate) => candidate.followUpId === followUp.followUpId,
        ),
    );
    return [
      ...reviewable.map((followUp) => ({
        ...base,
        action: "REVIEW_FOLLOW_UP" as const,
        actor: followUp.author,
        itemType: "FAILURE_FOLLOW_UP" as const,
        itemLocator: `follow-up:${followUp.followUpId}`,
        occurredAt: followUp.createdAt,
        priority: "HIGH" as const,
      })),
      ...revise.map((followUp) => ({
        ...base,
        action: "UPDATE_FOLLOW_UP" as const,
        actor: followUp.author,
        itemType: "FAILURE_FOLLOW_UP" as const,
        itemLocator: `follow-up:${followUp.followUpId}`,
        occurredAt: followUp.createdAt,
        priority: "HIGH" as const,
        revisionReason: followUp.reviewStatus as
          | "CHANGES_REQUESTED"
          | "REJECTED",
      })),
      ...ongoing.map((followUp) => ({
        ...base,
        action: "CONTINUE_FOLLOW_UP" as const,
        actor: followUp.author,
        itemType: "FAILURE_FOLLOW_UP" as const,
        itemLocator: `follow-up:${followUp.followUpId}`,
        occurredAt: followUp.createdAt,
        priority: "NORMAL" as const,
      })),
      ...(followUps.length === 0 && assignedInitialFollowUp
        ? [
            {
              ...base,
              action:
                run.status === "BLOCKED"
                  ? ("REVIEW_GATE_EVIDENCE" as const)
                  : ("WRITE_FOLLOW_UP" as const),
              actor: run.actor ?? "",
              itemType: "FAILURE_FOLLOW_UP" as const,
              itemLocator: `run:${run.runId}:follow-up-needed`,
              occurredAt: run.completedAt ?? run.startedAt ?? "",
              priority: "HIGH" as const,
            },
          ]
        : []),
    ];
  });
}

function requireParsedRequest(
  issue: Parameters<typeof parseExecutionRequestDetail>[0],
  comments: Parameters<typeof parseExecutionRequestDetail>[1],
) {
  const request = parseExecutionRequestDetail(issue, comments);
  if (!request)
    throw new Error("The execution request evidence is unavailable.");
  return request;
}

function toDraftBatch(batch: BatchDefinition): ExecutionRequestDraft["batch"] {
  return {
    batchId: batch.batchId,
    criticality: batch.criticality,
    domain: batch.domain,
    environment: batch.environment,
    ...(batch.execution ? { execution: batch.execution } : {}),
    gateRequired: batch.gateRequired,
    name: batch.name,
    owner: batch.owner,
    status: batch.status,
    workflowPath: batch.workflow.path,
    workflowRef: batch.workflow.ref,
  };
}

function creationCapabilityFor(batch: BatchDefinition) {
  const unavailableReasons = [
    ...(batch.status !== "ACTIVE" ? (["BATCH_INACTIVE"] as const) : []),
    ...(!batch.gateRequired ? (["GATE_NOT_REQUIRED"] as const) : []),
    ...(!batch.execution?.command.trim()
      ? (["EXECUTION_COMMAND_UNAVAILABLE"] as const)
      : []),
  ];

  return {
    canCreate: unavailableReasons.length === 0,
    unavailableReasons,
  };
}

function workspaceLabel(repository: { owner: string; repo: string }) {
  return `${repository.owner}/${repository.repo}`;
}

function toBatchDefinition(draft: ExecutionRequestDraft): BatchDefinition {
  return {
    batchId: draft.batch.batchId,
    criticality: draft.batch.criticality as BatchDefinition["criticality"],
    domain: draft.batch.domain,
    environment: draft.batch.environment,
    ...(draft.batch.execution ? { execution: draft.batch.execution } : {}),
    gateRequired: draft.batch.gateRequired,
    name: draft.batch.name,
    owner: draft.batch.owner,
    status: draft.batch.status,
    workflow: { path: draft.batch.workflowPath, ref: draft.batch.workflowRef },
  };
}

function parseLocator(value: string) {
  const locator = Number(value);
  if (!Number.isInteger(locator) || locator <= 0)
    throw new Error("The execution request locator is invalid.");
  return locator;
}

function parseTimestamp(value: string, description: string) {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime()))
    throw new Error(`The execution request ${description} is invalid.`);
  return timestamp;
}
