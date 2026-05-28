export type RepoRef = {
  owner: string;
  repo: string;
};

export type GitHubUser = {
  login: string;
};

export type GitHubRepository = RepoRef & {
  defaultBranch: string;
  private: boolean;
  url: string;
};

export type GitHubFile = {
  path: string;
  content: string;
  sha: string;
};

export type GitHubDirectoryEntry = {
  name: string;
  path: string;
  sha: string;
  type: "file" | "dir" | "symlink" | "submodule";
};

export type GitHubIssue = {
  number: number;
  title: string;
  body: string;
  labels: string[];
  url: string;
  state: GitHubIssueState;
  author: string;
  isPullRequest: boolean;
};

export type GitHubIssueState = "open" | "closed" | "all";

export type GitHubPullRequestState = "open" | "closed" | "all";

export type GitHubPullRequest = {
  number: number;
  title: string;
  url: string;
  head: string;
  base: string;
  state: Exclude<GitHubPullRequestState, "all">;
  author: string;
  body: string;
  merged: boolean;
};

export type GitHubMergeResult = {
  merged: boolean;
  message: string;
  sha: string;
};

export type GitHubIssueComment = {
  id: number;
  issueNumber: number;
  body: string;
  author: string;
  createdAt: string;
};

export type GitHubLabel = {
  name: string;
  color: string;
  description?: string;
};

export type GitHubIssueEvent = {
  id: number;
  event: string;
  actor: string;
  createdAt: string;
  label?: GitHubLabel;
};

export type GitHubWorkflow = {
  id: number;
  name: string;
  path: string;
  state: "active" | "disabled";
  url: string;
};

export type GitHubWorkflowRunStatus = "queued" | "in_progress" | "completed";

export type GitHubWorkflowRunConclusion =
  | "success"
  | "failure"
  | "cancelled"
  | "skipped"
  | "timed_out"
  | "action_required"
  | null;

export type GitHubWorkflowRun = {
  id: number;
  workflowId: number;
  name: string;
  displayTitle?: string;
  status: GitHubWorkflowRunStatus;
  conclusion: GitHubWorkflowRunConclusion;
  url: string;
  event: "workflow_dispatch" | "issue_comment" | "schedule";
  actor: string;
  runAttempt: number;
  createdAt?: string;
  startedAt?: string;
  updatedAt?: string;
  batchId?: string;
  requestId?: string;
  workflowPath?: string;
};

export type GitHubWorkflowJob = {
  id: number;
  name: string;
  status: GitHubWorkflowRunStatus;
  conclusion: GitHubWorkflowRunConclusion;
  startedAt?: string;
  completedAt?: string;
  url?: string;
};

export type GitHubWorkflowJobLog = {
  jobId: number;
  content: string;
  truncated: boolean;
  sizeBytes: number;
};

export type GitHubRepositoryPermission =
  | "admin"
  | "maintain"
  | "write"
  | "triage"
  | "read"
  | "none";

export type RepositoryPermission = {
  username: string;
  permission: GitHubRepositoryPermission;
  roleName?: string;
};

export type GitHubTeamMembershipState = "active" | "pending";

export type GitHubTeamMembershipRole = "member" | "maintainer";

export type GitHubTeamMembership = {
  org: string;
  teamSlug: string;
  username: string;
  state: GitHubTeamMembershipState;
  role: GitHubTeamMembershipRole;
};

export type GitHubLiteMockExecutionState =
  | "requested"
  | "approved"
  | "dispatching"
  | "dispatched"
  | "business-failed"
  | "rejected"
  | "failed"
  | "gate-blocked";

export type GitHubLiteMockExecutionScenario = {
  state: GitHubLiteMockExecutionState;
  issueNumber: number;
  batchId: string;
  requestId: string;
  requestDigest: string;
  workflowRunId?: number;
};

export type GitHubMockFile = GitHubFile & {
  branch: string;
};

export type GitHubLiteMockState = {
  currentUser: GitHubUser;
  repository: GitHubRepository;
  branches: Record<string, string>;
  repositoryPermissions: RepositoryPermission[];
  teamMemberships: GitHubTeamMembership[];
  files: GitHubMockFile[];
  issues: GitHubIssue[];
  issueComments: GitHubIssueComment[];
  labels: GitHubLabel[];
  pullRequests: GitHubPullRequest[];
  workflows: GitHubWorkflow[];
  workflowRuns: GitHubWorkflowRun[];
  executionScenarios: GitHubLiteMockExecutionScenario[];
};

export type MockGitHubLiteClient = GitHubLiteClient & {
  readonly state: GitHubLiteMockState;
  reset(nextState?: GitHubLiteMockState): void;
};

export type CreateIssueParams = RepoRef & {
  title: string;
  body: string;
  labels: string[];
};

export type PutFileParams = RepoRef & {
  path: string;
  branch: string;
  message: string;
  content: string;
  encoding?: "utf-8" | "base64";
  sha?: string;
};

export type CreatePullRequestParams = RepoRef & {
  title: string;
  body: string;
  head: string;
  base: string;
};

export type ListPullRequestsParams = RepoRef & {
  state?: GitHubPullRequestState;
  base?: string;
  head?: string;
};

export type ListIssuesParams = RepoRef & {
  state?: GitHubIssueState;
};

export type SearchIssuesParams = RepoRef & {
  query?: string;
  state?: GitHubIssueState;
  labels?: string[];
};

export type UpdateIssueParams = RepoRef & {
  issueNumber: number;
  title?: string;
  body?: string;
  state?: Exclude<GitHubIssueState, "all">;
  labels?: string[];
};

export type MergePullRequestParams = RepoRef & {
  pullNumber: number;
  commitTitle?: string;
  commitMessage?: string;
  mergeMethod?: "merge" | "squash" | "rebase";
};

export type ListWorkflowRunsParams = RepoRef & {
  event?: GitHubWorkflowRun["event"];
  perPage?: number;
  status?: GitHubWorkflowRunStatus;
  workflowId?: number | string;
};

export type GetWorkflowJobLogParams = RepoRef & {
  jobId: number;
  maxBytes?: number;
};

export type GitHubLiteClient = {
  getCurrentUser(): Promise<GitHubUser>;
  getRepository(params: RepoRef): Promise<GitHubRepository>;
  getFile(
    params: RepoRef & { path: string; ref?: string },
  ): Promise<GitHubFile | null>;
  getDirectory(
    params: RepoRef & { path: string; ref?: string },
  ): Promise<GitHubDirectoryEntry[] | null>;
  getBranchHeadSha(params: RepoRef & { branch: string }): Promise<string>;
  createBranch(
    params: RepoRef & { branch: string; sha: string },
  ): Promise<void>;
  putFile(params: PutFileParams): Promise<{ path: string; sha: string }>;
  createPullRequest(
    params: CreatePullRequestParams,
  ): Promise<GitHubPullRequest>;
  listPullRequests(
    params: ListPullRequestsParams,
  ): Promise<GitHubPullRequest[]>;
  mergePullRequest(params: MergePullRequestParams): Promise<GitHubMergeResult>;
  createIssue(params: CreateIssueParams): Promise<GitHubIssue>;
  updateIssue(params: UpdateIssueParams): Promise<GitHubIssue>;
  listIssues(params: ListIssuesParams): Promise<GitHubIssue[]>;
  searchIssues(params: SearchIssuesParams): Promise<GitHubIssue[]>;
  listIssueEvents(
    params: RepoRef & { issueNumber: number },
  ): Promise<GitHubIssueEvent[]>;
  listIssueComments(
    params: RepoRef & { issueNumber: number },
  ): Promise<GitHubIssueComment[]>;
  listWorkflows(params: RepoRef): Promise<GitHubWorkflow[]>;
  getWorkflow(
    params: RepoRef & { workflowId: number | string },
  ): Promise<GitHubWorkflow | null>;
  listWorkflowRuns(
    params: ListWorkflowRunsParams,
  ): Promise<GitHubWorkflowRun[]>;
  getWorkflowRun(
    params: RepoRef & { runId: number },
  ): Promise<GitHubWorkflowRun | null>;
  listWorkflowRunJobs(
    params: RepoRef & { runId: number },
  ): Promise<GitHubWorkflowJob[]>;
  getWorkflowJobLog(
    params: GetWorkflowJobLogParams,
  ): Promise<GitHubWorkflowJobLog>;
  listLabels(params: RepoRef): Promise<GitHubLabel[]>;
  createLabel(params: RepoRef & GitHubLabel): Promise<GitHubLabel>;
  createIssueComment(
    params: RepoRef & { issueNumber: number; body: string },
  ): Promise<{ id: number; body: string }>;
  addIssueLabels(
    params: RepoRef & { issueNumber: number; labels: string[] },
  ): Promise<void>;
  removeIssueLabel(
    params: RepoRef & { issueNumber: number; label: string },
  ): Promise<void>;
  closeIssue(params: RepoRef & { issueNumber: number }): Promise<void>;
  getRepositoryPermissionForUser(
    params: RepoRef & { username: string },
  ): Promise<RepositoryPermission>;
  getTeamMembershipForUser(params: {
    org: string;
    teamSlug: string;
    username: string;
  }): Promise<GitHubTeamMembership | null>;
};

export type GitHubLiteClientOptions = {
  token: string;
  apiBaseUrl?: string;
  fetcher?: typeof fetch;
};

export type GitHubLiteApiErrorCode =
  | "bad-request"
  | "unauthorized"
  | "forbidden"
  | "not-found"
  | "rate-limited"
  | "unknown";

export class GitHubLiteApiError extends Error {
  readonly code: GitHubLiteApiErrorCode;
  readonly status: number;

