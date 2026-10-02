import {
  GitHubLiteApiError,
  type GitHubIssue,
  type GitHubIssueComment,
  type GitHubIssueEvent,
  type GitHubLabel,
  type GitHubPullRequest,
  type GitHubPullRequestFile,
  type GitHubPullRequestFileStatus,
  type GitHubRepositoryPermission,
  type GitHubTeamMembershipRole,
  type GitHubTeamMembershipState,
  type GitHubWorkflow,
  type GitHubWorkflowJob,
  type GitHubWorkflowRun,
  type GitHubWorkflowRunConclusion,
  type GitHubWorkflowRunStatus,
} from "./github-types.js";

export type GitHubUserResponse = {
  login: string;
};

export type GitHubRepositoryResponse = {
  name: string;
  owner: { login: string };
  default_branch: string;
  private: boolean;
  html_url: string;
};

export type GitHubContentResponse = {
  path: string;
  content: string;
  encoding: string;
  sha: string;
};

export type GitHubDirectoryEntryResponse = {
  name: string;
  path: string;
  sha: string;
  type: "file" | "dir" | "symlink" | "submodule";
};

export type GitHubIssueResponse = {
  number: number;
  title: string;
  body: string | null;
  labels: Array<string | { name?: string }>;
  html_url: string;
  state?: "open" | "closed";
  created_at?: string;
  updated_at?: string;
  user?: {
    login: string;
  } | null;
  pull_request?: unknown;
};

export type GitHubIssueSearchResponse = {
  items: GitHubIssueResponse[];
};

export type GitHubCommentResponse = {
  id: number;
  body: string;
  user?: {
    login: string;
  } | null;
  created_at?: string;
  updated_at?: string;
};

export type GitHubLabelResponse = {
  name: string;
  color: string;
  description?: string | null;
};

export type GitHubIssueEventResponse = {
  id: number;
  event: string;
  created_at?: string;
  actor?: {
    login: string;
  } | null;
  label?: GitHubLabelResponse | null;
};

export type GitHubRefResponse = {
  object: {
    sha: string;
  };
};

export type GitHubPutFileResponse = {
  content: {
    path: string;
    sha: string;
  };
};

export type GitHubDeleteFileResponse = {
  content?: {
    path: string;
    sha: string;
  } | null;
};

export type GitHubPullRequestResponse = {
  number: number;
  title: string;
  html_url: string;
  body: string | null;
  state: "open" | "closed";
  created_at?: string;
  updated_at?: string;
  merged?: boolean;
  merge_commit_sha?: string | null;
  merged_at?: string | null;
  user: {
    login: string;
  } | null;
  head: {
    ref: string;
    sha: string;
  };
  base: {
    ref: string;
    sha?: string;
  };
};

export type GitHubPullRequestFileResponse = {
  filename: string;
  patch?: string;
  previous_filename?: string;
  status: GitHubPullRequestFileStatus;
};

export type GitHubMergeResponse = {
  merged: boolean;
  message: string;
  sha: string;
};

export type GitHubRepositoryPermissionResponse = {
  permission?: string | null;
  role_name?: string | null;
  user?: {
    login?: string;
  } | null;
};

export type GitHubTeamMembershipResponse = {
  state?: string | null;
  role?: string | null;
};

export type GitHubWorkflowResponse = {
  id: number;
  name: string;
  path: string;
  state?: string | null;
  html_url: string;
};

export type GitHubWorkflowsResponse = {
  workflows: GitHubWorkflowResponse[];
};

export type GitHubWorkflowRunResponse = {
  id: number;
  workflow_id: number;
  name?: string | null;
  display_title?: string | null;
  status?: string | null;
  conclusion?: string | null;
  html_url: string;
  event?: string | null;
  actor?: {
    login?: string | null;
  } | null;
  run_attempt?: number | null;
  created_at?: string | null;
  run_started_at?: string | null;
  updated_at?: string | null;
  path?: string | null;
  repository?: {
    id?: number | string | null;
  } | null;
};

export type GitHubWorkflowRunsResponse = {
  workflow_runs: GitHubWorkflowRunResponse[];
};

