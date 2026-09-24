import type { GitHubRepositoryContext } from "./github-types.js";
import type {
  FailureFollowUp,
  FailureFollowUpReviewCapability,
  FailureFollowUpReviewDecision,
  WorkspacePolicy,
} from "@batchplane/domain";
import type { BatchPlaneClient } from "@batchplane/ui-client";
import { loadFailureFollowUpRunContext } from "./execution-run-evidence.js";
import {
  createFailureFollowUpProjectionContext,
  projectFailureFollowUps,
} from "./failure-follow-up-projection.js";
import {
  buildFailureFollowUpComment,
  buildFailureFollowUpReviewComment,
} from "./failure-follow-up-records.js";
import type { GitHubIssueComment } from "./github-types.js";
import {
  loadWorkspacePolicy,
  type ExecutionRequestForRun,
} from "./inspection-context.js";

type FollowUpInput = Parameters<BatchPlaneClient["createFailureFollowUp"]>[0];
type ReviewInput = Parameters<BatchPlaneClient["reviewFailureFollowUp"]>[0];
type WriteContext = GitHubRepositoryContext & {
  request: ExecutionRequestForRun;
  evidenceRunId: string;
  sourceRunId: number;
  actorLogin: string;
  workspacePolicy: WorkspacePolicy;
};

export function createGitHubLiteFailureFollowUpClient(
  context: GitHubRepositoryContext,
): Pick<BatchPlaneClient, "createFailureFollowUp" | "reviewFailureFollowUp"> {
  const reviewsInFlight = new Set<string>();
  return {
    createFailureFollowUp: (input) => recordFailureFollowUp(context, input),
    async reviewFailureFollowUp(input) {
      const reason = input.reason.trim();
      if (!reason) throw new Error("A review reason is required.");
      if (reviewsInFlight.has(input.followUpId))
        throw new Error("A review decision is already being recorded.");
      reviewsInFlight.add(input.followUpId);
      try {
        return await recordReview(context, { ...input, reason });
      } finally {
        reviewsInFlight.delete(input.followUpId);
      }
    },
  };
}

async function loadWriteContext(
  context: GitHubRepositoryContext,
  runId: string,
): Promise<WriteContext> {
  const { request, run, evidenceRunId } = await loadFailureFollowUpRunContext({
    ...context,
    runId,
  });
  if (!request)
    throw new Error("Execution request evidence was not found for this run.");
  const [user, workspacePolicy] = await Promise.all([
    context.client.getCurrentUser(),
    loadWorkspacePolicy(context),
  ]);
  return {
    ...context,
    request,
    evidenceRunId,
    sourceRunId: run.id,
    actorLogin: user.login,
    workspacePolicy,
  };
}

async function recordFailureFollowUp(
  context: GitHubRepositoryContext,
  input: FollowUpInput,
) {
  const fields = normalizeFollowUp(input);
  const write = await loadWriteContext(context, input.runId);
  const followUp: FailureFollowUp = {
    ...fields,
    author: write.actorLogin,
    batchId: write.request.batchId,
    createdAt: new Date().toISOString(),
    followUpId: createFailureFollowUpId(write.sourceRunId),
    requestId: write.request.requestId,
    runId: write.evidenceRunId,
    reviewStatus: "AWAITING_REVIEW",
    reviews: [],
  };
  const comment = await write.client.createIssueComment({
    ...write.repositoryRef,
    issueNumber: write.request.issue.number,
    body: buildFailureFollowUpComment(followUp),
  });
  const persisted = findRunFollowUp(
    await projectWriteEvidence(write, comment),
    followUp.followUpId,
    write.evidenceRunId,
  );
  if (!persisted)
    throw new Error(
      "GitHub did not return verifiable failure follow-up evidence.",
    );
  return persisted;
}

