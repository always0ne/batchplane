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

export type MergePullRequestParams = RepoRef & {
  pullNumber: number;
  commitTitle?: string;
  commitMessage?: string;
  mergeMethod?: "merge" | "squash" | "rebase";
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
  listIssues(params: ListIssuesParams): Promise<GitHubIssue[]>;
  createIssueComment(
    params: RepoRef & { issueNumber: number; body: string },
  ): Promise<{ id: number; body: string }>;
  addIssueLabels(
    params: RepoRef & { issueNumber: number; labels: string[] },
  ): Promise<void>;
  closeIssue(params: RepoRef & { issueNumber: number }): Promise<void>;
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

type GitHubCommentResponse = {
  id: number;
  body: string;
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

export function createGitHubLiteClient({
  token,
  apiBaseUrl = "https://api.github.com",
  fetcher = fetch,
}: GitHubLiteClientOptions): GitHubLiteClient {
  const trimmedToken = token.trim();

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

    async listIssues({ owner, repo, state = "open" }) {
      const query = buildQuery({ state });
      const issues = await request<GitHubIssueResponse[]>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo,
        )}/issues${query}`,
      );

      return (issues ?? []).map(mapIssueResponse);
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
