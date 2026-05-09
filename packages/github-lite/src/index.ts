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

export type GitHubIssue = {
  number: number;
  title: string;
  body: string;
  labels: string[];
  url: string;
};

export type CreateIssueParams = RepoRef & {
  title: string;
  body: string;
  labels: string[];
};

export type GitHubLiteClient = {
  getCurrentUser(): Promise<GitHubUser>;
  getRepository(params: RepoRef): Promise<GitHubRepository>;
  getFile(
    params: RepoRef & { path: string; ref?: string },
  ): Promise<{ path: string; content: string } | null>;
  createIssue(params: CreateIssueParams): Promise<GitHubIssue>;
  createIssueComment(
    params: RepoRef & { issueNumber: number; body: string },
  ): Promise<{ id: number; body: string }>;
  addIssueLabels(
    params: RepoRef & { issueNumber: number; labels: string[] },
  ): Promise<void>;
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
};

type GitHubIssueResponse = {
  number: number;
  title: string;
  body: string | null;
  labels: Array<string | { name?: string }>;
  html_url: string;
};

type GitHubCommentResponse = {
  id: number;
  body: string;
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
  };
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
