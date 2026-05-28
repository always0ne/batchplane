import type {
  RepositoryIssue,
  RepositoryPullRequest,
} from "@batchplane/domain";

import {
  isRegistrationApprovalRequest,
  parseExecutionApprovalRequest,
  type ExecutionApprovalRequest,
} from "./approval-model";

export type ApprovalHandoff = {
  executionIssues: RepositoryIssue[];
  registrationRequests: RepositoryPullRequest[];
};

export type ApprovalNavigationState = {
  approvalHandoff: Partial<ApprovalHandoff>;
};

type ApprovalHandoffStorage = Pick<
  Storage,
  "getItem" | "removeItem" | "setItem"
>;

export const approvalHandoffStorageKey = "batchplane.approvalHandoff.v1";
export const legacyApprovalHandoffStorageKey = "batchtrail.approvalHandoff.v1";

export function buildRegistrationApprovalHandoff(
  pullRequest: RepositoryPullRequest,
): ApprovalNavigationState {
  return {
    approvalHandoff: {
      registrationRequests: [pullRequest],
    },
  };
}

export function buildExecutionApprovalHandoff(
  issue: RepositoryIssue,
): ApprovalNavigationState {
  return {
    approvalHandoff: {
      executionIssues: [issue],
    },
  };
}

export function normalizeApprovalHandoff(
  routeState: unknown,
  storage = getApprovalHandoffStorage(),
): ApprovalHandoff {
  return mergeApprovalHandoffs(
    normalizeApprovalHandoffValue(readApprovalHandoff(routeState)),
    readStoredApprovalHandoff(storage),
  );
}

export function readStoredApprovalHandoff(
  storage = getApprovalHandoffStorage(),
): ApprovalHandoff {
  if (!storage) {
    return emptyApprovalHandoff();
  }

  const rawValue =
    storage.getItem(approvalHandoffStorageKey) ??
    storage.getItem(legacyApprovalHandoffStorageKey);

  if (!rawValue) {
    return emptyApprovalHandoff();
  }

  try {
    return normalizeApprovalHandoffValue(JSON.parse(rawValue));
  } catch {
    return emptyApprovalHandoff();
  }
}

export function writeStoredApprovalHandoff(
  handoff: ApprovalHandoff,
  storage = getApprovalHandoffStorage(),
): void {
  if (!storage) {
    return;
  }

  const normalized = normalizeApprovalHandoffValue(handoff);

  if (
    normalized.executionIssues.length === 0 &&
    normalized.registrationRequests.length === 0
  ) {
    storage.removeItem(approvalHandoffStorageKey);
    storage.removeItem(legacyApprovalHandoffStorageKey);
    return;
  }

  storage.setItem(approvalHandoffStorageKey, JSON.stringify(normalized));
}

export function saveExecutionApprovalHandoff(
  issue: RepositoryIssue,
  storage = getApprovalHandoffStorage(),
): void {
  writeStoredApprovalHandoff(
    mergeApprovalHandoffs(readStoredApprovalHandoff(storage), {
      executionIssues: [issue],
      registrationRequests: [],
    }),
    storage,
  );
}

export function saveRegistrationApprovalHandoff(
  pullRequest: RepositoryPullRequest,
  storage = getApprovalHandoffStorage(),
): void {
  writeStoredApprovalHandoff(
    mergeApprovalHandoffs(readStoredApprovalHandoff(storage), {
      executionIssues: [],
      registrationRequests: [pullRequest],
    }),
    storage,
  );
}

export function pruneApprovalHandoff(
  handoff: ApprovalHandoff,
  {
    listedExecutionRequests,
    listedRegistrationRequests,
  }: {
    listedExecutionRequests: ExecutionApprovalRequest[];
    listedRegistrationRequests: RepositoryPullRequest[];
  },
): ApprovalHandoff {
  const listedIssueNumbers = new Set(
    listedExecutionRequests.map((request) => request.issue.number),
  );
  const listedPullNumbers = new Set(
    listedRegistrationRequests.map((request) => request.number),
  );

  return {
    executionIssues: handoff.executionIssues.filter(
      (issue) => !listedIssueNumbers.has(issue.number),
    ),
    registrationRequests: handoff.registrationRequests.filter(
      (request) => !listedPullNumbers.has(request.number),
    ),
  };
}

