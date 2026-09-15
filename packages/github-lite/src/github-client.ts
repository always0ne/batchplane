import {
  mapIssueCommentResponse,
  mapIssueEventResponse,
  mapIssueResponse,
  mapLabelResponse,
  mapPullRequestFileResponse,
  mapPullRequestResponse,
  mapRepositoryPermissionValue,
  mapTeamMembershipRole,
  mapTeamMembershipState,
  mapWorkflowJobResponse,
  mapWorkflowResponse,
  mapWorkflowRunResponse,
  type GitHubCommentResponse,
  type GitHubContentResponse,
  type GitHubDirectoryEntryResponse,
  type GitHubIssueEventResponse,
  type GitHubIssueResponse,
  type GitHubIssueSearchResponse,
  type GitHubLabelResponse,
  type GitHubMergeResponse,
  type GitHubPullRequestFileResponse,
  type GitHubPullRequestResponse,
  type GitHubRefResponse,
  type GitHubRepositoryPermissionResponse,
  type GitHubRepositoryResponse,
  type GitHubTeamMembershipResponse,
  type GitHubUserResponse,
  type GitHubWorkflowJobsResponse,
  type GitHubWorkflowResponse,
  type GitHubWorkflowRunResponse,
  type GitHubWorkflowRunsResponse,
  type GitHubWorkflowsResponse,
  type GitHubDeleteFileResponse,
  type GitHubPutFileResponse,
  normalizeRepositoryPermissionName,
} from "./github-responses.js";
import {
  buildLabelSearchQualifier,
  buildQuery,
  createGitHubRequester,
  decodeBase64,
  encodeBase64,
  encodePath,
  getByteLength,
  hasWorkflowDispatchTrigger,
  truncateTextByBytes,
  type GitHubRequester,
} from "./github-http.js";
import {
  GitHubLiteApiError,
  type GitHubLiteClient,
  type GitHubLiteClientOptions,
} from "./github-types.js";

export function createGitHubLiteClient(
  options: GitHubLiteClientOptions,
): GitHubLiteClient {
  const requester = createGitHubRequester(options);

  return {
    ...createRepositoryOperations(requester),
    ...createPullRequestOperations(requester),
    ...createIssueOperations(requester),
    ...createWorkflowOperations(requester),
    ...createRepositoryAccessOperations(requester),
  };
}

function createRepositoryOperations(
  requester: GitHubRequester,
): Pick<
  GitHubLiteClient,
  | "createBranch"
  | "deleteFile"
  | "getBranchHeadSha"
  | "getCurrentUser"
  | "getDirectory"
  | "getFile"
  | "getRepository"
  | "putFile"
> {
  const { request } = requester;

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
        contentBase64: content.content.replace(/\s/g, ""),
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

    async deleteFile({ owner, repo, path, branch, message, sha }) {
      const response = await request<GitHubDeleteFileResponse>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo,
        )}/contents/${encodePath(path)}`,
        {
          method: "DELETE",
          body: JSON.stringify({
            branch,
            message,
            sha,
          }),
        },
      );

      return {
        path: response?.content?.path ?? path,
      };
    },
  };
}

function createPullRequestOperations(
  requester: GitHubRequester,
): Pick<
  GitHubLiteClient,
  | "createPullRequest"
  | "getPullRequest"
  | "listPullRequestFiles"
  | "listPullRequests"
  | "mergePullRequest"
  | "updatePullRequest"
> {
  const { request } = requester;

  return {
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

    async getPullRequest({ owner, repo, pullNumber }) {
      const pullRequest = await request<GitHubPullRequestResponse>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo,
        )}/pulls/${pullNumber}`,
        {},
        { allowNotFound: true },
      );

      return pullRequest ? mapPullRequestResponse(pullRequest) : null;
    },

    async updatePullRequest({ owner, repo, pullNumber, body, title }) {
      const pullRequest = await request<GitHubPullRequestResponse>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo,
        )}/pulls/${pullNumber}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            ...(body !== undefined ? { body } : {}),
            ...(title !== undefined ? { title } : {}),
          }),
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
      const query = buildQuery({ base, head, per_page: "100", state });
      const pullRequests = await request<GitHubPullRequestResponse[]>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo,
        )}/pulls${query}`,
      );

      return (pullRequests ?? []).map(mapPullRequestResponse);
    },

    async listPullRequestFiles({ owner, repo, pullNumber }) {
      const files = await request<GitHubPullRequestFileResponse[]>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo,
        )}/pulls/${pullNumber}/files?per_page=100`,
      );

      return (files ?? []).map(mapPullRequestFileResponse);
    },

    async mergePullRequest({
      owner,
      repo,
      pullNumber,
      commitTitle,
      commitMessage,
      mergeMethod = "squash",
      expectedHeadSha,
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
            ...(expectedHeadSha ? { sha: expectedHeadSha } : {}),
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
  };
}