  constructor(message: string, code: GitHubLiteApiErrorCode, status: number) {
    super(message);
    this.name = "GitHubLiteApiError";
    this.code = code;
    this.status = status;
  }
}

type GitHubUserResponse = {
  login: string;
};

type GitHubRepositoryResponse = {
  name: string;
  owner: { login: string };
  default_branch: string;
  private: boolean;
  html_url: string;
};

type GitHubContentResponse = {
  path: string;
  content: string;
  encoding: string;
  sha: string;
};

type GitHubDirectoryEntryResponse = {
  name: string;
  path: string;
  sha: string;
  type: "file" | "dir" | "symlink" | "submodule";
};

type GitHubIssueResponse = {
  number: number;
  title: string;
  body: string | null;
  labels: Array<string | { name?: string }>;
  html_url: string;
  state?: "open" | "closed";
  user?: {
    login: string;
  } | null;
  pull_request?: unknown;
};

type GitHubIssueSearchResponse = {
  items: GitHubIssueResponse[];
};

type GitHubCommentResponse = {
  id: number;
  body: string;
  user?: {
    login: string;
  } | null;
  created_at?: string;
};

type GitHubLabelResponse = {
  name: string;
  color: string;
  description?: string | null;
};

type GitHubIssueEventResponse = {
  id: number;
  event: string;
  created_at?: string;
  actor?: {
    login: string;
  } | null;
  label?: GitHubLabelResponse | null;
};

type GitHubRefResponse = {
  object: {
    sha: string;
  };
};

type GitHubPutFileResponse = {
  content: {
    path: string;
    sha: string;
  };
};

type GitHubPullRequestResponse = {
  number: number;
  title: string;
  html_url: string;
  body: string | null;
  state: "open" | "closed";
  merged?: boolean;
  merged_at?: string | null;
  user: {
    login: string;
  } | null;
  head: {
    ref: string;
  };
  base: {
    ref: string;
  };
};

type GitHubMergeResponse = {
  merged: boolean;
  message: string;
  sha: string;
};

type GitHubRepositoryPermissionResponse = {
  permission?: string | null;
  role_name?: string | null;
  user?: {
    login?: string;
  } | null;
};

type GitHubTeamMembershipResponse = {
  state?: string | null;
  role?: string | null;
};

type GitHubWorkflowResponse = {
  id: number;
  name: string;
  path: string;
  state?: string | null;
  html_url: string;
};

type GitHubWorkflowsResponse = {
  workflows: GitHubWorkflowResponse[];
};

type GitHubWorkflowRunResponse = {
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
};

type GitHubWorkflowRunsResponse = {
  workflow_runs: GitHubWorkflowRunResponse[];
};

type GitHubWorkflowJobResponse = {
  id: number;
  name: string;
  status?: string | null;
  conclusion?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  html_url?: string | null;
};

type GitHubWorkflowJobsResponse = {
  jobs: GitHubWorkflowJobResponse[];
};