export function removeStoredExecutionApprovalHandoff(
  issueNumber: number,
  storage = getApprovalHandoffStorage(),
): void {
  writeStoredApprovalHandoff(
    removeExecutionApprovalHandoff(
      readStoredApprovalHandoff(storage),
      issueNumber,
    ),
    storage,
  );
}

export function removeStoredRegistrationApprovalHandoff(
  pullNumber: number,
  storage = getApprovalHandoffStorage(),
): void {
  writeStoredApprovalHandoff(
    removeRegistrationApprovalHandoff(
      readStoredApprovalHandoff(storage),
      pullNumber,
    ),
    storage,
  );
}

function normalizeApprovalHandoffValue(
  approvalHandoff: unknown,
): ApprovalHandoff {
  return {
    executionIssues: Array.isArray(
      (approvalHandoff as Partial<ApprovalHandoff> | null)?.executionIssues,
    )
      ? dedupeIssuesByNumber(
          (approvalHandoff as Partial<ApprovalHandoff>).executionIssues?.filter(
            isRepositoryIssue,
          ) ?? [],
        )
      : [],
    registrationRequests: Array.isArray(
      (approvalHandoff as Partial<ApprovalHandoff> | null)
        ?.registrationRequests,
    )
      ? dedupePullRequestsByNumber(
          (
            approvalHandoff as Partial<ApprovalHandoff>
          ).registrationRequests?.filter(isRepositoryPullRequest) ?? [],
        )
      : [],
  };
}

function mergeApprovalHandoffs(
  primary: ApprovalHandoff,
  secondary: ApprovalHandoff,
): ApprovalHandoff {
  return {
    executionIssues: dedupeIssuesByNumber([
      ...primary.executionIssues,
      ...secondary.executionIssues,
    ]),
    registrationRequests: dedupePullRequestsByNumber([
      ...primary.registrationRequests,
      ...secondary.registrationRequests,
    ]),
  };
}

export function mergeRegistrationApprovalRequests(
  listedRequests: RepositoryPullRequest[],
  handoffRequests: RepositoryPullRequest[],
): RepositoryPullRequest[] {
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
  handoffIssues: RepositoryIssue[],
): ExecutionApprovalRequest[] {
  const immediateRequests = handoffIssues
    .map((issue) => parseExecutionApprovalRequest(issue))
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

function emptyApprovalHandoff(): ApprovalHandoff {
  return {
    executionIssues: [],
    registrationRequests: [],
  };
}

function dedupeIssuesByNumber(issues: RepositoryIssue[]): RepositoryIssue[] {
  const seen = new Set<number>();

  return issues.filter((issue) => {
    if (seen.has(issue.number)) {
      return false;
    }

    seen.add(issue.number);
    return true;
  });
}

function dedupePullRequestsByNumber(
  pullRequests: RepositoryPullRequest[],
): RepositoryPullRequest[] {
  const seen = new Set<number>();

  return pullRequests.filter((pullRequest) => {
    if (seen.has(pullRequest.number)) {
      return false;
    }

    seen.add(pullRequest.number);
    return true;
  });
}

function isRepositoryIssue(value: unknown): value is RepositoryIssue {
  if (!value || typeof value !== "object") {
    return false;
  }

  const issue = value as Partial<RepositoryIssue>;

  return (
    typeof issue.number === "number" &&
    typeof issue.title === "string" &&
    typeof issue.body === "string" &&
    typeof issue.url === "string"
  );
}

function isRepositoryPullRequest(
  value: unknown,
): value is RepositoryPullRequest {
  if (!value || typeof value !== "object") {
    return false;
  }

  const pullRequest = value as Partial<RepositoryPullRequest>;

  return (
    typeof pullRequest.number === "number" &&
    typeof pullRequest.title === "string" &&
    typeof pullRequest.head === "string" &&
    typeof pullRequest.base === "string" &&
    typeof pullRequest.url === "string"
  );
}

function getApprovalHandoffStorage(): ApprovalHandoffStorage | null {
  return typeof window === "undefined" ? null : window.sessionStorage;
}
