import type {
  FailureFollowUp,
  FailureFollowUpReviewCapability,
  FailureFollowUpReviewDecision,
  WorkspacePolicy,
} from "@batchplane/domain";
import type { RepositoryIssueComment } from "./github-runtime-contracts.js";
import {
  parseFailureFollowUpReviews,
  parseFailureFollowUps,
} from "./failure-follow-up-records.js";
import type { GitHubLiteClient } from "./github-types.js";
import {
  loadWorkspacePolicy,
  type ExecutionRequestForRun,
  type RuntimeRepositoryRef,
} from "./inspection-context.js";
type FailureFollowUpProjectionContext = {
  permissionByLogin: Map<string, Promise<string>>;
  repositoryRef: RuntimeRepositoryRef;
  workspacePolicy: WorkspacePolicy;
  client: GitHubLiteClient;
};

export function createFailureFollowUpProjectionContext({
  client,
  repositoryRef,
  workspacePolicy,
}: Omit<
  FailureFollowUpProjectionContext,
  "permissionByLogin"
>): FailureFollowUpProjectionContext {
  return {
    client,
    permissionByLogin: new Map(),
    repositoryRef,
    workspacePolicy,
  };
}

export async function projectFailureFollowUpsForRequests({
  client,
  includeReviewCapabilities,
  repositoryRef,
  requests,
}: {
  client: GitHubLiteClient;
  includeReviewCapabilities: boolean;
  repositoryRef: RuntimeRepositoryRef;
  requests: ExecutionRequestForRun[];
}): Promise<Map<number, FailureFollowUp[]>> {
  const uniqueRequests = new Map(
    requests.map((request) => [request.issue.number, request]),
  );
  const requestsWithFollowUps = [...uniqueRequests.values()].filter(
    hasFailureFollowUpsForExecutionRequest,
  );

  if (requestsWithFollowUps.length === 0) {
    return new Map();
  }

  const [workspacePolicy, user] = await Promise.all([
    loadWorkspacePolicy({ client, repositoryRef }),
    includeReviewCapabilities ? client.getCurrentUser() : undefined,
  ]);
  const context = createFailureFollowUpProjectionContext({
    client,
    repositoryRef,
    workspacePolicy,
  });
  const projections = await Promise.all(
    requestsWithFollowUps.map(
      async (request) =>
        [
          request.issue.number,
          await projectFailureFollowUps({
            ...(user ? { actorLogin: user.login } : {}),
            comments: request.comments,
            context,
            expectedRequest: request,
          }),
        ] as const,
    ),
  );

  return new Map(projections);
}

export function hasFailureFollowUpsForExecutionRequest(
  request: ExecutionRequestForRun,
): boolean {
  return parseFailureFollowUps(request.comments, []).some(
    (followUp) =>
      followUp.requestId === request.requestId &&
      followUp.batchId === request.batchId,
  );
}

