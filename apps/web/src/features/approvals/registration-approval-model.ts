import type {
  RepositoryIssueComment,
  RepositoryPullRequest,
} from "@batchplane/domain";

import {
  getBatchDefinitionPath,
  getBatchWorkflowPath,
} from "../registration/registration-model";

export type RegistrationRequestBodySummary = {
  batchCommand: string;
  batchId: string;
  criticality: string;
  environment: string;
  executionFilePath: string;
  gateRequired: boolean;
  runsOn: string;
  workflowPath: string;
};

export type RegistrationApprovalDecision = {
  actor: string;
  commentId: number;
  decidedAt: string;
  decision: "APPROVED" | "REJECTED";
};

export type RegistrationReviewState =
  | "OPEN"
  | "APPROVED_PENDING_MERGE"
  | "MERGED"
  | "REJECTED"
  | "CLOSED";

export function parseRegistrationRequestSummary(
  pullRequest: RepositoryPullRequest,
): RegistrationRequestBodySummary {
  const batchId =
    readMarkdownField(pullRequest.body, "Batch ID") ||
    parseBatchIdFromTitle(pullRequest.title) ||
    "";
  const workflowPath =
    readMarkdownField(pullRequest.body, "Workflow") ||
    getBatchWorkflowPath(batchId);

  return {
    batchCommand: readCommandBlock(pullRequest.body),
    batchId,
    criticality: readMarkdownField(pullRequest.body, "Criticality"),
    environment: readMarkdownField(pullRequest.body, "Environment"),
    executionFilePath: readMarkdownField(pullRequest.body, "Execution file"),
    gateRequired:
      readFirstMarkdownField(pullRequest.body, [
        "BatchPlane Gate",
        "BatchPlane Gate",
      ]).toLowerCase() !== "optional",
    runsOn: readMarkdownField(pullRequest.body, "Runs on"),
    workflowPath,
  };
}

export function deriveRegistrationFilePaths(
  summary: RegistrationRequestBodySummary,
): string[] {
  const candidates = [
    summary.batchId ? getBatchDefinitionPath(summary.batchId) : "",
    summary.workflowPath,
    summary.executionFilePath,
  ];

  return [...new Set(candidates.filter(Boolean))];
}

export function parseRegistrationApprovalDecision(
  comments: RepositoryIssueComment[],
): RegistrationApprovalDecision | null {
  const sorted = [...comments].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  );

  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const comment = sorted[index];

    if (!comment) {
      continue;
    }

    if (
      !comment.body.includes("## BatchPlane Registration Approval") &&
      !comment.body.includes("## BatchPlane Registration Approval")
    ) {
      continue;
    }

    const decisionText = readMarkdownField(comment.body, "Decision");

    if (decisionText !== "APPROVED" && decisionText !== "REJECTED") {
      continue;
    }

    return {
      actor: readDecisionActor(comment.body, decisionText) || comment.author,
      commentId: comment.id,
      decidedAt: readDecisionTimestamp(comment.body, decisionText),
      decision: decisionText,
    };
  }

  return null;
}

export function deriveRegistrationReviewState(
  pullRequest: RepositoryPullRequest,
  decision: RegistrationApprovalDecision | null,
): RegistrationReviewState {
  if (pullRequest.merged) {
    return "MERGED";
  }

  if (decision?.decision === "REJECTED") {
    return "REJECTED";
  }

  if (pullRequest.state === "open") {
    return decision?.decision === "APPROVED"
      ? "APPROVED_PENDING_MERGE"
      : "OPEN";
  }

  return "CLOSED";
}

function parseBatchIdFromTitle(title: string): string {
  const match = /^Register batch\s+(.+)$/i.exec(title.trim());

  return match?.[1]?.trim() || "";
}

function readFirstMarkdownField(body: string, labels: string[]): string {
  for (const label of labels) {
    const value = readMarkdownField(body, label);

    if (value) {
      return value;
    }
  }

  return "";
}

function readMarkdownField(body: string, label: string): string {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^-\\s+${escapedLabel}:\\s*(.+)$`, "m");
  const match = pattern.exec(body);

  if (!match?.[1]) {
    return "";
  }

  return stripInlineCode(match[1].trim());
}

function stripInlineCode(value: string): string {
  return /^`.*`$/.test(value) ? value.slice(1, -1) : value;
}

function readCommandBlock(body: string): string {
  const match =
    /### Batch command\s*[\r\n]+```(?:[a-zA-Z0-9_-]+)?\n([\s\S]*?)\n```/m.exec(
      body,
    );

  return match?.[1]?.trim() || "";
}

function readDecisionActor(
  body: string,
  decision: RegistrationApprovalDecision["decision"],
): string {
  if (decision === "APPROVED") {
    return readMarkdownField(body, "Approver").replace(/^@/, "");
  }

  return readMarkdownField(body, "Rejector").replace(/^@/, "");
}

function readDecisionTimestamp(
  body: string,
  decision: RegistrationApprovalDecision["decision"],
): string {
  return decision === "APPROVED"
    ? readMarkdownField(body, "Approved at")
    : readMarkdownField(body, "Rejected at");
}