export type GitHubWorkflowJobResponse = {
  id: number;
  name: string;
  status?: string | null;
  conclusion?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  html_url?: string | null;
  steps?: Array<{
    name?: string | null;
    number?: number | null;
    status?: string | null;
    conclusion?: string | null;
    started_at?: string | null;
    completed_at?: string | null;
  }> | null;
};

export type GitHubWorkflowJobsResponse = {
  jobs: GitHubWorkflowJobResponse[];
};

export function mapIssueResponse(
  issue: GitHubIssueResponse | null,
): GitHubIssue {
  if (!issue) {
    throw new GitHubLiteApiError("GitHub issue was empty.", "unknown", 500);
  }

  return {
    number: issue.number,
    title: issue.title,
    body: issue.body ?? "",
    labels: issue.labels
      .map((label) => (typeof label === "string" ? label : label.name))
      .filter((label): label is string => Boolean(label)),
    url: issue.html_url,
    state: issue.state ?? "open",
    author: issue.user?.login ?? "",
    ...(issue.created_at ? { createdAt: issue.created_at } : {}),
    ...(issue.updated_at ? { updatedAt: issue.updated_at } : {}),
    isPullRequest: Boolean(issue.pull_request),
  };
}

export function mapIssueCommentResponse(
  comment: GitHubCommentResponse,
  issueNumber: number,
): GitHubIssueComment {
  return {
    author: comment.user?.login ?? "",
    body: comment.body,
    createdAt: comment.created_at ?? "",
    updatedAt: comment.updated_at ?? comment.created_at ?? "",
    id: comment.id,
    issueNumber,
  };
}

export function mapIssueEventResponse(
  event: GitHubIssueEventResponse,
): GitHubIssueEvent {
  return {
    actor: event.actor?.login ?? "",
    createdAt: event.created_at ?? "",
    event: event.event,
    id: event.id,
    ...(event.label ? { label: mapLabelResponse(event.label) } : {}),
  };
}

export function mapLabelResponse(label: GitHubLabelResponse): GitHubLabel {
  return {
    color: label.color,
    ...(label.description ? { description: label.description } : {}),
    name: label.name,
  };
}

export function mapPullRequestResponse(
  pullRequest: GitHubPullRequestResponse,
): GitHubPullRequest {
  return {
    number: pullRequest.number,
    title: pullRequest.title,
    url: pullRequest.html_url,
    head: pullRequest.head.ref,
    headSha: pullRequest.head.sha,
    base: pullRequest.base.ref,
    ...(pullRequest.base.sha ? { baseSha: pullRequest.base.sha } : {}),
    state: pullRequest.state,
    author: pullRequest.user?.login ?? "",
    body: pullRequest.body ?? "",
    ...(pullRequest.created_at ? { createdAt: pullRequest.created_at } : {}),
    ...(pullRequest.updated_at ? { updatedAt: pullRequest.updated_at } : {}),
    merged: pullRequest.merged ?? Boolean(pullRequest.merged_at),
    ...(pullRequest.merge_commit_sha
      ? { mergeSha: pullRequest.merge_commit_sha }
      : {}),
    ...(pullRequest.merged_at ? { mergedAt: pullRequest.merged_at } : {}),
  };
}

export function mapPullRequestFileResponse(
  file: GitHubPullRequestFileResponse,
): GitHubPullRequestFile {
  return {
    ...(file.patch ? { patch: file.patch } : {}),
    path: file.filename,
    ...(file.previous_filename ? { previousPath: file.previous_filename } : {}),
    status: file.status,
  };
}

export function mapWorkflowResponse(
  workflow: GitHubWorkflowResponse,
): GitHubWorkflow {
  return {
    id: workflow.id,
    name: workflow.name,
    path: workflow.path,
    state: workflow.state === "disabled" ? "disabled" : "active",
    url: workflow.html_url,
  };
}