function normalizeFollowUp({
  actionTaken,
  explanation,
  owner,
  status,
}: FollowUpInput) {
  const normalized = {
    actionTaken: actionTaken.trim(),
    explanation: explanation.trim(),
    owner: owner.trim(),
    status,
  };
  if (!normalized.actionTaken || !normalized.explanation || !normalized.owner) {
    throw new Error(
      "Failure follow-up explanation, action taken, and owner are required.",
    );
  }
  return normalized;
}

async function recordReview(
  context: GitHubRepositoryContext,
  input: ReviewInput,
) {
  const write = await loadWriteContext(context, input.runId);
  const followUp = requireReviewableFollowUp(
    await projectWriteEvidence(write),
    input.followUpId,
    write.evidenceRunId,
  );
  const review: FailureFollowUpReviewDecision = {
    approvalMode: write.workspacePolicy.approval.mode,
    batchId: followUp.batchId,
    decision: input.decision,
    followUpId: input.followUpId,
    reason: input.reason,
    requestId: followUp.requestId,
    reviewedAt: new Date().toISOString(),
    reviewer: write.actorLogin,
    reviewId: createFailureFollowUpReviewId(write.sourceRunId),
    runId: write.evidenceRunId,
    selfReview: followUp.author === write.actorLogin,
  };
  const comment = await write.client.createIssueComment({
    ...write.repositoryRef,
    issueNumber: write.request.issue.number,
    body: buildFailureFollowUpReviewComment(review),
  });
  const persisted = findRunFollowUp(
    await projectWriteEvidence(write, comment),
    input.followUpId,
    write.evidenceRunId,
  )?.reviews.find((candidate) => candidate.reviewId === review.reviewId);
  if (!persisted)
    throw new Error(
      "GitHub did not return verifiable failure follow-up review evidence.",
    );
  return persisted;
}

function projectWriteEvidence(
  write: WriteContext,
  comment?: GitHubIssueComment,
) {
  return projectFailureFollowUps({
    actorLogin: write.actorLogin,
    comments: comment
      ? [
          ...write.request.comments,
          {
            author: comment.author,
            body: comment.body,
            createdAt: comment.createdAt,
            id: comment.id,
            issueNumber: write.request.issue.number,
          },
        ]
      : write.request.comments,
    context: createFailureFollowUpProjectionContext(write),
    expectedRequest: write.request,
  });
}

function findRunFollowUp(
  followUps: FailureFollowUp[],
  followUpId: string,
  runId: string,
) {
  return followUps.find(
    (candidate) =>
      candidate.followUpId === followUpId && candidate.runId === runId,
  );
}

function requireReviewableFollowUp(
  followUps: FailureFollowUp[],
  followUpId: string,
  runId: string,
) {
  const followUp = findRunFollowUp(followUps, followUpId, runId);
  if (!followUp) throw new Error("Failure follow-up evidence was not found.");
  if (followUp.reviewStatus !== "AWAITING_REVIEW")
    throw new Error(
      "Failure follow-up has already received a review decision.",
    );
  if (!followUp.reviewCapability?.canReview)
    throw new Error(
      failureFollowUpReviewCapabilityError(
        followUp.reviewCapability?.unavailableReason,
      ),
    );
  return followUp;
}

export function createFailureFollowUpId(runId: number): string {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(16).slice(2, 10).padEnd(8, "0");

  return `ffu-${runId}-${suffix}`;
}

export function createFailureFollowUpReviewId(runId: number): string {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(16).slice(2, 10).padEnd(8, "0");

  return `ffur-${runId}-${suffix}`;
}

export function failureFollowUpReviewCapabilityError(
  reason: FailureFollowUpReviewCapability["unavailableReason"],
): string {
  if (reason === "SELF_REVIEW_BLOCKED") {
    return "Self-review is blocked by the Workspace approval policy.";
  }

  if (reason === "ALREADY_REVIEWED") {
    return "Failure follow-up has already received a review decision.";
  }

  if (reason === "PERMISSION_UNAVAILABLE") {
    return "Workspace manager permission could not be verified.";
  }

  return "Workspace manager permission is required to review failure follow-up evidence.";
}