export function createGitHubLiteClient({
  token,
  apiBaseUrl = "https://api.github.com",
  fetcher = fetch,
}: GitHubLiteClientOptions): GitHubLiteClient {
  const trimmedToken = token.trim();
  const defaultLogMaxBytes = 200_000;

  if (!trimmedToken) {
    throw new GitHubLiteApiError(
      "GitHub token is required.",
      "bad-request",
      400,
    );
  }

  async function request<T>(
    path: string,
    init: RequestInit = {},
    options: { allowNotFound?: boolean } = {},
  ): Promise<T | null> {
    const response = await fetcher(`${apiBaseUrl}${path}`, {
      ...init,
      headers: buildHeaders(trimmedToken, init.headers),
    });

    if (response.status === 404 && options.allowNotFound) {
      return null;
    }

    if (!response.ok) {
      throw new GitHubLiteApiError(
        await readErrorMessage(response),
        mapStatusToErrorCode(response.status),
        response.status,
      );
    }

    if (response.status === 204) {
      return null;
    }

    return (await response.json()) as T;
  }

  async function requestText(
    path: string,
    init: RequestInit = {},
  ): Promise<string> {
    const response = await fetcher(`${apiBaseUrl}${path}`, {
      ...init,
      headers: buildHeaders(trimmedToken, init.headers),
    });

    if (!response.ok) {
      throw new GitHubLiteApiError(
        await readErrorMessage(response),
        mapStatusToErrorCode(response.status),
        response.status,
      );
    }

    return response.text();
  }

  return {
    async getCurrentUser() {
      const user = await request<GitHubUserResponse>("/user");

      if (!user) {
        throw new GitHubLiteApiError("GitHub user was empty.", "unknown", 500);
      }

      return { login: user.login };
    },

    async getRepository({ owner, repo }) {
      const repository = await request<GitHubRepositoryResponse>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      );

      if (!repository) {
        throw new GitHubLiteApiError(
          "GitHub repository was empty.",
          "unknown",
          500,
        );
      }

      return {
        owner: repository.owner.login,
        repo: repository.name,
        defaultBranch: repository.default_branch,
        private: repository.private,
        url: repository.html_url,
      };
    },

    async getFile({ owner, repo, path, ref }) {
      const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
      const content = await request<GitHubContentResponse>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo,
        )}/contents/${encodePath(path)}${query}`,
        {},
        { allowNotFound: true },
      );

      if (!content) {
        return null;
      }

      if (content.encoding !== "base64") {
        throw new GitHubLiteApiError(
          `Unsupported GitHub content encoding: ${content.encoding}`,
          "unknown",
          500,
        );
      }

      return {
        path: content.path,
        content: decodeBase64(content.content),
        sha: content.sha,
      };
    },

    async getDirectory({ owner, repo, path, ref }) {
      const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
      const entries = await request<GitHubDirectoryEntryResponse[]>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo,
        )}/contents/${encodePath(path)}${query}`,
        {},
        { allowNotFound: true },
      );

      if (!entries) {
        return null;
      }

      if (!Array.isArray(entries)) {
        throw new GitHubLiteApiError(
          `GitHub path is not a directory: ${path}`,
          "bad-request",
          400,
        );
      }

      return entries.map((entry) => ({
        name: entry.name,
        path: entry.path,
        sha: entry.sha,
        type: entry.type,
      }));
    },

    async getBranchHeadSha({ owner, repo, branch }) {
      const ref = await request<GitHubRefResponse>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo,
        )}/git/ref/heads/${encodePath(branch)}`,
      );

      if (!ref) {
        throw new GitHubLiteApiError(
          "GitHub branch ref was empty.",
          "unknown",
          500,
        );
      }

      return ref.object.sha;
    },

    async createBranch({ owner, repo, branch, sha }) {
      await request<GitHubRefResponse>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo,
        )}/git/refs`,
        {
          method: "POST",
          body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
        },
      );
    },

    async putFile({
      owner,
      repo,
      path,
      branch,
      message,
      content,
      encoding = "utf-8",
      sha,
    }) {
      const response = await request<GitHubPutFileResponse>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo,
        )}/contents/${encodePath(path)}`,
        {
          method: "PUT",
          body: JSON.stringify({
            branch,
            content: encoding === "base64" ? content : encodeBase64(content),
            message,
            ...(sha ? { sha } : {}),
          }),
        },
      );

      if (!response) {
        throw new GitHubLiteApiError(
          "GitHub file response was empty.",
          "unknown",
          500,
        );
      }

      return {
        path: response.content.path,
        sha: response.content.sha,
      };
    },

    async createPullRequest({ owner, repo, title, body, head, base }) {
      const pullRequest = await request<GitHubPullRequestResponse>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`,
        {
          method: "POST",
          body: JSON.stringify({ base, body, head, title }),
        },
      );

      if (!pullRequest) {
        throw new GitHubLiteApiError(
          "GitHub pull request was empty.",
          "unknown",
          500,
        );
      }

      return mapPullRequestResponse(pullRequest);
    },

    async listPullRequests({ owner, repo, state = "open", base, head }) {
      const query = buildQuery({ base, head, state });
      const pullRequests = await request<GitHubPullRequestResponse[]>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo,
        )}/pulls${query}`,
      );

      return (pullRequests ?? []).map(mapPullRequestResponse);
    },

    async mergePullRequest({
      owner,
      repo,
      pullNumber,
      commitTitle,
      commitMessage,
      mergeMethod = "squash",
    }) {
      const result = await request<GitHubMergeResponse>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo,
        )}/pulls/${pullNumber}/merge`,
        {
          method: "PUT",
          body: JSON.stringify({
            ...(commitMessage ? { commit_message: commitMessage } : {}),
            ...(commitTitle ? { commit_title: commitTitle } : {}),
            merge_method: mergeMethod,
          }),
        },
      );

      if (!result) {
        throw new GitHubLiteApiError(
          "GitHub merge response was empty.",
          "unknown",
          500,
        );
      }

      return {
        merged: result.merged,
        message: result.message,
        sha: result.sha,
      };
    },

    async createIssue({ owner, repo, title, body, labels }) {
      const issue = await request<GitHubIssueResponse>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo,
        )}/issues`,
        {
          method: "POST",
          body: JSON.stringify({ body, labels, title }),
        },
      );

      return mapIssueResponse(issue);
    },

    async updateIssue({
      owner,
      repo,
      issueNumber,
      title,
      body,
      state,
      labels,
    }) {
      const issue = await request<GitHubIssueResponse>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo,
        )}/issues/${issueNumber}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            ...(body !== undefined ? { body } : {}),
            ...(labels !== undefined ? { labels } : {}),
            ...(state !== undefined ? { state } : {}),
            ...(title !== undefined ? { title } : {}),
          }),
        },
      );

      return mapIssueResponse(issue);
    },

    async listIssues({ owner, repo, state = "open" }) {
      const query = buildQuery({ state });
      const issues = await request<GitHubIssueResponse[]>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo,
        )}/issues${query}`,
      );

      return (issues ?? []).map(mapIssueResponse);
    },

    async searchIssues({
      owner,
      repo,
      query = "",
      state = "open",
      labels = [],
    }) {
      const qualifierTerms = [`repo:${owner}/${repo}`, "is:issue"];
      const trimmedQuery = query.trim();

      if (state !== "all") {
        qualifierTerms.push(`state:${state}`);
      }

      for (const label of labels.map((value) => value.trim()).filter(Boolean)) {
        qualifierTerms.push(buildLabelSearchQualifier(label));
      }

      if (trimmedQuery) {
        qualifierTerms.push(trimmedQuery);
      }

      const searchResponse = await request<GitHubIssueSearchResponse>(
        `/search/issues${buildQuery({ q: qualifierTerms.join(" ") })}`,
      );

      return (searchResponse?.items ?? []).map(mapIssueResponse);
    },

    async listIssueEvents({ owner, repo, issueNumber }) {
      const events = await request<GitHubIssueEventResponse[]>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo,
        )}/issues/${issueNumber}/events`,
      );

      return (events ?? []).map(mapIssueEventResponse);
    },

    async listIssueComments({ owner, repo, issueNumber }) {
      const comments = await request<GitHubCommentResponse[]>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo,
        )}/issues/${issueNumber}/comments`,
      );

      return (comments ?? []).map((comment) =>
        mapIssueCommentResponse(comment, issueNumber),
      );
    },

    async listWorkflows({ owner, repo }) {
      const workflows = await request<GitHubWorkflowsResponse>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo,
        )}/actions/workflows`,
      );

      return (workflows?.workflows ?? []).map(mapWorkflowResponse);
    },

    async getWorkflow({ owner, repo, workflowId }) {
      const workflow = await request<GitHubWorkflowResponse>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo,
        )}/actions/workflows/${encodePath(String(workflowId))}`,
        {},
        { allowNotFound: true },
      );

      return workflow ? mapWorkflowResponse(workflow) : null;
    },

    async listWorkflowRuns({
      owner,
      repo,
      event,
      perPage = 30,
      status,
      workflowId,
    }) {
      const query = buildQuery({
        ...(event ? { event } : {}),
        per_page: String(perPage),
        ...(status ? { status } : {}),
      });
      const path =
        workflowId === undefined
          ? `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
              repo,
            )}/actions/runs${query}`
          : `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
              repo,
            )}/actions/workflows/${encodePath(String(workflowId))}/runs${query}`;
      const runs = await request<GitHubWorkflowRunsResponse>(path);

      return (runs?.workflow_runs ?? []).map(mapWorkflowRunResponse);
    },

    async getWorkflowRun({ owner, repo, runId }) {
      const run = await request<GitHubWorkflowRunResponse>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo,
        )}/actions/runs/${runId}`,
        {},
        { allowNotFound: true },
      );

      return run ? mapWorkflowRunResponse(run) : null;
    },

    async listWorkflowRunJobs({ owner, repo, runId }) {
      const jobs = await request<GitHubWorkflowJobsResponse>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo,
        )}/actions/runs/${runId}/jobs`,
      );

      return (jobs?.jobs ?? []).map(mapWorkflowJobResponse);
    },

    async getWorkflowJobLog({ owner, repo, jobId, maxBytes }) {
      const content = await requestText(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo,
        )}/actions/jobs/${jobId}/logs`,
      );
      const limit = maxBytes ?? defaultLogMaxBytes;
      const truncatedContent = truncateTextByBytes(content, limit);

      return {
        content: truncatedContent.content,
        jobId,
        sizeBytes: getByteLength(content),
        truncated: truncatedContent.truncated,
      };
    },

    async listLabels({ owner, repo }) {
      const labels = await request<GitHubLabelResponse[]>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/labels`,
      );

      return (labels ?? []).map(mapLabelResponse);
    },

    async createLabel({ owner, repo, name, color, description }) {
      const label = await request<GitHubLabelResponse>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/labels`,
        {
          method: "POST",
          body: JSON.stringify({
            color,
            description,
            name,
          }),
        },
      );

      if (!label) {
        throw new GitHubLiteApiError(
          "GitHub label response was empty.",
          "unknown",
          500,
        );
      }

      return mapLabelResponse(label);
    },

    async createIssueComment({ owner, repo, issueNumber, body }) {
      const comment = await request<GitHubCommentResponse>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo,
        )}/issues/${issueNumber}/comments`,
        {
          method: "POST",
          body: JSON.stringify({ body }),
        },
      );

      if (!comment) {
        throw new GitHubLiteApiError(
          "GitHub issue comment was empty.",
          "unknown",
          500,
        );
      }

      return { id: comment.id, body: comment.body };
    },

    async addIssueLabels({ owner, repo, issueNumber, labels }) {
      await request<unknown>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo,
        )}/issues/${issueNumber}/labels`,
        {
          method: "POST",
          body: JSON.stringify({ labels }),
        },
      );
    },

    async removeIssueLabel({ owner, repo, issueNumber, label }) {
      await request<unknown>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo,
        )}/issues/${issueNumber}/labels/${encodeURIComponent(label)}`,
        {
          method: "DELETE",
        },
      );
    },

    async getRepositoryPermissionForUser({ owner, repo, username }) {
      const permissionResponse =
        await request<GitHubRepositoryPermissionResponse>(
          `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
            repo,
          )}/collaborators/${encodeURIComponent(username)}/permission`,
          {},
          { allowNotFound: true },
        );

      if (!permissionResponse) {
        return {
          permission: "none",
          roleName: "none",
          username,
        };
      }

      return {
        permission: mapRepositoryPermissionValue(
          permissionResponse.permission,
          permissionResponse.role_name,
        ),
        roleName:
          normalizeRepositoryPermissionName(permissionResponse.role_name) ??
          normalizeRepositoryPermissionName(permissionResponse.permission) ??
          "none",
        username: permissionResponse.user?.login?.trim() || username,
      };
    },

    async getTeamMembershipForUser({ org, teamSlug, username }) {
      const membership = await request<GitHubTeamMembershipResponse>(
        `/orgs/${encodeURIComponent(org)}/teams/${encodeURIComponent(
          teamSlug,
        )}/memberships/${encodeURIComponent(username)}`,
        {},
        { allowNotFound: true },
      );

      if (!membership) {
        return null;
      }

      return {
        org,
        role: mapTeamMembershipRole(membership.role),
        state: mapTeamMembershipState(membership.state),
        teamSlug,
        username,
      };
    },

    async closeIssue({ owner, repo, issueNumber }) {
      await request<GitHubIssueResponse>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo,
        )}/issues/${issueNumber}`,
        {
          method: "PATCH",
          body: JSON.stringify({ state: "closed" }),
        },
      );
    },
  };
}

export function createGitHubLiteMockState(
  overrides: Partial<GitHubLiteMockState> = {},
): GitHubLiteMockState {
  const repository: GitHubRepository = overrides.repository ?? {
    defaultBranch: "main",
    owner: "always0ne",
    private: true,
    repo: "batch",
    url: "https://github.com/always0ne/batch",
  };
  const currentUser = overrides.currentUser ?? { login: "maintainer" };
  const batchId = "payment.daily-close";
  const workflowId = 101;
  const executionScenarios = createMockExecutionScenarios(batchId);
  const issues = executionScenarios.map((scenario) =>
    buildMockExecutionIssue(repository, scenario),
  );
  const issueComments = executionScenarios.flatMap((scenario) =>
    buildMockExecutionComments(scenario, currentUser.login),
  );
  const workflowRuns = executionScenarios.flatMap((scenario) =>
    buildMockWorkflowRuns(repository, workflowId, scenario),
  );
  const repositoryPermissions: RepositoryPermission[] = [
    {
      permission: "maintain",
      roleName: "maintain",
      username: currentUser.login,
    },
    {
      permission: "write",
      roleName: "write",
      username: "developer",
    },
    {
      permission: "read",
      roleName: "read",
      username: "auditor",
    },
  ];
  const defaultState: GitHubLiteMockState = {
    branches: {
      main: "mock-main-sha",
    },
    currentUser,
    executionScenarios,
    files: [
      {
        branch: "main",
        content: "BatchPlane Lite dispatcher workflow\n",
        path: ".github/workflows/batchplane-dispatcher.yml",
        sha: "mock-dispatcher-sha",
      },
      {
        branch: "main",
        content: buildMockBatchWorkflowYaml(batchId),
        path: `.github/workflows/${batchId}.yml`,
        sha: "mock-batch-workflow-sha",
      },
      {
        branch: "main",
        content: "# BatchPlane Governance\n",
        path: ".batch-governance/README.md",
        sha: "mock-governance-readme-sha",
      },
      {
        branch: "main",
        content: buildMockBatchDefinitionYaml(batchId),
        path: `.batch-governance/batches/${batchId}.yml`,
        sha: "mock-batch-definition-sha",
      },
      {
        branch: "main",
        content: buildMockRoleMappingYaml(),
        path: ".batch-governance/policies/role-mapping.yml",
        sha: "mock-role-mapping-sha",
      },
      {
        branch: "main",
        content: "Batch definitions created by BatchPlane Lite live here.\n",
        path: ".batch-governance/batches/.gitkeep",
        sha: "mock-batches-gitkeep-sha",
      },
      {
        branch: "main",
        content: "Schedule definitions created by BatchPlane Lite live here.\n",
        path: ".batch-governance/schedules/.gitkeep",
        sha: "mock-schedules-gitkeep-sha",
      },
    ],
    issueComments,
    issues,
    labels: [
      {
        color: "0F766E",
        description: "BatchPlane execution request",
        name: "batchplane:execution-request",
      },
      {
        color: "2563EB",
        description: "BatchPlane request is dispatching",
        name: "batchplane:dispatching",
      },
      {
        color: "059669",
        description: "BatchPlane request was dispatched",
        name: "batchplane:dispatched",
      },
      {
        color: "B91C1C",
        description: "BatchPlane dispatch failed",
        name: "batchplane:dispatch-failed",
      },
      {
        color: "F97316",
        description: "BatchPlane Gate blocked execution",
        name: "batchplane:gate-blocked",
      },
      {
        color: "7F1D1D",
        description: "BatchPlane request was rejected",
        name: "batchplane:rejected",
      },
    ],
    pullRequests: [
      {
        author: "developer",
        base: "main",
        body: "Register payment daily close batch.",
        head: "batchplane/register/payment.daily-close-20260514010203",
        merged: false,
        number: 12,
        state: "open",
        title: `Register batch ${batchId}`,
        url: `${repository.url}/pull/12`,
      },
    ],
    repository,
    repositoryPermissions,
    teamMemberships: [
      {
        org: repository.owner,
        role: "maintainer",
        state: "active",
        teamSlug: "platform-ops",
        username: currentUser.login,
      },
      {
        org: repository.owner,
        role: "member",
        state: "active",
        teamSlug: "batch-operators",
        username: "developer",
      },
    ],
    workflowRuns,
    workflows: [
      {
        id: workflowId,
        name: "BatchPlane - Daily Close",
        path: `.github/workflows/${batchId}.yml`,
        state: "active",
        url: `${repository.url}/actions/workflows/${batchId}.yml`,
      },
      {
        id: 102,
        name: "BatchPlane Dispatcher",
        path: ".github/workflows/batchplane-dispatcher.yml",
        state: "active",
        url: `${repository.url}/actions/workflows/batchplane-dispatcher.yml`,
      },
    ],
  };
  const state = {
    ...defaultState,
    ...overrides,
    branches: {
      ...defaultState.branches,
      ...overrides.branches,
    },
    currentUser: overrides.currentUser ?? defaultState.currentUser,
    executionScenarios:
      overrides.executionScenarios ?? defaultState.executionScenarios,
    files: overrides.files ?? defaultState.files,
    issueComments: overrides.issueComments ?? defaultState.issueComments,
    issues: overrides.issues ?? defaultState.issues,
    labels: overrides.labels ?? defaultState.labels,
    pullRequests: overrides.pullRequests ?? defaultState.pullRequests,
    repository: overrides.repository ?? defaultState.repository,
    repositoryPermissions:
      overrides.repositoryPermissions ?? defaultState.repositoryPermissions,
    teamMemberships: overrides.teamMemberships ?? defaultState.teamMemberships,
    workflowRuns: overrides.workflowRuns ?? defaultState.workflowRuns,
    workflows: overrides.workflows ?? defaultState.workflows,
  };

  return cloneJson(state);
}

export function createMockGitHubLiteClient(
  initialState = createGitHubLiteMockState(),
): MockGitHubLiteClient {
  const baselineState = cloneJson(initialState);
  const state = cloneJson(initialState);
  const client: GitHubLiteClient = {
    async addIssueLabels(params) {
      assertMockRepository(state, params);

      const issue = findMockIssue(state, params.issueNumber);
      issue.labels = uniqueStrings([...issue.labels, ...params.labels]);
      params.labels.forEach((label) => ensureMockLabel(state, label));
    },

    async createLabel(params) {
      assertMockRepository(state, params);

      if (state.labels.some((label) => label.name === params.name)) {
        throw new GitHubLiteApiError(
          `GitHub label already exists: ${params.name}`,
          "bad-request",
          422,
        );
      }

      const label: GitHubLabel = {
        color: params.color,
        ...(params.description ? { description: params.description } : {}),
        name: params.name,
      };

      state.labels.push(label);

      return cloneJson(label);
    },

    async closeIssue(params) {
      assertMockRepository(state, params);

      const issue = state.issues.find(
        (candidate) => candidate.number === params.issueNumber,
      );

      if (issue) {
        issue.state = "closed";
        return;
      }

      const pullRequest = state.pullRequests.find(
        (candidate) => candidate.number === params.issueNumber,
      );

      if (!pullRequest) {
        throw new GitHubLiteApiError(
          `GitHub issue not found: ${params.issueNumber}`,
          "not-found",
          404,
        );
      }

      pullRequest.state = "closed";
    },

    async createBranch(params) {
      assertMockRepository(state, params);

      if (state.branches[params.branch]) {
        throw new GitHubLiteApiError(
          `GitHub branch already exists: ${params.branch}`,
          "bad-request",
          422,
        );
      }

      state.branches[params.branch] = params.sha;
    },

    async createIssue(params) {
      assertMockRepository(state, params);

      const issueNumber = nextMockNumber([
        ...state.issues.map((issue) => issue.number),
        ...state.pullRequests.map((pullRequest) => pullRequest.number),
      ]);
      const issue: GitHubIssue = {
        author: state.currentUser.login,
        body: params.body,
        isPullRequest: false,
        labels: uniqueStrings(params.labels),
        number: issueNumber,
        state: "open",
        title: params.title,
        url: `${state.repository.url}/issues/${issueNumber}`,
      };

      issue.labels.forEach((label) => ensureMockLabel(state, label));
      state.issues.push(issue);
      trackMockExecutionRequest(state, issue);

      return cloneJson(issue);
    },

    async updateIssue(params) {
      assertMockRepository(state, params);

      const issue = findMockIssue(state, params.issueNumber);

      if (params.body !== undefined) {
        issue.body = params.body;
      }

      if (params.labels !== undefined) {
        issue.labels = uniqueStrings(params.labels);
        params.labels.forEach((label) => ensureMockLabel(state, label));
      }

      if (params.state !== undefined) {
        issue.state = params.state;
      }

      if (params.title !== undefined) {
        issue.title = params.title;
      }

      return cloneJson(issue);
    },

    async createIssueComment(params) {
      assertMockRepository(state, params);
      assertMockIssueOrPullRequest(state, params.issueNumber);

      const comment: GitHubIssueComment = {
        author: state.currentUser.login,
        body: params.body,
        createdAt: new Date(0).toISOString(),
        id: nextMockNumber(
          state.issueComments.map((candidate) => candidate.id),
        ),
        issueNumber: params.issueNumber,
      };

      state.issueComments.push(comment);
      applyMockExecutionCommentTransition(state, comment);

      return { body: comment.body, id: comment.id };
    },

    async createPullRequest(params) {
      assertMockRepository(state, params);

      const pullNumber = nextMockNumber([
        ...state.issues.map((issue) => issue.number),
        ...state.pullRequests.map((pullRequest) => pullRequest.number),
      ]);
      const pullRequest: GitHubPullRequest = {
        author: state.currentUser.login,
        base: params.base,
        body: params.body,
        head: params.head,
        merged: false,
        number: pullNumber,
        state: "open",
        title: params.title,
        url: `${state.repository.url}/pull/${pullNumber}`,
      };

      state.pullRequests.push(pullRequest);

      return cloneJson(pullRequest);
    },

    async getBranchHeadSha(params) {
      assertMockRepository(state, params);

      const sha = state.branches[params.branch];

      if (!sha) {
        throw new GitHubLiteApiError(
          `GitHub branch not found: ${params.branch}`,
          "not-found",
          404,
        );
      }

      return sha;
    },

    async getCurrentUser() {
      return cloneJson(state.currentUser);
    },

    async getDirectory(params) {
      assertMockRepository(state, params);

      const branch = resolveMockBranch(state, params.ref);
      const entries = getMockDirectoryEntries(state, params.path, branch);

      return entries.length > 0 ? entries : null;
    },

    async getFile(params) {
      assertMockRepository(state, params);

      const branch = resolveMockBranch(state, params.ref);
      const file = state.files.find(
        (candidate) =>
          candidate.branch === branch && candidate.path === params.path,
      );

      return file
        ? {
            content: file.content,
            path: file.path,
            sha: file.sha,
          }
        : null;
    },

    async getRepository(params) {
      assertMockRepository(state, params);

      return cloneJson(state.repository);
    },

    async getRepositoryPermissionForUser(params) {
      assertMockRepository(state, params);

      const permission = state.repositoryPermissions.find(
        (candidate) => candidate.username === params.username,
      );

      return cloneJson(
        permission ?? {
          permission: "none",
          roleName: "none",
          username: params.username,
        },
      );
    },

    async getTeamMembershipForUser(params) {
      const membership = state.teamMemberships.find(
        (candidate) =>
          candidate.org === params.org &&
          candidate.teamSlug === params.teamSlug &&
          candidate.username === params.username,
      );

      return membership ? cloneJson(membership) : null;
    },

    async listIssueEvents(params) {
      assertMockRepository(state, params);
      assertMockIssueOrPullRequest(state, params.issueNumber);

      const comments = state.issueComments
        .filter((comment) => comment.issueNumber === params.issueNumber)
        .map((comment) => ({
          actor: comment.author,
          createdAt: comment.createdAt,
          event: "commented",
          id: comment.id,
        }));

      const issue = state.issues.find(
        (candidate) => candidate.number === params.issueNumber,
      );
      const nextId = nextMockNumber(comments.map((event) => event.id));
      const labels =
        issue?.labels.map((label, index) => ({
          actor: "",
          createdAt: "",
          event: "labeled",
          id: nextId + index,
          label: state.labels.find((candidate) => candidate.name === label),
        })) ?? [];

      return cloneJson([
        ...comments,
        ...labels.map((event) => ({
          ...event,
          ...(event.label ? { label: event.label } : {}),
        })),
      ]);
    },

    async listIssues(params) {
      assertMockRepository(state, params);

      const stateFilter = params.state ?? "open";

      return state.issues
        .filter((issue) => stateFilter === "all" || issue.state === stateFilter)
        .map(cloneJson);
    },

    async searchIssues(params) {
      assertMockRepository(state, params);

      const normalizedQuery = params.query?.trim().toLowerCase() ?? "";
      const labelFilters = (params.labels ?? [])
        .map((label) => label.trim())
        .filter(Boolean);
      const stateFilter = params.state ?? "open";

      return state.issues
        .filter((issue) => {
          if (stateFilter !== "all" && issue.state !== stateFilter) {
            return false;
          }

          if (
            labelFilters.length > 0 &&
            !labelFilters.every((label) => issue.labels.includes(label))
          ) {
            return false;
          }

          if (!normalizedQuery) {
            return true;
          }

          const text = `${issue.title}\n${issue.body}`.toLowerCase();
          return text.includes(normalizedQuery);
        })
        .map(cloneJson);
    },

    async listIssueComments(params) {
      assertMockRepository(state, params);
      assertMockIssueOrPullRequest(state, params.issueNumber);

      return state.issueComments
        .filter((comment) => comment.issueNumber === params.issueNumber)
        .map(cloneJson);
    },

    async listLabels(params) {
      assertMockRepository(state, params);

      return cloneJson(state.labels);
    },

    async listPullRequests(params) {
      assertMockRepository(state, params);

      const stateFilter = params.state ?? "open";

      return state.pullRequests
        .filter(
          (pullRequest) =>
            (stateFilter === "all" || pullRequest.state === stateFilter) &&
            (!params.base || pullRequest.base === params.base) &&
            (!params.head || pullRequest.head === params.head),
        )
        .map(cloneJson);
    },

    async listWorkflows(params) {
      assertMockRepository(state, params);

      return state.workflows.map(cloneJson);
    },

    async getWorkflow(params) {
      assertMockRepository(state, params);

      const workflowId = String(params.workflowId);
      const workflow = state.workflows.find(
        (candidate) =>
          String(candidate.id) === workflowId ||
          candidate.path === workflowId ||
          candidate.path.endsWith(`/${workflowId}`),
      );

      return workflow ? cloneJson(workflow) : null;
    },

    async listWorkflowRuns(params) {
      assertMockRepository(state, params);

      const perPage = params.perPage ?? 30;

      return state.workflowRuns
        .filter(
          (run) =>
            (!params.workflowId ||
              String(run.workflowId) === String(params.workflowId)) &&
            (!params.event || run.event === params.event) &&
            (!params.status || run.status === params.status),
        )
        .slice(0, perPage)
        .map(cloneJson);
    },

    async getWorkflowRun(params) {
      assertMockRepository(state, params);

      const run = state.workflowRuns.find(
        (candidate) => candidate.id === params.runId,
      );

      return run ? cloneJson(run) : null;
    },

    async listWorkflowRunJobs(params) {
      assertMockRepository(state, params);

      return buildMockWorkflowRunJobs(state, params.runId).map(cloneJson);
    },

    async getWorkflowJobLog(params) {
      assertMockRepository(state, params);

      const job = state.workflowRuns
        .flatMap((run) => buildMockWorkflowRunJobs(state, run.id))
        .find((candidate) => candidate.id === params.jobId);

      if (!job) {
        throw new GitHubLiteApiError(
          `GitHub workflow job not found: ${params.jobId}`,
          "not-found",
          404,
        );
      }

      const content = buildMockWorkflowJobLog(job);
      const truncated = truncateTextByBytes(
        content,
        params.maxBytes ?? 200_000,
      );

      return {
        content: truncated.content,
        jobId: params.jobId,
        sizeBytes: getByteLength(content),
        truncated: truncated.truncated,
      };
    },

    async mergePullRequest(params) {
      assertMockRepository(state, params);

      const pullRequest = state.pullRequests.find(
        (candidate) => candidate.number === params.pullNumber,
      );

      if (!pullRequest) {
        throw new GitHubLiteApiError(
          `GitHub pull request not found: ${params.pullNumber}`,
          "not-found",
          404,
        );
      }

      pullRequest.merged = true;
      pullRequest.state = "closed";

      return {
        merged: true,
        message: "Pull Request successfully merged",
        sha: `mock-merge-sha-${params.pullNumber}`,
      };
    },

    async removeIssueLabel(params) {
      assertMockRepository(state, params);

      const issue = findMockIssue(state, params.issueNumber);
      const hasLabel = issue.labels.includes(params.label);

      if (!hasLabel) {
        throw new GitHubLiteApiError(
          `GitHub label not found on issue: ${params.label}`,
          "not-found",
          404,
        );
      }

      issue.labels = issue.labels.filter((label) => label !== params.label);
    },

    async putFile(params) {
      assertMockRepository(state, params);

      if (!state.branches[params.branch]) {
        throw new GitHubLiteApiError(
          `GitHub branch not found: ${params.branch}`,
          "not-found",
          404,
        );
      }

      const existingFile = state.files.find(
        (file) => file.branch === params.branch && file.path === params.path,
      );
      const sha = `mock-file-sha-${state.files.length + 1}`;
      const content =
        params.encoding === "base64"
          ? decodeBase64(params.content)
          : params.content;

      if (existingFile) {
        existingFile.content = content;
        existingFile.sha = sha;
      } else {
        state.files.push({
          branch: params.branch,
          content,
          path: params.path,
          sha,
        });
      }

      return { path: params.path, sha };
    },
  };

  return Object.assign(client, {
    reset(nextState = baselineState) {
      replaceMockState(state, nextState);
    },
    state,
  });
}

function replaceMockState(
  target: GitHubLiteMockState,
  nextState: GitHubLiteMockState,
): void {
  const replacement = cloneJson(nextState);

  target.branches = replacement.branches;
  target.currentUser = replacement.currentUser;
  target.executionScenarios = replacement.executionScenarios;
  target.files = replacement.files;
  target.issueComments = replacement.issueComments;
  target.issues = replacement.issues;
  target.labels = replacement.labels;
  target.pullRequests = replacement.pullRequests;
  target.repository = replacement.repository;
  target.repositoryPermissions = replacement.repositoryPermissions;
  target.teamMemberships = replacement.teamMemberships;
  target.workflowRuns = replacement.workflowRuns;
  target.workflows = replacement.workflows;
}

function trackMockExecutionRequest(
  state: GitHubLiteMockState,
  issue: GitHubIssue,
): void {
  if (
    issue.isPullRequest ||
    !hasBatchPlaneLabel(issue.labels, "execution-request") ||
    state.executionScenarios.some(
      (scenario) => scenario.issueNumber === issue.number,
    )
  ) {
    return;
  }

  const marker = parseMockBatchPlaneMarker(issue.body, "execution-request");
  const batchId = marker.get("batchId");
  const requestDigest = marker.get("requestDigest");
  const requestId = marker.get("requestId");

  if (!batchId || !requestDigest || !requestId) {
    return;
  }

  state.executionScenarios.push({
    batchId,
    issueNumber: issue.number,
    requestDigest,
    requestId,
    state: marker.get("status") === "REJECTED" ? "rejected" : "requested",
  });
}

function applyMockExecutionCommentTransition(
  state: GitHubLiteMockState,
  comment: GitHubIssueComment,
): void {
  const approval = parseMockExecutionApprovalComment(comment.body);

  if (approval) {
    applyMockExecutionApprovalTransition(state, comment.issueNumber, approval);
    return;
  }

  const dispatcherStatus = parseMockDispatcherStatus(comment.body);

  if (dispatcherStatus) {
    applyMockDispatcherStatusTransition(
      state,
      comment.issueNumber,
      dispatcherStatus,
    );
  }
}

function parseMockExecutionApprovalComment(body: string): {
  decision: "APPROVED" | "REJECTED";
  batchId: string;
  requestDigest: string;
  requestId: string;
} | null {
  const marker = parseMockBatchPlaneMarker(body, "execution-approval");
  const decision = marker.get("decision");
  const batchId = marker.get("batchId");
  const requestDigest = marker.get("requestDigest");
  const requestId = marker.get("requestId");

  if (decision !== "APPROVED" && decision !== "REJECTED") {
    return null;
  }

  if (!batchId || !requestDigest || !requestId) {
    return null;
  }

  if (
    decision === "APPROVED" &&
    parseMockApprovalCommandDigest(body) !== requestDigest
  ) {
    return null;
  }

  return {
    batchId,
    decision,
    requestDigest,
    requestId,
  };
}

function parseMockApprovalCommandDigest(body: string): string | null {
  const firstLine = body.split("\n", 1)[0]?.trim();
  const match = firstLine?.match(/^\/bgcp approve\s+requestDigest=(\S+)$/);

  return match?.[1] ?? null;
}

function parseMockDispatcherStatus(body: string): {
  status: "DISPATCHING" | "DISPATCHED" | "DISPATCH_FAILED";
  batchId: string;
  requestDigest: string;
  requestId: string;
} | null {
  const marker = parseMockBatchPlaneMarker(body, "bgcp:dispatcher");
  const status = marker.get("status");
  const batchId = marker.get("batchId");
  const requestDigest = marker.get("requestDigest");
  const requestId = marker.get("requestId");

  if (
    status !== "DISPATCHING" &&
    status !== "DISPATCHED" &&
    status !== "DISPATCH_FAILED"
  ) {
    return null;
  }

  if (!batchId || !requestDigest || !requestId) {
    return null;
  }

  return {
    batchId,
    requestDigest,
    requestId,
    status,
  };
}

function applyMockExecutionApprovalTransition(
  state: GitHubLiteMockState,
  issueNumber: number,
  approval: {
    decision: "APPROVED" | "REJECTED";
    batchId: string;
    requestDigest: string;
    requestId: string;
  },
): void {
  const scenario = findMatchingMockExecutionScenario(
    state,
    issueNumber,
    approval,
  );

  if (!scenario) {
    return;
  }

  const issue = findMockIssue(state, issueNumber);

  if (approval.decision === "APPROVED") {
    if (scenario.state === "requested") {
      scenario.state = "approved";
    }

    return;
  }

  scenario.state = "rejected";
  issue.labels = uniqueStrings([...issue.labels, batchPlaneLabel("rejected")]);
  ensureMockLabel(state, "batchplane:rejected");
  issue.state = "closed";
}

function applyMockDispatcherStatusTransition(
  state: GitHubLiteMockState,
  issueNumber: number,
  dispatcherStatus: {
    status: "DISPATCHING" | "DISPATCHED" | "DISPATCH_FAILED";
    batchId: string;
    requestDigest: string;
    requestId: string;
  },
): void {
  const scenario = findMatchingMockExecutionScenario(
    state,
    issueNumber,
    dispatcherStatus,
  );

  if (!scenario) {
    return;
  }

  const issue = findMockIssue(state, issueNumber);
  const { status } = dispatcherStatus;

  if (status === "DISPATCHING") {
    scenario.state = "dispatching";
    issue.labels = uniqueStrings([
      ...issue.labels,
      batchPlaneLabel("dispatching"),
    ]);
    ensureMockLabel(state, "batchplane:dispatching");
    ensureMockWorkflowRun(state, scenario, status);
    return;
  }

  if (status === "DISPATCHED") {
    scenario.state = "dispatched";
    issue.labels = uniqueStrings([
      ...removeBatchPlaneLabel(issue.labels, "dispatching"),
      batchPlaneLabel("dispatched"),
    ]);
    ensureMockLabel(state, "batchplane:dispatched");
    issue.state = "closed";
    ensureMockWorkflowRun(state, scenario, status);
    return;
  }

  scenario.state = "failed";
  issue.labels = uniqueStrings([
    ...removeBatchPlaneLabel(issue.labels, "dispatching"),
    batchPlaneLabel("dispatch-failed"),
  ]);
  ensureMockLabel(state, "batchplane:dispatch-failed");
}

function findMatchingMockExecutionScenario(
  state: GitHubLiteMockState,
  issueNumber: number,
  evidence: {
    batchId: string;
    requestDigest: string;
    requestId: string;
  },
): GitHubLiteMockExecutionScenario | null {
  return (
    state.executionScenarios.find(
      (scenario) =>
        scenario.issueNumber === issueNumber &&
        scenario.batchId === evidence.batchId &&
        scenario.requestDigest === evidence.requestDigest &&
        scenario.requestId === evidence.requestId,
    ) ?? null
  );
}

function ensureMockWorkflowRun(
  state: GitHubLiteMockState,
  scenario: GitHubLiteMockExecutionScenario,
  status: "DISPATCHING" | "DISPATCHED" | "DISPATCH_FAILED",
): void {
  const runStatus: GitHubWorkflowRunStatus =
    status === "DISPATCHING" ? "in_progress" : "completed";
  const conclusion: GitHubWorkflowRunConclusion =
    status === "DISPATCHING"
      ? null
      : status === "DISPATCHED"
        ? "success"
        : "failure";
  const workflowId =
    state.workflows.find((workflow) =>
      workflow.path.endsWith(`/${scenario.batchId}.yml`),
    )?.id ??
    state.workflows[0]?.id ??
    0;

  if (scenario.workflowRunId) {
    const workflowRun = state.workflowRuns.find(
      (candidate) => candidate.id === scenario.workflowRunId,
    );

    if (workflowRun) {
      workflowRun.status = runStatus;
      workflowRun.conclusion = conclusion;
      return;
    }
  }

  const workflowRunId = nextMockNumber(
    state.workflowRuns.map((workflowRun) => workflowRun.id),
  );
  scenario.workflowRunId = workflowRunId;
  state.workflowRuns.push({
    actor: "github-actions[bot]",
    batchId: scenario.batchId,
    conclusion,
    createdAt: new Date(0).toISOString(),
    displayTitle: `BatchPlane ${scenario.batchId} ${scenario.requestId}`,
    event: "workflow_dispatch",
    id: workflowRunId,
    name: `Run ${scenario.batchId}`,
    requestId: scenario.requestId,
    runAttempt: 1,
    startedAt: new Date(0).toISOString(),
    status: runStatus,
    updatedAt: new Date(0).toISOString(),
    url: `${state.repository.url}/actions/runs/${workflowRunId}`,
    workflowId,
    workflowPath: `.github/workflows/${scenario.batchId}.yml`,
  });
}

function parseMockBatchPlaneMarker(
  body: string,
  kind: string,
): Map<string, string> {
  const marker = new Map<string, string>();
  const match = body.match(
    new RegExp(`<!--\\s*batch(?:plane|trail):${kind}\\s*([\\s\\S]*?)-->`),
  );

  if (!match?.[1]) {
    return marker;
  }

  for (const line of match[1].split("\n")) {
    const separatorIndex = line.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    marker.set(
      line.slice(0, separatorIndex).trim(),
      line.slice(separatorIndex + 1).trim(),
    );
  }

  return marker;
}

function buildHeaders(token: string, initHeaders?: HeadersInit): Headers {
  const headers = new Headers(initHeaders);

  headers.set("Accept", "application/vnd.github+json");
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Content-Type", "application/json");
  headers.set("X-GitHub-Api-Version", "2022-11-28");

  return headers;
}

function mapIssueResponse(issue: GitHubIssueResponse | null): GitHubIssue {
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
    isPullRequest: Boolean(issue.pull_request),
  };
}

function mapIssueCommentResponse(
  comment: GitHubCommentResponse,
  issueNumber: number,
): GitHubIssueComment {
  return {
    author: comment.user?.login ?? "",
    body: comment.body,
    createdAt: comment.created_at ?? "",
    id: comment.id,
    issueNumber,
  };
}

function mapIssueEventResponse(
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

function mapLabelResponse(label: GitHubLabelResponse): GitHubLabel {
  return {
    color: label.color,
    ...(label.description ? { description: label.description } : {}),
    name: label.name,
  };
}

function mapPullRequestResponse(
  pullRequest: GitHubPullRequestResponse,
): GitHubPullRequest {
  return {
    number: pullRequest.number,
    title: pullRequest.title,
    url: pullRequest.html_url,
    head: pullRequest.head.ref,
    base: pullRequest.base.ref,
    state: pullRequest.state,
    author: pullRequest.user?.login ?? "",
    body: pullRequest.body ?? "",
    merged: pullRequest.merged ?? Boolean(pullRequest.merged_at),
  };
}

function mapWorkflowResponse(workflow: GitHubWorkflowResponse): GitHubWorkflow {
  return {
    id: workflow.id,
    name: workflow.name,
    path: workflow.path,
    state: workflow.state === "disabled" ? "disabled" : "active",
    url: workflow.html_url,
  };
}

function mapWorkflowRunResponse(
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
    ...(run.path ? { workflowPath: run.path } : {}),
  };
}

function mapWorkflowJobResponse(
  job: GitHubWorkflowJobResponse,
): GitHubWorkflowJob {
  return {
    conclusion: mapWorkflowRunConclusion(job.conclusion),
    ...(job.completed_at ? { completedAt: job.completed_at } : {}),
    id: job.id,
    name: job.name,
    ...(job.started_at ? { startedAt: job.started_at } : {}),
    status: mapWorkflowRunStatus(job.status),
    ...(job.html_url ? { url: job.html_url } : {}),
  };
}

function mapWorkflowRunStatus(
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

function mapWorkflowRunConclusion(
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

function mapWorkflowRunEvent(
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

function mapRepositoryPermissionValue(
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

function normalizeRepositoryPermissionName(
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

function mapTeamMembershipState(
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

function mapTeamMembershipRole(
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

function buildQuery(params: Record<string, string | undefined>): string {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      query.set(key, value);
    }
  }

  const serializedQuery = query.toString();

  return serializedQuery ? `?${serializedQuery}` : "";
}

function buildLabelSearchQualifier(label: string): string {
  return /\s/u.test(label)
    ? `label:"${label.replace(/"/g, '\\"')}"`
    : `label:${label}`;
}

