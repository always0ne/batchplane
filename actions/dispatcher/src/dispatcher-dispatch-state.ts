import {
  parseDispatcherStatusEvidence,
  parseExecutionApprovalEvidence,
  parseExecutionRequestEvidence,
} from "./dispatcher-evidence.js";
import type { DispatcherGitHubClient } from "./dispatcher-github-client.js";
import { dispatcherLabels } from "./dispatcher-github-client.js";
import type {
  DispatcherDispatchPlan,
  DispatcherStatusEvidence,
} from "./dispatcher-types.js";

export function findExistingDispatchState({
  comments,
  dispatchPlan,
  labels,
}: {
  comments: string[];
  dispatchPlan: DispatcherDispatchPlan;
  labels: string[];
}):
  | { handled: false }
  | {
      handled: true;
      message: string;
      reasonCode: "DISPATCH_ALREADY_HANDLED" | "DISPATCH_IN_PROGRESS";
    } {
  const matchingStatus = findLatestDispatcherStatus(comments, dispatchPlan);

  if (matchingStatus?.status === "DISPATCHED") {
    return {
      handled: true,
      message: "Execution request has already been dispatched.",
      reasonCode: "DISPATCH_ALREADY_HANDLED",
    };
  }

  if (matchingStatus?.status === "DISPATCHING") {
    return {
      handled: true,
      message: "Execution request dispatch is already in progress.",
      reasonCode: "DISPATCH_IN_PROGRESS",
    };
  }

  if (hasBatchPlaneLabel(labels, "dispatched")) {
    return {
      handled: true,
      message: "Execution request has already been dispatched.",
      reasonCode: "DISPATCH_ALREADY_HANDLED",
    };
  }

  if (hasBatchPlaneLabel(labels, "dispatching")) {
    return {
      handled: true,
      message: "Execution request dispatch is already in progress.",
      reasonCode: "DISPATCH_IN_PROGRESS",
    };
  }

  return { handled: false };
}

export function verifyRetryDispatchState({
  comments,
  dispatchPlan,
  labels,
}: {
  comments: string[];
  dispatchPlan: DispatcherDispatchPlan;
  labels: string[];
}):
  | { ok: true }
  | {
      ok: false;
      message: string;
      reasonCode:
        | "DISPATCH_ALREADY_HANDLED"
        | "DISPATCH_IN_PROGRESS"
        | "RETRY_DISPATCH_NOT_ALLOWED";
    } {
  const latestStatus = findLatestDispatcherStatus(comments, dispatchPlan);

  if (latestStatus?.status === "DISPATCH_FAILED") {
    return { ok: true };
  }

  if (latestStatus?.status === "DISPATCHED") {
    return {
      ok: false,
      message: "Execution request has already been dispatched.",
      reasonCode: "DISPATCH_ALREADY_HANDLED",
    };
  }

  if (latestStatus?.status === "DISPATCHING") {
    return {
      ok: false,
      message: "Execution request dispatch is already in progress.",
      reasonCode: "DISPATCH_IN_PROGRESS",
    };
  }

  if (hasBatchPlaneLabel(labels, "dispatch-failed")) {
    return { ok: true };
  }

  if (hasBatchPlaneLabel(labels, "dispatched")) {
    return {
      ok: false,
      message: "Execution request has already been dispatched.",
      reasonCode: "DISPATCH_ALREADY_HANDLED",
    };
  }

  if (hasBatchPlaneLabel(labels, "dispatching")) {
    return {
      ok: false,
      message: "Execution request dispatch is already in progress.",
      reasonCode: "DISPATCH_IN_PROGRESS",
    };
  }

  return {
    ok: false,
    message:
      "Retry dispatch is allowed only after dispatcher evidence records DISPATCH_FAILED.",
    reasonCode: "RETRY_DISPATCH_NOT_ALLOWED",
  };
}

export function findRetryApprovalCommentBody({
  commandCommentBody,
  issueBody,
  issueComments,
}: {
  commandCommentBody: string;
  issueBody: string;
  issueComments: string[];
}): string | null {
  const request = parseExecutionRequestEvidence(issueBody);

  if (!request) {
    return null;
  }

  const comments = [...issueComments, commandCommentBody];

  return (
    comments
      .slice()
      .reverse()
      .find((commentBody) => {
        const approval = parseExecutionApprovalEvidence(commentBody);

        return (
          approval?.decision === "APPROVED" &&
          approval.requestId === request.requestId &&
          approval.batchId === request.batchId &&
          approval.requestDigest === request.requestDigest
        );
      }) ?? null
  );
}

export async function removeDispatchFailedLabels(
  client: DispatcherGitHubClient,
  issueNumber: number,
) {
  await client.removeIssueLabel(
    issueNumber,
    dispatcherLabels.dispatchFailed.name,
  );
  await client.removeIssueLabel(issueNumber, "batchtrail:dispatch-failed");
}

function findLatestDispatcherStatus(
  comments: string[],
  dispatchPlan: Pick<
    DispatcherDispatchPlan,
    "batchId" | "requestDigest" | "requestId"
  >,
): DispatcherStatusEvidence | null {
  return (
    comments
      .slice()
      .reverse()
      .map(parseDispatcherStatusEvidence)
      .find((status) =>
        status
          ? status.requestId === dispatchPlan.requestId &&
            status.batchId === dispatchPlan.batchId &&
            status.requestDigest === dispatchPlan.requestDigest
          : false,
      ) ?? null
  );
}

function hasBatchPlaneLabel(labels: string[], name: string): boolean {
  return (
    labels.includes(`batchplane:${name}`) ||
    labels.includes(`batchtrail:${name}`)
  );
}