export function mapWorkflowRunResponse(
  run: GitHubWorkflowRunResponse,
): GitHubWorkflowRun {
  return {
    actor: run.actor?.login ?? "",
    conclusion: mapWorkflowRunConclusion(run.conclusion),
    ...(run.created_at ? { createdAt: run.created_at } : {}),
    ...(run.display_title ? { displayTitle: run.display_title } : {}),
    event: mapWorkflowRunEvent(run.event),
    id: run.id,
    name: run.name?.trim() || run.display_title?.trim() || `Run ${run.id}`,
    runAttempt: run.run_attempt ?? 1,
    ...(run.run_started_at ? { startedAt: run.run_started_at } : {}),
    status: mapWorkflowRunStatus(run.status),
    ...(run.updated_at ? { updatedAt: run.updated_at } : {}),
    url: run.html_url,
    workflowId: run.workflow_id,
    ...(run.repository?.id !== undefined && run.repository.id !== null
      ? { repositoryId: String(run.repository.id) }
      : {}),
    ...(run.path ? { workflowPath: run.path } : {}),
  };
}

export function mapWorkflowJobResponse(
  job: GitHubWorkflowJobResponse,
): GitHubWorkflowJob {
  return {
    conclusion: mapWorkflowRunConclusion(job.conclusion),
    ...(job.completed_at ? { completedAt: job.completed_at } : {}),
    id: job.id,
    name: job.name,
    ...(job.started_at ? { startedAt: job.started_at } : {}),
    status: mapWorkflowRunStatus(job.status),
    ...(job.steps
      ? {
          steps: job.steps.map((step, index) => ({
            conclusion: mapWorkflowRunConclusion(step.conclusion),
            ...(step.completed_at ? { completedAt: step.completed_at } : {}),
            name: step.name?.trim() || `Step ${index + 1}`,
            number: step.number ?? index + 1,
            ...(step.started_at ? { startedAt: step.started_at } : {}),
            status: mapWorkflowRunStatus(step.status),
          })),
        }
      : {}),
    ...(job.html_url ? { url: job.html_url } : {}),
  };
}

export function mapWorkflowRunStatus(
  value: string | null | undefined,
): GitHubWorkflowRunStatus {
  const normalized = value?.trim().toLowerCase();

  if (
    normalized === "queued" ||
    normalized === "in_progress" ||
    normalized === "completed"
  ) {
    return normalized;
  }

  return "queued";
}

export function mapWorkflowRunConclusion(
  value: string | null | undefined,
): GitHubWorkflowRunConclusion {
  const normalized = value?.trim().toLowerCase();

  if (
    normalized === "success" ||
    normalized === "failure" ||
    normalized === "cancelled" ||
    normalized === "skipped" ||
    normalized === "timed_out" ||
    normalized === "action_required"
  ) {
    return normalized;
  }

  return null;
}

export function mapWorkflowRunEvent(
  value: string | null | undefined,
): GitHubWorkflowRun["event"] {
  const normalized = value?.trim().toLowerCase();

  if (
    normalized === "workflow_dispatch" ||
    normalized === "issue_comment" ||
    normalized === "schedule"
  ) {
    return normalized;
  }

  return "workflow_dispatch";
}

export function mapRepositoryPermissionValue(
  permission: string | null | undefined,
  roleName: string | null | undefined,
): GitHubRepositoryPermission {
  const explicitRole = normalizeRepositoryPermissionName(roleName);

  if (explicitRole) {
    return explicitRole;
  }

  const basePermission = normalizeRepositoryPermissionName(permission);

  if (basePermission) {
    return basePermission;
  }

  return "none";
}

export function normalizeRepositoryPermissionName(
  value: string | null | undefined,
): GitHubRepositoryPermission | null {
  const normalized = value?.trim().toLowerCase();

  switch (normalized) {
    case "admin":
    case "maintain":
    case "write":
    case "triage":
    case "read":
    case "none":
      return normalized;
    default:
      return null;
  }
}

export function mapTeamMembershipState(
  value: string | null | undefined,
): GitHubTeamMembershipState {
  const normalized = value?.trim().toLowerCase();

  if (normalized === "active" || normalized === "pending") {
    return normalized;
  }

  throw new GitHubLiteApiError(
    `Unsupported GitHub team membership state: ${value ?? "unknown"}`,
    "unknown",
    500,
  );
}

export function mapTeamMembershipRole(
  value: string | null | undefined,
): GitHubTeamMembershipRole {
  const normalized = value?.trim().toLowerCase();

  if (normalized === "member" || normalized === "maintainer") {
    return normalized;
  }

  throw new GitHubLiteApiError(
    `Unsupported GitHub team membership role: ${value ?? "unknown"}`,
    "unknown",
    500,
  );
}