function createIssueOperations(
  requester: GitHubRequester,
): Pick<
  GitHubLiteClient,
  | "addIssueLabels"
  | "closeIssue"
  | "createIssue"
  | "createIssueComment"
  | "createLabel"
  | "getIssue"
  | "listIssueComments"
  | "listIssueEvents"
  | "listIssues"
  | "listLabels"
  | "removeIssueLabel"
  | "searchIssues"
  | "updateIssue"
> {
  const { request } = requester;

  return {
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

    async getIssue({ owner, repo, issueNumber }) {
      const issue = await request<GitHubIssueResponse>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo,
        )}/issues/${issueNumber}`,
        {},
        { allowNotFound: true },
      );

      return issue ? mapIssueResponse(issue) : null;
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
      const query = buildQuery({ per_page: "100", state });
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
      const query = buildQuery({ per_page: "100" });
      const comments = await request<GitHubCommentResponse[]>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo,
        )}/issues/${issueNumber}/comments${query}`,
      );

      return (comments ?? []).map((comment) =>
        mapIssueCommentResponse(comment, issueNumber),
      );
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

      return mapIssueCommentResponse(comment, issueNumber);
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

function createWorkflowOperations(
  requester: GitHubRequester,
): Pick<
  GitHubLiteClient,
  | "getWorkflow"
  | "getWorkflowJobLog"
  | "getWorkflowRun"
  | "listWorkflowRunJobs"
  | "listWorkflowRuns"
  | "listWorkflows"
> {
  const { request, requestText } = requester;
  const defaultLogMaxBytes = 200_000;

  async function readWorkflowContent({
    owner,
    path,
    repo,
  }: {
    owner: string;
    path: string;
    repo: string;
  }): Promise<string | null> {
    const content = await request<GitHubContentResponse>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo,
      )}/contents/${encodePath(path)}`,
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

    return decodeBase64(content.content);
  }

  async function workflowSupportsDispatch({
    owner,
    path,
    repo,
  }: {
    owner: string;
    path: string;
    repo: string;
  }): Promise<boolean> {
    const content = await readWorkflowContent({ owner, path, repo });

    return content ? hasWorkflowDispatchTrigger(content) : false;
  }

  return {
    async listWorkflows({ dispatchableOnly = false, owner, repo }) {
      const workflows = await request<GitHubWorkflowsResponse>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo,
        )}/actions/workflows`,
      );

      const mappedWorkflows = (workflows?.workflows ?? []).map(
        mapWorkflowResponse,
      );

      if (!dispatchableOnly) {
        return mappedWorkflows;
      }

      const dispatchable = await Promise.all(
        mappedWorkflows.map(async (workflow) => ({
          supported: await workflowSupportsDispatch({
            owner,
            path: workflow.path,
            repo,
          }),
          workflow,
        })),
      );

      return dispatchable
        .filter((candidate) => candidate.supported)
        .map((candidate) => candidate.workflow);
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

    async getWorkflowRun({ owner, repo, runAttempt, runId }) {
      const run = await request<GitHubWorkflowRunResponse>(
        runAttempt
          ? `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
              repo,
            )}/actions/runs/${runId}/attempts/${runAttempt}`
          : `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
              repo,
            )}/actions/runs/${runId}`,
        {},
        { allowNotFound: true },
      );

      return run ? mapWorkflowRunResponse(run) : null;
    },

    async listWorkflowRunJobs({ owner, repo, runAttempt, runId }) {
      const jobsPath = runAttempt
        ? `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
            repo,
          )}/actions/runs/${runId}/attempts/${runAttempt}/jobs`
        : `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
            repo,
          )}/actions/runs/${runId}/jobs`;
      const jobs = await request<GitHubWorkflowJobsResponse>(jobsPath);

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
  };
}

function createRepositoryAccessOperations(
  requester: GitHubRequester,
): Pick<
  GitHubLiteClient,
  "getRepositoryPermissionForUser" | "getTeamMembershipForUser"
> {
  const { request } = requester;

  return {
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
  };
}
