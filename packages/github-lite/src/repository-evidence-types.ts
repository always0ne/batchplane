import type { ExecutionRun } from "@batchplane/domain";

/** Repository evidence records consumed by current and historical request parsers. */
export type RepositoryIssue = {
  author: string;
  body: string;
  createdAt?: string;
  isPullRequest: boolean;
  labels: string[];
  number: number;
  state: "open" | "closed";
  title: string;
  updatedAt?: string;
  url: string;
};
export type RepositoryIssueComment = {
  author: string;
  body: string;
  createdAt: string;
  id: number;
  issueNumber: number;
};
export type RepositoryPullRequest = {
  author: string;
  base: string;
  body: string;
  createdAt?: string;
  head: string;
  merged: boolean;
  number: number;
  state: "open" | "closed";
  title: string;
  updatedAt?: string;
  url: string;
};
/** GitHub source identity retained while projecting execution evidence. */
export type GitHubExecutionRun = ExecutionRun & {
  requestIssueNumber?: number;
  requestIssueUrl?: string;
  workflowName?: string;
  workflowPath?: string;
  workflowRunId?: string;
  workflowRunUrl?: string;
};
