import {
  createGitHubLiteClient,
  verifyApprovedBatchRevision,
  type ApprovedBatchRevisionResult,
} from "@batchplane/github-lite";
import { parseDispatcherCommand } from "./dispatcher-command.js";
import {
  buildDispatchFailureComment,
  buildDispatchingComment,
  buildDispatchSuccessComment,
  isActionableApprovalComment,
  verifyDispatcherEvidence,
} from "./dispatcher-evidence.js";
import {
  createDispatcherGitHubClient,
  dispatcherLabels,
  type DispatcherGitHubClient,
} from "./dispatcher-github-client.js";
import {
  findExistingDispatchState,
  findRetryApprovalCommentBody,
  removeDispatchFailedLabels,
  verifyRetryDispatchState,
} from "./dispatcher-dispatch-state.js";
import type {
  DispatcherCommand,
  DispatcherDispatchPlan,
  DispatcherRunInput,
  DispatcherRunResult,
  DispatcherVerificationResult,
  ExecutionRequestEvidence,
} from "./dispatcher-types.js";

type DispatchContext = {
  client: DispatcherGitHubClient;
  command: Exclude<DispatcherCommand, "ignore">;
  dispatchPlan: DispatcherDispatchPlan;
  issue: Awaited<ReturnType<DispatcherGitHubClient["getIssue"]>>;
  issueComments: string[];
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

  if (preparation.command === "retry-dispatch") {
    const retryResult = await verifyAndRecordRetryState(preparation);

    if (retryResult) {
      return retryResult;
    }
  }

  const dispatchState = findExistingDispatchState({
    comments: preparation.issueComments,
    dispatchPlan: preparation.dispatchPlan,
    labels: preparation.issue.labels,
  });

  if (dispatchState.handled) {
    return {
      dispatchPlan: preparation.dispatchPlan,
      message: dispatchState.message,
      reasonCode: dispatchState.reasonCode,
      status: "ignored",
    };
  }

  await markDispatching(preparation);

  try {
    await preparation.client.dispatchWorkflow(preparation.dispatchPlan);
  } catch (error) {
    return recordWorkflowDispatchFailure(preparation, error);
  }

  await markDispatchSucceeded(preparation);

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
  const command = parseDispatcherCommand(commandComment.body);

  if (command === "ignore") {
    return {
      message: "Comment is not a BatchPlane dispatcher command.",
      reasonCode: "IGNORED_COMMENT",
      status: "ignored",
    };
  }

  if (
    command === "approve" &&
    !isActionableApprovalComment(commandComment.body)
  ) {
    return {
      message: "Comment is not actionable BatchPlane approval evidence.",
      reasonCode: "IGNORED_COMMENT",
      status: "ignored",
    };
  }

  const approvalCommentBody = selectApprovalCommentBody({
    command,
    commandCommentBody: commandComment.body,
    issueBody: issue.body,
    issueComments,
  });
  const verification = verifyDispatcherEvidence({
    approvalCommentBody,
    issueBody: issue.body,
    now,
  });

  if (!verification.ok) {
    return recordVerificationFailure({
      client,
      issueNumber: input.issueNumber,
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
    command,
    dispatchPlan: verification.dispatchPlan,
    issue,
    issueComments,
    issueNumber: input.issueNumber,
  };
}

function selectApprovalCommentBody({
  command,
  commandCommentBody,
  issueBody,
  issueComments,
}: {
  command: DispatcherCommand;
  commandCommentBody: string;
  issueBody: string;
  issueComments: string[];
}): string {
  return command === "retry-dispatch"
    ? (findRetryApprovalCommentBody({
        commandCommentBody,
        issueBody,
        issueComments,
      }) ?? commandCommentBody)
    : commandCommentBody;
}

async function recordVerificationFailure({
  client,
  issueNumber,
  verification,
}: {
  client: DispatcherGitHubClient;
  issueNumber: number;
  verification: Exclude<DispatcherVerificationResult, { ok: true }>;
}): Promise<DispatcherRunResult> {
  await client.createIssueComment(
    issueNumber,
    buildDispatchFailureComment(verification.message, verification.reasonCode),
  );

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

async function verifyAndRecordRetryState(
  context: DispatchContext,
): Promise<DispatcherRunResult | null> {
  const retryState = verifyRetryDispatchState({
    comments: context.issueComments,
    dispatchPlan: context.dispatchPlan,
    labels: context.issue.labels,
  });

  if (!retryState.ok) {
    await context.client.createIssueComment(
      context.issueNumber,
      buildDispatchFailureComment(
        retryState.message,
        retryState.reasonCode,
        context.dispatchPlan,
      ),
    );

    return {
      dispatchPlan: context.dispatchPlan,
      message: retryState.message,
      reasonCode: retryState.reasonCode,
      status: "failed",
    };
  }

  return null;
}

async function markDispatching(context: DispatchContext) {
  await context.client.ensureLabels([
    dispatcherLabels.dispatching,
    dispatcherLabels.dispatched,
    dispatcherLabels.dispatchFailed,
  ]);
  if (context.command === "retry-dispatch") {
    await removeDispatchFailedLabels(context.client, context.issueNumber);
  }
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
  await context.client.addIssueLabels(context.issueNumber, [
    dispatcherLabels.dispatchFailed.name,
  ]);
  await context.client.removeIssueLabel(
    context.issueNumber,
    dispatcherLabels.dispatching.name,
  );
  await context.client.createIssueComment(
    context.issueNumber,
    buildDispatchFailureComment(
      error instanceof Error ? error.message : String(error),
      "WORKFLOW_DISPATCH_FAILED",
      context.dispatchPlan,
    ),
  );

  return {
    dispatchPlan: context.dispatchPlan,
    message: error instanceof Error ? error.message : String(error),
    reasonCode: "WORKFLOW_DISPATCH_FAILED",
    status: "failed",
  };
}

async function markDispatchSucceeded(context: DispatchContext) {
  await removeDispatchFailedLabels(context.client, context.issueNumber);
  await context.client.addIssueLabels(context.issueNumber, [
    dispatcherLabels.dispatched.name,
  ]);
  await context.client.removeIssueLabel(
    context.issueNumber,
    dispatcherLabels.dispatching.name,
  );
  await context.client.createIssueComment(
    context.issueNumber,
    buildDispatchSuccessComment(context.dispatchPlan),
  );
}
