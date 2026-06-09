import type {
  BatchPlaneRuntimePorts,
  RepositoryIssue,
  RepositoryIssueComment,
  RepositoryPullRequest,
} from "@batchplane/domain";

import {
  parseExecutionRequestDetail,
  type ExecutionRequestDisplayStatus,
} from "../approvals/approval-model";
import {
  deriveRegistrationReviewState,
  parseRegistrationApprovalDecision,
  parseRegistrationRequestSummary,
  type RegistrationReviewState,
} from "../approvals/registration-approval-model";

export type ChangeRequestBlocker =
  | {
      number: number;
      reviewState: RegistrationReviewState;
      title: string;
      type: "governed-change";
      url: string;
    }
  | {
      number: number;
      requestId: string;
      status: ExecutionRequestDisplayStatus;
      title: string;
      type: "execution-request";
      url: string;
    };

export function getChangeRequestBlockerDetailPath(
  blocker: ChangeRequestBlocker,
): string {
  return blocker.type === "governed-change"
    ? `/approvals/registration/${blocker.number}`
    : `/execution-requests/${blocker.number}`;
}

export async function loadBatchChangeRequestBlockers({
  baseBranch,
  batchId,
  runtime,
}: {
  baseBranch: string;
  batchId: string;
  runtime: BatchPlaneRuntimePorts;
}): Promise<ChangeRequestBlocker[]> {
  const [pullRequests, issues] = await Promise.all([
    runtime.approvals.listRegistrationRequests({
      baseBranch,
      state: "open",
    }),
    runtime.approvals.listExecutionRequestIssues({
      state: "open",
    }),
  ]);
  const [pullRequestComments, issueComments] = await Promise.all([
    Promise.all(
      pullRequests.map((pullRequest) =>
        runtime.approvals.listExecutionRequestComments({
          issueNumber: pullRequest.number,
        }),
      ),
    ),
    Promise.all(
      issues.map((issue) =>
        runtime.approvals.listExecutionRequestComments({
          issueNumber: issue.number,
        }),
      ),
    ),
  ]);

  return findBatchChangeRequestBlockers({
    batchId,
    issueComments,
    issues,
    pullRequestComments,
    pullRequests,
  });
}

export function findBatchChangeRequestBlockers({
  batchId,
  issueComments,
  issues,
  pullRequestComments,
  pullRequests,
}: {
  batchId: string;
  issueComments: RepositoryIssueComment[][];
  issues: RepositoryIssue[];
  pullRequestComments: RepositoryIssueComment[][];
  pullRequests: RepositoryPullRequest[];
}): ChangeRequestBlocker[] {
  const normalizedBatchId = batchId.trim();

  if (!normalizedBatchId) {
    return [];
  }

  return [
    ...findGovernedChangeBlockers({
      batchId: normalizedBatchId,
      commentsByPullRequest: pullRequestComments,
      pullRequests,
    }),
    ...findExecutionRequestBlockers({
      batchId: normalizedBatchId,
      commentsByIssue: issueComments,
      issues,
    }),
  ];
}

function findGovernedChangeBlockers({
  batchId,
  commentsByPullRequest,
  pullRequests,
}: {
  batchId: string;
  commentsByPullRequest: RepositoryIssueComment[][];
  pullRequests: RepositoryPullRequest[];
}): ChangeRequestBlocker[] {
  return pullRequests.flatMap((pullRequest, index) => {
    if (pullRequest.state !== "open" || pullRequest.merged) {
      return [];
    }

    const summary = tryParseRegistrationSummary(pullRequest);

    if (!summary || summary.batchId !== batchId) {
      return [];
    }

    const comments = commentsByPullRequest[index] ?? [];
    const decision = parseRegistrationApprovalDecision(comments);
    const reviewState = deriveRegistrationReviewState(pullRequest, decision);

    if (reviewState !== "OPEN" && reviewState !== "APPROVED_PENDING_MERGE") {
      return [];
    }

    return [
      {
        number: pullRequest.number,
        reviewState,
        title: pullRequest.title,
        type: "governed-change" as const,
        url: pullRequest.url,
      },
    ];
  });
}

function findExecutionRequestBlockers({
  batchId,
  commentsByIssue,
  issues,
}: {
  batchId: string;
  commentsByIssue: RepositoryIssueComment[][];
  issues: RepositoryIssue[];
}): ChangeRequestBlocker[] {
  return issues.flatMap((issue, index) => {
    if (issue.state !== "open" || issue.isPullRequest) {
      return [];
    }

    const request = parseExecutionRequestDetail(
      issue,
      commentsByIssue[index] ?? [],
    );

    if (
      !request ||
      request.batchId !== batchId ||
      !isBlockingExecutionStatus(request.status)
    ) {
      return [];
    }

    return [
      {
        number: issue.number,
        requestId: request.requestId,
        status: request.status,
        title: issue.title,
        type: "execution-request" as const,
        url: issue.url,
      },
    ];
  });
}

function tryParseRegistrationSummary(pullRequest: RepositoryPullRequest) {
  try {
    return parseRegistrationRequestSummary(pullRequest);
  } catch {
    return null;
  }
}

function isBlockingExecutionStatus(
  status: ExecutionRequestDisplayStatus,
): boolean {
  return (
    status === "REQUESTED" || status === "APPROVED" || status === "DISPATCHING"
  );
}