function encodePath(path: string): string {
  return path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function decodeBase64(value: string): string {
  const bytes = Uint8Array.from(atob(value.replace(/\s/g, "")), (character) =>
    character.charCodeAt(0),
  );

  return new TextDecoder().decode(bytes);
}

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function truncateTextByBytes(
  content: string,
  maxBytes: number,
): { content: string; truncated: boolean } {
  if (maxBytes <= 0) {
    return {
      content: "",
      truncated: getByteLength(content) > 0,
    };
  }

  const bytes = new TextEncoder().encode(content);

  if (bytes.byteLength <= maxBytes) {
    return {
      content,
      truncated: false,
    };
  }

  return {
    content: new TextDecoder().decode(bytes.slice(0, maxBytes)),
    truncated: true,
  };
}

function getByteLength(content: string): number {
  return new TextEncoder().encode(content).byteLength;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { message?: string };
    return (
      payload.message ?? `GitHub API request failed with ${response.status}`
    );
  } catch {
    return `GitHub API request failed with ${response.status}`;
  }
}

function mapStatusToErrorCode(status: number): GitHubLiteApiErrorCode {
  if (status === 400 || status === 422) {
    return "bad-request";
  }

  if (status === 401) {
    return "unauthorized";
  }

  if (status === 403) {
    return "forbidden";
  }

  if (status === 404) {
    return "not-found";
  }

  if (status === 429) {
    return "rate-limited";
  }

  return "unknown";
}