export async function projectFailureFollowUps({
  actorLogin,
  comments,
  context,
  expectedRequest,
}: {
  actorLogin?: string;
  comments: RepositoryIssueComment[];
  context: FailureFollowUpProjectionContext;
  expectedRequest: Pick<ExecutionRequestForRun, "batchId" | "requestId">;
}): Promise<FailureFollowUp[]> {
  const followUpById = new Map<string, FailureFollowUp>();

  for (const followUp of parseFailureFollowUps(comments, [])) {
    if (
      followUp.requestId !== expectedRequest.requestId ||
      followUp.batchId !== expectedRequest.batchId ||
      followUpById.has(followUp.followUpId)
    ) {
      continue;
    }

    // The first structurally valid GitHub comment for an ID is authoritative.
    // Later duplicate markers must not replace its author or request relation.
    followUpById.set(followUp.followUpId, followUp);
  }

  const acceptedReviewByFollowUpId = new Set<string>();
  const verifiedReviews: FailureFollowUpReviewDecision[] = [];

  for (const parsedReview of parseFailureFollowUpReviews(comments)) {
    const followUp = followUpById.get(parsedReview.followUpId);

    if (
      !followUp ||
      !parsedReview.reason.trim() ||
      acceptedReviewByFollowUpId.has(followUp.followUpId)
    ) {
      continue;
    }

    try {
      const permission = await getFailureFollowUpReviewerPermission(
        context,
        parsedReview.reviewer,
      );
      const selfReview = parsedReview.reviewer === followUp.author;

      if (
        !isWorkspaceManagerPermission(permission) ||
        (selfReview &&
          context.workspacePolicy.approval.mode === "SELF_APPROVAL_BLOCKED")
      ) {
        continue;
      }

      acceptedReviewByFollowUpId.add(followUp.followUpId);
      verifiedReviews.push({
        approvalMode: context.workspacePolicy.approval.mode,
        batchId: followUp.batchId,
        decision: parsedReview.decision,
        followUpId: followUp.followUpId,
        reason: parsedReview.reason.trim(),
        requestId: followUp.requestId,
        reviewedAt: parsedReview.reviewedAt,
        reviewer: parsedReview.reviewer,
        reviewId: parsedReview.reviewId,
        runId: followUp.runId,
        selfReview,
      });
    } catch {
      // A permission lookup failure cannot create review evidence.
    }
  }

  const reviewsByFollowUpId = new Map<
    string,
    FailureFollowUpReviewDecision[]
  >();

  for (const review of verifiedReviews) {
    reviewsByFollowUpId.set(review.followUpId, [review]);
  }

  const followUps: FailureFollowUp[] = [...followUpById.values()].map(
    (followUp) => {
      const reviews = reviewsByFollowUpId.get(followUp.followUpId) ?? [];

      return {
        ...followUp,
        reviewStatus: reviews[0]?.decision ?? "AWAITING_REVIEW",
        reviews,
      };
    },
  );

  if (!actorLogin) {
    return followUps;
  }

  let actorPermission: string;

  try {
    actorPermission = await getFailureFollowUpReviewerPermission(
      context,
      actorLogin,
    );
  } catch {
    return followUps.map((followUp) => ({
      ...followUp,
      reviewCapability: {
        canReview: false,
        unavailableReason: "PERMISSION_UNAVAILABLE",
      },
    }));
  }

  return followUps.map((followUp) => ({
    ...followUp,
    reviewCapability: deriveFailureFollowUpReviewCapability({
      actorLogin,
      actorPermission,
      followUp,
      workspacePolicy: context.workspacePolicy,
    }),
  }));
}

export function getFailureFollowUpReviewerPermission(
  context: FailureFollowUpProjectionContext,
  login: string,
): Promise<string> {
  const existing = context.permissionByLogin.get(login);

  if (existing) {
    return existing;
  }

  const permission = context.client
    .getRepositoryPermissionForUser({
      ...context.repositoryRef,
      username: login,
    })
    .then((result) => result.permission);
  context.permissionByLogin.set(login, permission);

  return permission;
}

export function deriveFailureFollowUpReviewCapability({
  actorLogin,
  actorPermission,
  followUp,
  workspacePolicy,
}: {
  actorLogin: string;
  actorPermission: string;
  followUp: FailureFollowUp;
  workspacePolicy: WorkspacePolicy;
}): FailureFollowUpReviewCapability {
  if (followUp.reviewStatus !== "AWAITING_REVIEW") {
    return { canReview: false, unavailableReason: "ALREADY_REVIEWED" };
  }

  if (!isWorkspaceManagerPermission(actorPermission)) {
    return { canReview: false, unavailableReason: "NOT_WORKSPACE_MANAGER" };
  }

  if (
    followUp.author === actorLogin &&
    workspacePolicy?.approval.mode === "SELF_APPROVAL_BLOCKED"
  ) {
    return { canReview: false, unavailableReason: "SELF_REVIEW_BLOCKED" };
  }

  return { canReview: true };
}

export function isWorkspaceManagerPermission(permission: string): boolean {
  return permission === "admin" || permission === "maintain";
}
