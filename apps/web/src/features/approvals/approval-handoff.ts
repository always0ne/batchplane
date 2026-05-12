import type { GitHubIssue, GitHubPullRequest } from "@batchtrail/github-lite";

import {
  isRegistrationApprovalRequest,
  parseExecutionApprovalRequest,
  type ExecutionApprovalRequest,
} from "./approval-model";

export type ApprovalHandoff = {
  executionIssues: GitHubIssue[];
  registrationRequests: GitHubPullRequest[];
};

export type ApprovalNavigationState = {
  approvalHandoff: Partial<ApprovalHandoff>;
};

export function buildRegistrationApprovalHandoff(
  pullRequest: GitHubPullRequest,
): ApprovalNavigationState {
  return {
    approvalHandoff: {
      registrationRequests: [pullRequest],
    },
  };
}

export function buildExecutionApprovalHandoff(
  issue: GitHubIssue,
): ApprovalNavigationState {
  return {
    approvalHandoff: {
      executionIssues: [issue],
    },
  };
}

export function normalizeApprovalHandoff(routeState: unknown): ApprovalHandoff {
  const approvalHandoff = readApprovalHandoff(routeState);

  return {
    executionIssues: Array.isArray(approvalHandoff?.executionIssues)
      ? approvalHandoff.executionIssues
      : [],
    registrationRequests: Array.isArray(approvalHandoff?.registrationRequests)
      ? approvalHandoff.registrationRequests
      : [],
  };
}

export function mergeRegistrationApprovalRequests(
  listedRequests: GitHubPullRequest[],
  handoffRequests: GitHubPullRequest[],
): GitHubPullRequest[] {
  const immediateRequests = handoffRequests.filter(
    isRegistrationApprovalRequest,
  );
  const immediateNumbers = new Set(
    immediateRequests.map((request) => request.number),
  );

  return [
    ...immediateRequests,
    ...listedRequests.filter(
      (request) => !immediateNumbers.has(request.number),
    ),
  ];
}

export function mergeExecutionApprovalRequests(
  listedRequests: ExecutionApprovalRequest[],
  handoffIssues: GitHubIssue[],
): ExecutionApprovalRequest[] {
  const immediateRequests = handoffIssues
    .map(parseExecutionApprovalRequest)
    .filter((request): request is ExecutionApprovalRequest => request !== null);
  const immediateNumbers = new Set(
    immediateRequests.map((request) => request.issue.number),
  );

  return [
    ...immediateRequests,
    ...listedRequests.filter(
      (request) => !immediateNumbers.has(request.issue.number),
    ),
  ];
}

export function removeRegistrationApprovalHandoff(
  handoff: ApprovalHandoff,
  pullNumber: number,
): ApprovalHandoff {
  return {
    ...handoff,
    registrationRequests: handoff.registrationRequests.filter(
      (request) => request.number !== pullNumber,
    ),
  };
}

export function removeExecutionApprovalHandoff(
  handoff: ApprovalHandoff,
  issueNumber: number,
): ApprovalHandoff {
  return {
    ...handoff,
    executionIssues: handoff.executionIssues.filter(
      (issue) => issue.number !== issueNumber,
    ),
  };
}

function readApprovalHandoff(routeState: unknown): Partial<ApprovalHandoff> {
  if (!routeState || typeof routeState !== "object") {
    return {};
  }

  const maybeState = routeState as Partial<ApprovalNavigationState>;

  return maybeState.approvalHandoff ?? {};
}
