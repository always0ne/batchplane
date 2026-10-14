import {
  createGitHubLiteClient,
  verifyApprovedBatchRevision,
  type ApprovedBatchRevisionResult,
} from "@batchplane/github-lite";
import {
  buildDispatchFailureComment,
  buildDispatchingComment,
  buildDispatchSuccessComment,
  buildDispatchUnconfirmedComment,
  isActionableApprovalComment,
  parseExecutionRequestEvidence,
  verifyDispatcherEvidence,
} from "./dispatcher-evidence.js";
import {
  createDispatcherGitHubClient,
  dispatcherLabels,
  isConfirmedDispatchRejection,
  type DispatcherGitHubClient,
} from "./dispatcher-github-client.js";
import { findExistingDispatchState } from "./dispatcher-dispatch-state.js";
import type {
  DispatcherDispatchPlan,
  DispatcherRunInput,
  DispatcherRunResult,
  DispatcherVerificationResult,
  ExecutionRequestEvidence,
} from "./dispatcher-types.js";

type DispatchContext = {
  client: DispatcherGitHubClient;
  dispatchPlan: DispatcherDispatchPlan;
  issueNumber: number;
};

export async function dispatchApprovedExecutionRequest(
  input: DispatcherRunInput,
): Promise<DispatcherRunResult> {
  const now = input.now === undefined ? new Date() : input.now;
  const preparation = await prepareDispatch(input, now);

  if ("status" in preparation) {
    return preparation;
  }

  await markDispatching(preparation);

  try {
    await preparation.client.dispatchWorkflow(preparation.dispatchPlan);
  } catch (error) {
    if (isConfirmedDispatchRejection(error)) {
      return recordWorkflowDispatchFailure(preparation, error);
    }
    return recordUnconfirmedDispatch(preparation, error);
  }

  try {
    await markDispatchSucceeded(preparation);
  } catch (error) {
    throw new Error(
      `Workflow dispatch was accepted, but its result could not be recorded: ${toErrorMessage(error)}`,
      { cause: error },
    );
  }

  return {
    dispatchPlan: preparation.dispatchPlan,
    status: "dispatched",
  };
}

async function prepareDispatch(
  input: DispatcherRunInput,
  now: Date,
): Promise<DispatchContext | DispatcherRunResult> {
  const apiBaseUrl =
    input.apiBaseUrl === undefined
      ? "https://api.github.com"
      : input.apiBaseUrl;
  const fetcher = input.fetcher === undefined ? fetch : input.fetcher;
  const client = createDispatcherGitHubClient({
    apiBaseUrl,
    fetcher,
    owner: input.owner,
    repo: input.repo,
    token: input.githubToken,
  });
  const [issue, commandComment, issueComments] = await Promise.all([
    client.getIssue(input.issueNumber),
    client.getIssueComment(input.commentId),
    client.listIssueComments(input.issueNumber),
  ]);
  if (!isActionableApprovalComment(commandComment.body)) {
    return {
      message: "Comment is not actionable BatchPlane approval evidence.",
      reasonCode: "IGNORED_COMMENT",
      status: "ignored",
    };
  }

  const request = parseExecutionRequestEvidence(issue.body);
  if (request) {
    const dispatchState = findExistingDispatchState({
      comments: issueComments,
      dispatchPlan: request,
      labels: issue.labels,
    });
    // Completed attempts keep their outcome even when a duplicate arrives later.
    if (dispatchState.handled) {
      return {
        message: dispatchState.message,
        reasonCode: dispatchState.reasonCode,
        status: "ignored",
      };
    }
  }

  const verification = verifyDispatcherEvidence({
    approvalCommentBody: commandComment.body,
    issueAuthor: issue.author,
    issueBody: issue.body,
    now,
  });

  if (!verification.ok) {
    return recordVerificationFailure({
      client,
      issueNumber: input.issueNumber,
      request,
      verification,
    });
  }

  const revision = await resolveApprovedBatchRevision({
    apiBaseUrl,
    batchId: verification.request.batchId,
    expectedRevision: verification.request.approvedBatchRevision,
    fetcher,
    input,
  });

  if (revision.controlStatus !== "VERIFIED") {
    return recordRevisionVerificationFailure({
      client,
      dispatchPlan: verification.dispatchPlan,
      issueNumber: input.issueNumber,
      revision,
    });
  }

  return {
    client,
    dispatchPlan: verification.dispatchPlan,
    issueNumber: input.issueNumber,
  };
}

