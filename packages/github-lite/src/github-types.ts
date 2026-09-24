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
  contentBase64?: string;
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
  createdAt?: string;
  updatedAt?: string;
  isPullRequest: boolean;
};

export type GitHubIssueState = "open" | "closed" | "all";

export type GitHubPullRequestState = "open" | "closed" | "all";

export type GitHubPullRequest = {
  number: number;
  title: string;
  url: string;
  head: string;
  headSha?: string;
  base: string;
  baseSha?: string;
  state: Exclude<GitHubPullRequestState, "all">;
  author: string;
  body: string;
  createdAt?: string;
  updatedAt?: string;
  merged: boolean;
  /** GitHub's immutable merge commit. It may differ from the approved head. */
  mergeSha?: string;
  /** GitHub's immutable merge timestamp for merged pull requests. */
  mergedAt?: string;
};

export type GitHubPullRequestFileStatus =
  | "added"
  | "changed"
  | "copied"
  | "modified"
  | "removed"
  | "renamed"
  | "unchanged";

export type GitHubPullRequestFile = {
  patch?: string;
  path: string;
  previousPath?: string;
  status: GitHubPullRequestFileStatus;
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
  updatedAt?: string;
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
  repositoryId?: string;
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
  steps?: GitHubWorkflowJobStep[];
};

export type GitHubWorkflowJobStep = {
  name: string;
  number: number;
  status: GitHubWorkflowRunStatus;
  conclusion: GitHubWorkflowRunConclusion;
  startedAt?: string;
  completedAt?: string;
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
  pullRequestFiles: Record<number, GitHubPullRequestFile[]>;
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

export type GetIssueParams = RepoRef & {
  issueNumber: number;
};

export type PutFileParams = RepoRef & {
  path: string;
  branch: string;
  message: string;
  content: string;
  encoding?: "utf-8" | "base64";
  sha?: string;
};

export type DeleteFileParams = RepoRef & {
  path: string;
  branch: string;
  message: string;
  sha: string;
};

export type CreatePullRequestParams = RepoRef & {
  title: string;
  body: string;
  head: string;
  base: string;
};

export type GetPullRequestParams = RepoRef & {
  pullNumber: number;
};

export type UpdatePullRequestParams = RepoRef & {
  pullNumber: number;
  body?: string;
  title?: string;
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
  expectedHeadSha?: string;
};

export type ListWorkflowRunsParams = RepoRef & {
  event?: GitHubWorkflowRun["event"];
  perPage?: number;
  status?: GitHubWorkflowRunStatus;
  workflowId?: number | string;
};

export type ListWorkflowRunJobsParams = RepoRef & {
  runId: number;
  runAttempt?: number;
};

export type ListWorkflowsParams = RepoRef & {
  dispatchableOnly?: boolean;
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
  deleteFile(params: DeleteFileParams): Promise<{ path: string }>;
  createPullRequest(
    params: CreatePullRequestParams,
  ): Promise<GitHubPullRequest>;
  getPullRequest(
    params: GetPullRequestParams,
  ): Promise<GitHubPullRequest | null>;
  updatePullRequest(
    params: UpdatePullRequestParams,
  ): Promise<GitHubPullRequest>;
  listPullRequests(
    params: ListPullRequestsParams,
  ): Promise<GitHubPullRequest[]>;
  listPullRequestFiles(
    params: RepoRef & { pullNumber: number },
  ): Promise<GitHubPullRequestFile[]>;
  mergePullRequest(params: MergePullRequestParams): Promise<GitHubMergeResult>;
  createIssue(params: CreateIssueParams): Promise<GitHubIssue>;
  getIssue(params: GetIssueParams): Promise<GitHubIssue | null>;
  updateIssue(params: UpdateIssueParams): Promise<GitHubIssue>;
  listIssues(params: ListIssuesParams): Promise<GitHubIssue[]>;
  searchIssues(params: SearchIssuesParams): Promise<GitHubIssue[]>;
  listIssueEvents(
    params: RepoRef & { issueNumber: number },
  ): Promise<GitHubIssueEvent[]>;
  listIssueComments(
    params: RepoRef & { issueNumber: number },
  ): Promise<GitHubIssueComment[]>;
  listWorkflows(params: ListWorkflowsParams): Promise<GitHubWorkflow[]>;
  getWorkflow(
    params: RepoRef & { workflowId: number | string },
  ): Promise<GitHubWorkflow | null>;
  listWorkflowRuns(
    params: ListWorkflowRunsParams,
  ): Promise<GitHubWorkflowRun[]>;
  getWorkflowRun(
    params: RepoRef & { runId: number; runAttempt?: number },
  ): Promise<GitHubWorkflowRun | null>;
  listWorkflowRunJobs(
    params: ListWorkflowRunJobsParams,
  ): Promise<GitHubWorkflowJob[]>;
  getWorkflowJobLog(
    params: GetWorkflowJobLogParams,
  ): Promise<GitHubWorkflowJobLog>;
  listLabels(params: RepoRef): Promise<GitHubLabel[]>;
  createLabel(params: RepoRef & GitHubLabel): Promise<GitHubLabel>;
  createIssueComment(
    params: RepoRef & { issueNumber: number; body: string },
  ): Promise<GitHubIssueComment>;
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
  | "conflict"
  | "unauthorized"
  | "forbidden"
  | "not-found"
  | "validation"
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
export type GitHubRepositoryContext = {
  client: GitHubLiteClient;
  repositoryRef: RepoRef;
};
