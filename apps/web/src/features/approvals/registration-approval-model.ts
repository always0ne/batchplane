import type {
  RepositoryIssueComment,
  RepositoryPullRequest,
} from "@batchplane/domain";

import {
  getBatchDefinitionPath,
  getBatchWorkflowPath,
} from "../registration/registration-model";
import { isRegistrationApprovalRequest } from "./approval-model";

export type BatchRegistrationRequestType = "REGISTER" | "CHANGE" | "DELETE";

export type BatchRegistrationRequestBodySummary = {
  kind: "batch";
  batchCommand: string;
  batchId: string;
  criticality: string;
  deletedSchedules: ScheduleRegistrationRequestBodySummary[];
  domain: string;
  environment: string;
  executionFilePath: string;
  gateRequired: boolean;
  name: string;
  owner: string;
  requestType: BatchRegistrationRequestType;
  runsOn: string;
  schedules: ScheduleRegistrationRequestBodySummary[];
  workflowPath: string;
};

export type ScheduleRegistrationRequestBodySummary = {
  batchId: string;
  cron: string;
  enabled: boolean;
  generatedSchedulerCron: string;
  name: string;
  scheduleId: string;
  timezone: string;
};

export type RegistrationRequestBodySummary =
  BatchRegistrationRequestBodySummary;

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
  return parseBatchSummary(pullRequest);
}

function parseBatchSummary(
  pullRequest: RepositoryPullRequest,
): BatchRegistrationRequestBodySummary {
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
    deletedSchedules: parseEmbeddedDeletedSchedules(pullRequest.body),
    domain: readMarkdownField(pullRequest.body, "Domain"),
    environment: readMarkdownField(pullRequest.body, "Environment"),
    executionFilePath: readMarkdownField(pullRequest.body, "Execution file"),
    gateRequired:
      readFirstMarkdownField(pullRequest.body, [
        "BatchPlane Gate",
        "BatchPlane Gate",
      ]).toLowerCase() !== "optional",
    kind: "batch",
    name: readMarkdownField(pullRequest.body, "Name"),
    owner: readMarkdownField(pullRequest.body, "Owner"),
    requestType: parseBatchRegistrationRequestType(
      readMarkdownField(pullRequest.body, "Request type"),
      pullRequest.title,
    ),
    runsOn: readMarkdownField(pullRequest.body, "Runs on"),
    schedules: parseEmbeddedSchedules(pullRequest.body),
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
      !comment.body.includes("## BatchPlane Governed Change Decision") &&
      !comment.body.includes("## BatchPlane Governed Change Approval") &&
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

  if (pullRequest.state === "open") {
    return decision?.decision === "APPROVED"
      ? "APPROVED_PENDING_MERGE"
      : "OPEN";
  }

  if (decision?.decision === "REJECTED") {
    return "REJECTED";
  }

  return "CLOSED";
}

export function isOpenRegistrationReview(
  pullRequest: RepositoryPullRequest,
  comments: RepositoryIssueComment[],
): boolean {
  return (
    isRegistrationApprovalRequest(pullRequest) &&
    deriveRegistrationReviewState(
      pullRequest,
      parseRegistrationApprovalDecision(comments),
    ) === "OPEN"
  );
}

function parseBatchRegistrationRequestType(
  value: string,
  title: string,
): BatchRegistrationRequestType {
  const normalized = value.trim().toUpperCase();

  if (
    normalized === "REGISTER" ||
    normalized === "CHANGE" ||
    normalized === "DELETE"
  ) {
    return normalized;
  }

  if (/^Delete batch\s+/i.test(title)) {
    return "DELETE";
  }

  if (/^Change batch\s+/i.test(title)) {
    return "CHANGE";
  }

  return "REGISTER";
}

function parseBatchIdFromTitle(title: string): string {
  const match = /^(Register|Change|Delete) batch\s+(.+)$/i.exec(title.trim());

  return match?.[2]?.trim() || "";
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

function readMarkdownBoolean(body: string, label: string): boolean {
  return readMarkdownField(body, label).toLowerCase() === "true";
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

function parseEmbeddedSchedules(
  body: string,
): ScheduleRegistrationRequestBodySummary[] {
  return parseEmbeddedScheduleSection(body, "Schedule")
    .map((block) => parseScheduleBlock(block))
    .filter(
      (schedule): schedule is ScheduleRegistrationRequestBodySummary =>
        schedule !== null,
    );
}

function parseEmbeddedDeletedSchedules(
  body: string,
): ScheduleRegistrationRequestBodySummary[] {
  return parseEmbeddedScheduleSection(body, "Deleted schedule")
    .map((block) => parseScheduleBlock(block))
    .filter(
      (schedule): schedule is ScheduleRegistrationRequestBodySummary =>
        schedule !== null,
    );
}

function parseEmbeddedScheduleSection(body: string, title: string): string[] {
  const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = body.matchAll(
    new RegExp(
      `(?:^|\\n)#### ${escapedTitle}(?:\\s+\\d+)?\\s*\\n([\\s\\S]*?)(?=\\n#### (?:Schedule|Deleted schedule)(?:\\s+\\d+)?\\s*\\n|\\n##\\s|$)`,
      "g",
    ),
  );

  return [...matches].map((match) => match[1] ?? "");
}

function parseScheduleBlock(
  block: string,
): ScheduleRegistrationRequestBodySummary | null {
  const scheduleId = readMarkdownField(block, "Schedule ID");

  if (!scheduleId) {
    return null;
  }

  const batchId = readMarkdownField(block, "Batch ID");

  return {
    batchId,
    cron: readMarkdownField(block, "Cron"),
    enabled: readMarkdownBoolean(block, "Enabled"),
    generatedSchedulerCron: readMarkdownField(
      block,
      "Generated scheduler cron",
    ),
    name: readMarkdownField(block, "Name"),
    scheduleId,
    timezone: readMarkdownField(block, "Timezone"),
  };
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