async function recordVerificationFailure({
  client,
  issueNumber,
  request,
  verification,
}: {
  client: DispatcherGitHubClient;
  issueNumber: number;
  request: ExecutionRequestEvidence | null;
  verification: Exclude<DispatcherVerificationResult, { ok: true }>;
}): Promise<DispatcherRunResult> {
  const belongsToRequest =
    verification.reasonCode !== "DIGEST_MISMATCH" &&
    verification.reasonCode !== "REQUEST_FIELD_MISMATCH";
  if (
    request &&
    belongsToRequest &&
    verification.reasonCode !== "EXPIRED_REQUEST"
  ) {
    await client.createIssueComment(
      issueNumber,
      buildDispatchFailureComment(
        verification.message,
        verification.reasonCode,
        request,
      ),
    );
  }

  return {
    message: verification.message,
    reasonCode: verification.reasonCode,
    status: "failed",
  };
}

async function resolveApprovedBatchRevision({
  apiBaseUrl,
  batchId,
  expectedRevision,
  fetcher,
  input,
}: {
  apiBaseUrl: string;
  batchId: string;
  expectedRevision: ExecutionRequestEvidence["approvedBatchRevision"];
  fetcher: typeof fetch;
  input: DispatcherRunInput;
}): Promise<ApprovedBatchRevisionResult> {
  if (input.verifyBatchRevision) {
    return input.verifyBatchRevision({ batchId, expectedRevision });
  }

  return verifyApprovedBatchRevision({
    batchId,
    client: createGitHubLiteClient({
      apiBaseUrl,
      fetcher,
      token: input.githubToken,
    }),
    expectedRevision,
    repository: { owner: input.owner, repo: input.repo },
  });
}

async function recordRevisionVerificationFailure({
  client,
  dispatchPlan,
  issueNumber,
  revision,
}: {
  client: DispatcherGitHubClient;
  dispatchPlan: DispatcherDispatchPlan;
  issueNumber: number;
  revision: Exclude<ApprovedBatchRevisionResult, { controlStatus: "VERIFIED" }>;
}): Promise<DispatcherRunResult> {
  const reasonCode = revision.reasonCode;
  const message =
    revision.controlStatus === "UNKNOWN"
      ? "Approved Batch revision could not be verified before workflow dispatch."
      : "Batch revision does not match the latest approved governed change.";
  await client.createIssueComment(
    issueNumber,
    buildDispatchFailureComment(message, reasonCode, dispatchPlan),
  );

  return {
    dispatchPlan,
    message,
    reasonCode,
    status: "failed",
  };
}

async function markDispatching(context: DispatchContext) {
  await context.client.ensureLabels([
    dispatcherLabels.dispatching,
    dispatcherLabels.dispatched,
    dispatcherLabels.dispatchFailed,
  ]);
  await context.client.addIssueLabels(context.issueNumber, [
    dispatcherLabels.dispatching.name,
  ]);
  await context.client.createIssueComment(
    context.issueNumber,
    buildDispatchingComment(context.dispatchPlan),
  );
}

async function recordWorkflowDispatchFailure(
  context: DispatchContext,
  error: unknown,
): Promise<DispatcherRunResult> {
  await context.client.createIssueComment(
    context.issueNumber,
    buildDispatchFailureComment(
      toErrorMessage(error),
      "WORKFLOW_DISPATCH_FAILED",
      context.dispatchPlan,
    ),
  );
  await context.client.addIssueLabels(context.issueNumber, [
    dispatcherLabels.dispatchFailed.name,
  ]);
  await context.client.removeIssueLabel(
    context.issueNumber,
    dispatcherLabels.dispatching.name,
  );

  return {
    dispatchPlan: context.dispatchPlan,
    message: toErrorMessage(error),
    reasonCode: "WORKFLOW_DISPATCH_FAILED",
    status: "failed",
  };
}

async function markDispatchSucceeded(context: DispatchContext) {
  await context.client.createIssueComment(
    context.issueNumber,
    buildDispatchSuccessComment(context.dispatchPlan),
  );
  await context.client.addIssueLabels(context.issueNumber, [
    dispatcherLabels.dispatched.name,
  ]);
  await context.client.removeIssueLabel(
    context.issueNumber,
    dispatcherLabels.dispatching.name,
  );
}

async function recordUnconfirmedDispatch(
  context: DispatchContext,
  error: unknown,
): Promise<DispatcherRunResult> {
  const message = `Workflow acceptance could not be confirmed. Do not resend this request. ${toErrorMessage(error)}`;
  await context.client.createIssueComment(
    context.issueNumber,
    buildDispatchUnconfirmedComment(context.dispatchPlan, message),
  );
  return {
    dispatchPlan: context.dispatchPlan,
    message,
    reasonCode: "DISPATCH_ACCEPTANCE_UNCONFIRMED",
    status: "unconfirmed",
  };
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