function assertMockRepository(state: GitHubLiteMockState, repo: RepoRef) {
  if (
    repo.owner === state.repository.owner &&
    repo.repo === state.repository.repo
  ) {
    return;
  }

  throw new GitHubLiteApiError(
    `GitHub repository not found: ${repo.owner}/${repo.repo}`,
    "not-found",
    404,
  );
}

function assertMockIssueOrPullRequest(
  state: GitHubLiteMockState,
  issueNumber: number,
) {
  if (
    state.issues.some((issue) => issue.number === issueNumber) ||
    state.pullRequests.some((pullRequest) => pullRequest.number === issueNumber)
  ) {
    return;
  }

  throw new GitHubLiteApiError(
    `GitHub issue not found: ${issueNumber}`,
    "not-found",
    404,
  );
}

function findMockIssue(
  state: GitHubLiteMockState,
  issueNumber: number,
): GitHubIssue {
  const issue = state.issues.find(
    (candidate) => candidate.number === issueNumber,
  );

  if (!issue) {
    throw new GitHubLiteApiError(
      `GitHub issue not found: ${issueNumber}`,
      "not-found",
      404,
    );
  }

  return issue;
}

function resolveMockBranch(
  state: GitHubLiteMockState,
  ref = state.repository.defaultBranch,
): string {
  if (!state.branches[ref]) {
    throw new GitHubLiteApiError(
      `GitHub branch not found: ${ref}`,
      "not-found",
      404,
    );
  }

  return ref;
}

