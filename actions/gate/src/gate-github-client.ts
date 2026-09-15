import { parseExecutionRequestEvidence } from "./gate-evidence.js";
import type { GateIssueComment, GateRepositoryRef } from "./gate-types.js";

type GitHubIssueResponse = {
  body: string | null;
  number: number;
  pull_request?: unknown;
};

type GitHubIssueCommentResponse = {
  body: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  user?: {
    login?: string;
  } | null;
};

type GitHubContentFileResponse = {
  content?: string | null;
  encoding?: string | null;
  path?: string | null;
};

type GitHubRepositoryPermissionResponse = {
  permission?: string | null;
  role_name?: string | null;
  user?: {
    login?: string;
  } | null;
};

type GitHubTeamMembershipResponse = {
  role?: string | null;
  state?: string | null;
};

export type GateGitHubClient = ReturnType<typeof createGateGitHubClient>;

export function createGateGitHubClient({
  apiBaseUrl,
  fetcher,
  owner,
  repo,
  token,
}: {
  apiBaseUrl: string;
  fetcher: typeof fetch;
  owner: string;
  repo: string;
  token: string;
}) {
  async function request<T>(
    path: string,
    options: { allowNotFound?: boolean } = {},
  ): Promise<T | null> {
    const response = await fetcher(`${apiBaseUrl.replace(/\/+$/, "")}${path}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (response.status === 404 && options.allowNotFound) {
      return null;
    }

    if (!response.ok) {
      throw new Error(
        `GitHub API request failed: ${response.status} ${await response.text()}`,
      );
    }

    if (response.status === 204) {
      return null;
    }

    return (await response.json()) as T;
  }

  const repoPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  return {
    async getIssue(issueNumber: number) {
      const issue = await request<GitHubIssueResponse>(
        `${repoPath}/issues/${issueNumber}`,
        { allowNotFound: true },
      );
      if (!issue || issue.pull_request) return null;
      return { body: issue.body ?? "", number: issue.number };
    },

    async findExecutionRequestIssue(requestId: string) {
      for (let page = 1; page <= 5; page += 1) {
        const issues = await request<GitHubIssueResponse[]>(
          `${repoPath}/issues?state=all&per_page=100&page=${page}`,
        );

        if (!issues?.length) {
          return null;
        }

        const issue = issues.find((candidate) => {
          if (candidate.pull_request) {
            return false;
          }

          const request = parseExecutionRequestEvidence(candidate.body ?? "");

          return request?.requestId === requestId;
        });

        if (issue) {
          return {
            body: issue.body ?? "",
            number: issue.number,
          };
        }
      }

      return null;
    },

    async listIssueComments(issueNumber: number) {
      const comments: GateIssueComment[] = [];

      for (let page = 1; page <= 5; page += 1) {
        const response = await request<GitHubIssueCommentResponse[]>(
          `${repoPath}/issues/${issueNumber}/comments?per_page=100&page=${page}`,
        );

        if (!response?.length) {
          break;
        }

        comments.push(
          ...response.map((comment) => ({
            author: comment.user?.login?.trim() ?? "",
            body: comment.body ?? "",
            createdAt: comment.created_at ?? "",
            updatedAt: comment.updated_at ?? "",
          })),
        );
      }

      return comments;
    },

    async getFile(path: string, ref?: string) {
      const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
      const response = await request<GitHubContentFileResponse>(
        `${repoPath}/contents/${encodePath(path)}${query}`,
        { allowNotFound: true },
      );

      if (!response) {
        return null;
      }

      if (response.encoding !== "base64" || !response.content) {
        throw new Error(`Unsupported GitHub file encoding for ${path}.`);
      }

      return {
        content: decodeBase64(response.content),
        path: response.path ?? path,
      };
    },

    async getRepositoryPermissionForUser(username: string) {
      const response = await request<GitHubRepositoryPermissionResponse>(
        `${repoPath}/collaborators/${encodeURIComponent(username)}/permission`,
        { allowNotFound: true },
      );

      if (!response) {
        return {
          permission: "none",
          roleName: "none",
          username,
        };
      }

      return {
        permission:
          normalizePermissionValue(response.permission) ??
          normalizePermissionValue(response.role_name) ??
          "none",
        roleName:
          normalizePermissionValue(response.role_name) ??
          normalizePermissionValue(response.permission) ??
          "none",
        username: response.user?.login?.trim() || username,
      };
    },

    async getTeamMembershipForUser({
      org,
      teamSlug,
      username,
    }: {
      org: string;
      teamSlug: string;
      username: string;
    }) {
      const response = await request<GitHubTeamMembershipResponse>(
        `/orgs/${encodeURIComponent(org)}/teams/${encodeURIComponent(
          teamSlug,
        )}/memberships/${encodeURIComponent(username)}`,
        { allowNotFound: true },
      );

      if (!response) {
        return null;
      }

      return {
        role: response.role ?? "",
        state: response.state ?? "",
      };
    },
  };
}

export function parseRepository(repository: string): GateRepositoryRef {
  const [owner, repo] = repository.split("/");

  if (!owner || !repo) {
    throw new Error("GITHUB_REPOSITORY must be in owner/repo form.");
  }

  return { owner, repo };
}

function encodePath(path: string): string {
  return path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function decodeBase64(value: string): string {
  return Buffer.from(value.replace(/\s/g, ""), "base64").toString("utf-8");
}

function normalizePermissionValue(value: string | null | undefined): string {
  const normalized = value?.trim().toLowerCase();

  if (!normalized) {
    return "";
  }

  return normalized;
}