function getMockDirectoryEntries(
  state: GitHubLiteMockState,
  directoryPath: string,
  branch: string,
): GitHubDirectoryEntry[] {
  const prefix = directoryPath.replace(/\/$/u, "");
  const entryByPath = new Map<string, GitHubDirectoryEntry>();

  state.files
    .filter((file) => file.branch === branch)
    .forEach((file) => {
      const relativePath = file.path.startsWith(`${prefix}/`)
        ? file.path.slice(prefix.length + 1)
        : "";

      if (!relativePath) {
        return;
      }

      const [name, ...rest] = relativePath.split("/");

      if (!name) {
        return;
      }

      const path = `${prefix}/${name}`;
      const type = rest.length > 0 ? "dir" : "file";

      if (!entryByPath.has(path)) {
        entryByPath.set(path, {
          name,
          path,
          sha: type === "file" ? file.sha : `mock-dir-sha-${path}`,
          type,
        });
      }
    });

  return [...entryByPath.values()].sort((left, right) =>
    left.path.localeCompare(right.path),
  );
}

function ensureMockLabel(state: GitHubLiteMockState, name: string) {
  if (state.labels.some((label) => label.name === name)) {
    return;
  }

  state.labels.push({
    color: "58616C",
    name,
  });
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function batchPlaneLabel(name: string): string {
  return `batchplane:${name}`;
}

function hasBatchPlaneLabel(labels: string[], name: string): boolean {
  return (
    labels.includes(batchPlaneLabel(name)) ||
    labels.includes(`batchtrail:${name}`)
  );
}

function removeBatchPlaneLabel(labels: string[], name: string): string[] {
  return labels.filter(
    (label) =>
      label !== batchPlaneLabel(name) && label !== `batchtrail:${name}`,
  );
}

function nextMockNumber(values: number[]): number {
  return Math.max(0, ...values) + 1;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createMockExecutionScenarios(
  batchId: string,
): GitHubLiteMockExecutionScenario[] {
  const states: GitHubLiteMockExecutionState[] = [
    "requested",
    "approved",
    "dispatching",
    "dispatched",
    "business-failed",
    "rejected",
    "failed",
    "gate-blocked",
  ];

  return states.map((state, index) => {
    const sequence = index + 1;

    return {
      batchId,
      issueNumber: 100 + sequence,
      requestDigest: createMockDigest(sequence),
      requestId: `btr-20260514010${sequence}00-${batchId}-${String(
        sequence,
      ).padStart(8, "0")}`,
      state,
      workflowRunId:
        state === "requested" ||
        state === "approved" ||
        state === "rejected" ||
        state === "failed"
          ? undefined
          : 200 + sequence,
    };
  });
}

function buildMockExecutionIssue(
  repository: GitHubRepository,
  scenario: GitHubLiteMockExecutionScenario,
): GitHubIssue {
  const labels = ["batchplane:execution-request"];

  if (scenario.state === "dispatching") {
    labels.push("batchplane:dispatching");
  }

  if (scenario.state === "dispatched") {
    labels.push("batchplane:dispatched");
  }

  if (scenario.state === "business-failed") {
    labels.push("batchplane:dispatched");
  }

  if (scenario.state === "failed") {
    labels.push("batchplane:dispatch-failed");
  }

  if (scenario.state === "gate-blocked") {
    labels.push("batchplane:gate-blocked");
  }

  if (scenario.state === "rejected") {
    labels.push("batchplane:rejected");
  }

  return {
    author: "developer",
    body: buildMockExecutionIssueBody(scenario),
    isPullRequest: false,
    labels,
    number: scenario.issueNumber,
    state:
      scenario.state === "dispatched" ||
      scenario.state === "business-failed" ||
      scenario.state === "rejected"
        ? "closed"
        : "open",
    title: `Run batch ${scenario.batchId} (${scenario.state})`,
    url: `${repository.url}/issues/${scenario.issueNumber}`,
  };
}

function buildMockExecutionIssueBody(
  scenario: GitHubLiteMockExecutionScenario,
): string {
  const requestedAt = "2026-05-14T01:02:03.000Z";
  const expiresAt = "2026-05-14T02:02:03.000Z";
  const requestStatus =
    scenario.state === "rejected" ? "REJECTED" : "REQUESTED";

  return [
    "## BatchPlane Execution Request",
    "",
    `- Request ID: \`${scenario.requestId}\``,
    `- Batch ID: \`${scenario.batchId}\``,
    "- Requested by: @developer",
    `- Requested at: ${requestedAt}`,
    `- Expires at: ${expiresAt}`,
    `- Request digest: \`${scenario.requestDigest}\``,
    `- Status: ${requestStatus}`,
    "",
    "### Canonical payload",
    "",
    "```json",
    JSON.stringify(
      {
        apiVersion: "batchplane.io/v1",
        kind: "ExecutionRequest",
        metadata: {
          batchId: scenario.batchId,
          requestId: scenario.requestId,
        },
        spec: {
          batch: {
            criticality: "HIGH",
            domain: "payments",
            environment: "PROD",
            name: "Daily Close",
            owner: "ops-team",
          },
          execution: {
            command: "echo mock batch",
            gateRequired: true,
            runsOn: "ubuntu-latest",
          },
          expiresAt,
          reason: "Manual request from BatchPlane Lite.",
          requestedAt,
          requestedBy: "developer",
          workflow: {
            path: `.github/workflows/${scenario.batchId}.yml`,
            ref: "main",
          },
        },
      },
      null,
      2,
    ),
    "```",
    "",
    "<!-- batchplane:execution-request",
    `requestId=${scenario.requestId}`,
    `batchId=${scenario.batchId}`,
    `requestDigest=${scenario.requestDigest}`,
    `status=${requestStatus}`,
    "-->",
  ].join("\n");
}

function buildMockExecutionComments(
  scenario: GitHubLiteMockExecutionScenario,
  approver: string,
): GitHubIssueComment[] {
  const comments: GitHubIssueComment[] = [];

  if (
    scenario.state === "approved" ||
    scenario.state === "dispatching" ||
    scenario.state === "dispatched" ||
    scenario.state === "business-failed" ||
    scenario.state === "failed" ||
    scenario.state === "gate-blocked"
  ) {
    comments.push({
      author: approver,
      body: [
        `/bgcp approve requestDigest=${scenario.requestDigest}`,
        "",
        "## BatchPlane Execution Approval",
        "",
        "- Decision: APPROVED",
        `- Approver: @${approver}`,
        "- Approved at: 2026-05-14T01:05:00.000Z",
        `- Request ID: \`${scenario.requestId}\``,
        `- Batch ID: \`${scenario.batchId}\``,
        `- Request digest: \`${scenario.requestDigest}\``,
        "",
        "<!-- batchplane:execution-approval",
        "decision=APPROVED",
        `requestId=${scenario.requestId}`,
        `batchId=${scenario.batchId}`,
        `requestDigest=${scenario.requestDigest}`,
        "-->",
      ].join("\n"),
      createdAt: "2026-05-14T01:05:00.000Z",
      id: scenario.issueNumber * 10 + 1,
      issueNumber: scenario.issueNumber,
    });
  }

  if (scenario.state === "dispatching") {
    comments.push(buildMockDispatcherComment(scenario, "DISPATCHING"));
  }

  if (scenario.state === "dispatched") {
    comments.push(buildMockDispatcherComment(scenario, "DISPATCHED"));
  }

  if (scenario.state === "business-failed") {
    comments.push(buildMockDispatcherComment(scenario, "DISPATCHED"));
  }

  if (scenario.state === "failed") {
    comments.push(buildMockDispatcherComment(scenario, "DISPATCH_FAILED"));
  }

  if (scenario.state === "gate-blocked") {
    comments.push({
      author: "github-actions[bot]",
      body: [
        "## BatchPlane Gate Decision",
        "",
        "- Decision: BLOCKED",
        "- Reason: RERUN_NOT_AUTHORIZED",
        `- Request ID: \`${scenario.requestId}\``,
        `- Batch ID: \`${scenario.batchId}\``,
        `- Request digest: \`${scenario.requestDigest}\``,
        "",
        "<!-- batchplane:gate-decision",
        "allowed=false",
        "reasonCode=RERUN_NOT_AUTHORIZED",
        `requestId=${scenario.requestId}`,
        `batchId=${scenario.batchId}`,
        `requestDigest=${scenario.requestDigest}`,
        "-->",
      ].join("\n"),
      createdAt: "2026-05-14T01:08:00.000Z",
      id: scenario.issueNumber * 10 + 4,
      issueNumber: scenario.issueNumber,
    });
  }

  if (scenario.state === "rejected") {
    comments.push({
      author: approver,
      body: [
        "## BatchPlane Execution Approval",
        "",
        "- Decision: REJECTED",
        `- Rejector: @${approver}`,
        "- Rejected at: 2026-05-14T01:06:00.000Z",
        `- Request ID: \`${scenario.requestId}\``,
        `- Batch ID: \`${scenario.batchId}\``,
        `- Request digest: \`${scenario.requestDigest}\``,
        "",
        "<!-- batchplane:execution-approval",
        "decision=REJECTED",
        `requestId=${scenario.requestId}`,
        `batchId=${scenario.batchId}`,
        `requestDigest=${scenario.requestDigest}`,
        "-->",
      ].join("\n"),
      createdAt: "2026-05-14T01:06:00.000Z",
      id: scenario.issueNumber * 10 + 5,
      issueNumber: scenario.issueNumber,
    });
  }

  return comments;
}

function buildMockDispatcherComment(
  scenario: GitHubLiteMockExecutionScenario,
  status: "DISPATCHING" | "DISPATCHED" | "DISPATCH_FAILED",
): GitHubIssueComment {
  return {
    author: "github-actions[bot]",
    body: [
      `## BatchPlane Dispatcher ${status}`,
      "",
      `- Status: ${status}`,
      `- Request ID: \`${scenario.requestId}\``,
      `- Batch ID: \`${scenario.batchId}\``,
      `- Request digest: \`${scenario.requestDigest}\``,
      "",
      "<!-- batchplane:bgcp:dispatcher",
      `status=${status}`,
      `requestId=${scenario.requestId}`,
      `batchId=${scenario.batchId}`,
      `requestDigest=${scenario.requestDigest}`,
      "-->",
    ].join("\n"),
    createdAt: "2026-05-14T01:07:00.000Z",
    id:
      scenario.issueNumber * 10 +
      (status === "DISPATCHING" ? 2 : status === "DISPATCHED" ? 3 : 6),
    issueNumber: scenario.issueNumber,
  };
}

function buildMockWorkflowRuns(
  repository: GitHubRepository,
  workflowId: number,
  scenario: GitHubLiteMockExecutionScenario,
): GitHubWorkflowRun[] {
  if (!scenario.workflowRunId) {
    return [];
  }

  const status: GitHubWorkflowRunStatus =
    scenario.state === "dispatching" ? "in_progress" : "completed";
  const conclusion: GitHubWorkflowRunConclusion =
    scenario.state === "dispatched"
      ? "success"
      : scenario.state === "dispatching"
        ? null
        : "failure";

  return [
    {
      actor: "github-actions[bot]",
      batchId: scenario.batchId,
      conclusion,
      createdAt: "2026-05-14T01:07:00.000Z",
      displayTitle: `BatchPlane ${scenario.batchId} ${scenario.requestId}`,
      event: "workflow_dispatch",
      id: scenario.workflowRunId,
      name: `Run ${scenario.batchId}`,
      requestId: scenario.requestId,
      runAttempt: scenario.state === "gate-blocked" ? 2 : 1,
      startedAt: "2026-05-14T01:07:00.000Z",
      status,
      updatedAt:
        scenario.state === "dispatching" ? "" : "2026-05-14T01:09:00.000Z",
      url: `${repository.url}/actions/runs/${scenario.workflowRunId}`,
      workflowId,
      workflowPath: `.github/workflows/${scenario.batchId}.yml`,
    },
  ];
}

function buildMockWorkflowRunJobs(
  state: GitHubLiteMockState,
  runId: number,
): GitHubWorkflowJob[] {
  const run = state.workflowRuns.find((candidate) => candidate.id === runId);

  if (!run) {
    return [];
  }

  const scenario = state.executionScenarios.find(
    (candidate) => candidate.workflowRunId === runId,
  );
  const gateBlocked = scenario?.state === "gate-blocked";
  const businessFailure = run.conclusion === "failure" && !gateBlocked;

  return [
    {
      completedAt:
        run.status === "queued" ? undefined : "2026-05-14T01:08:00.000Z",
      conclusion:
        run.status === "completed"
          ? gateBlocked
            ? "failure"
            : "success"
          : null,
      id: runId * 10 + 1,
      name: "BatchPlane Gate",
      startedAt: run.startedAt,
      status: run.status === "queued" ? "queued" : "completed",
      url: `${state.repository.url}/actions/runs/${runId}/job/${runId * 10 + 1}`,
    },
    {
      completedAt:
        run.status === "completed" && !gateBlocked
          ? "2026-05-14T01:09:00.000Z"
          : undefined,
      conclusion:
        run.status !== "completed"
          ? null
          : gateBlocked
            ? "skipped"
            : businessFailure
              ? "failure"
              : "success",
      id: runId * 10 + 2,
      name: "Run governed batch",
      startedAt: gateBlocked ? undefined : "2026-05-14T01:08:00.000Z",
      status:
        run.status === "completed"
          ? "completed"
          : run.status === "in_progress"
            ? "in_progress"
            : "queued",
      url: `${state.repository.url}/actions/runs/${runId}/job/${runId * 10 + 2}`,
    },
  ];
}

function buildMockWorkflowJobLog(job: GitHubWorkflowJob): string {
  const conclusion = job.conclusion ?? "in_progress";
  const gateJob = job.name.toLowerCase().includes("gate");

  if (!gateJob) {
    return [
      `2026-05-14T01:07:50.000Z ##[group]Checkout registered assets`,
      "2026-05-14T01:07:51.000Z Syncing repository.",
      "2026-05-14T01:07:52.000Z ##[endgroup]Checkout registered assets",
      "2026-05-14T01:08:00.000Z ##[group]Run batch",
      `2026-05-14T01:08:01.000Z Job ID ${job.id}`,
      `2026-05-14T01:08:02.000Z Status ${job.status}`,
      `2026-05-14T01:08:03.000Z Conclusion ${conclusion}`,
      "2026-05-14T01:08:04.000Z BatchPlane approved execution for payment.daily-close.",
      "2026-05-14T01:08:05.000Z Running governed batch command.",
      "2026-05-14T01:09:00.000Z ##[endgroup]Run batch",
      "",
    ].join("\n");
  }

  return [
    `2026-05-14T01:07:00.000Z ##[group]${job.name}`,
    `2026-05-14T01:07:01.000Z Job ID ${job.id}`,
    `2026-05-14T01:07:02.000Z Status ${job.status}`,
    `2026-05-14T01:07:03.000Z Conclusion ${conclusion}`,
    "2026-05-14T01:07:04.000Z BatchPlane Gate evidence verified.",
    `2026-05-14T01:09:00.000Z ##[endgroup]${job.name}`,
    "",
  ].join("\n");
}

function buildMockBatchDefinitionYaml(batchId: string): string {
  return [
    'apiVersion: "batchplane.io/v1"',
    'kind: "BatchDefinition"',
    "metadata:",
    `  id: "${batchId}"`,
    '  name: "Daily Close"',
    "spec:",
    '  owner: "ops-team"',
    '  domain: "payments"',
    '  environment: "PROD"',
    '  criticality: "HIGH"',
    '  status: "ACTIVE"',
    "  workflow:",
    `    path: ".github/workflows/${batchId}.yml"`,
    '    ref: "main"',
    "  gateRequired: true",
    "  execution:",
    '    runsOn: "ubuntu-latest"',
    '    command: "echo mock batch"',
    "",
  ].join("\n");
}

function buildMockBatchWorkflowYaml(batchId: string): string {
  return [
    `name: "BatchPlane - ${batchId}"`,
    "run-name: BatchPlane ${{ inputs.batch_id }} ${{ inputs.request_id }}",
    "",
    "on:",
    "  workflow_dispatch:",
    "    inputs:",
    "      request_id:",
    "        required: true",
    "      batch_id:",
    "        required: true",
    "      request_digest:",
    "        required: true",
    "",
    "jobs:",
    "  batchplane-gate:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - uses: always0ne/batchplane/actions/gate@main",
    "  run-batch:",
    "    needs: batchplane-gate",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - run: echo mock batch",
    "",
  ].join("\n");
}

function buildMockRoleMappingYaml(): string {
  return [
    'apiVersion: "batchplane.io/v1"',
    'kind: "RoleMapping"',
    "metadata:",
    '  id: "default"',
    "spec:",
    "  roles:",
    "    requester:",
    '      repositoryRoles: ["write", "maintain", "admin"]',
    "    approver:",
    '      repositoryRoles: ["maintain", "admin"]',
    "    maintainer:",
    '      repositoryRoles: ["maintain", "admin"]',
    "    auditor:",
    '      repositoryRoles: ["triage"]',
    "",
  ].join("\n");
}

function createMockDigest(sequence: number): string {
  return `sha256:${String(sequence).padStart(64, "0")}`;
}
