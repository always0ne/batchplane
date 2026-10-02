import type { DispatcherDispatchPlan } from "./dispatcher-types.js";

export const dispatcherLabels = {
  dispatched: {
    color: "16A34A",
    description: "BatchPlane dispatcher completed workflow dispatch",
    name: "batchplane:dispatched",
  },
  dispatchFailed: {
    color: "DC2626",
    description: "BatchPlane dispatcher failed workflow dispatch",
    name: "batchplane:dispatch-failed",
  },
  dispatching: {
    color: "2563EB",
    description: "BatchPlane dispatcher is processing this execution request",
    name: "batchplane:dispatching",
  },
} as const;

type DispatcherGitHubClientOptions = {
  apiBaseUrl: string;
  fetcher: typeof fetch;
  owner: string;
  repo: string;
  token: string;
};

type GitHubIssueResponse = {
  body: string | null;
  labels?: Array<string | { name?: string }>;
};

type GitHubIssueCommentResponse = {
  body: string | null;
};

type DispatcherLabelDefinition = {
  color: string;
  description: string;
  name: string;
};

export function createDispatcherGitHubClient({
  apiBaseUrl,
  fetcher,
  owner,
  repo,
  token,
}: DispatcherGitHubClientOptions) {
  async function request<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T | null> {
    const response = await fetcher(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...init.headers,
      },
    });

    if (!response.ok) {
      throw new GitHubApiRequestError(
        `GitHub API request failed: ${response.status} ${await response.text()}`,
        response.status,
      );
    }

    if (response.status === 204) {
      return null;
    }

    return (await response.json()) as T;
  }

  const repoPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  return {
    async addIssueLabels(issueNumber: number, labels: string[]) {
      await request(`${repoPath}/issues/${issueNumber}/labels`, {
        body: JSON.stringify({ labels }),
        method: "POST",
      });
    },

    async createIssueComment(issueNumber: number, body: string) {
      await request(`${repoPath}/issues/${issueNumber}/comments`, {
        body: JSON.stringify({ body }),
        method: "POST",
      });
    },

    async ensureLabels(labels: DispatcherLabelDefinition[]) {
      for (const label of labels) {
        try {
          await request(`${repoPath}/labels`, {
            body: JSON.stringify(label),
            method: "POST",
          });
        } catch (error) {
          if (!isGitHubApiStatus(error, 422)) {
            throw error;
          }
        }
      }
    },

    async dispatchWorkflow(dispatchPlan: DispatcherDispatchPlan) {
      await request(
        `${repoPath}/actions/workflows/${encodeURIComponent(
          getWorkflowId(dispatchPlan.workflowPath),
        )}/dispatches`,
        {
          body: JSON.stringify({
            inputs: dispatchPlan.workflowInputs,
            ref: dispatchPlan.workflowRef,
          }),
          method: "POST",
        },
      );
    },

    async getIssue(issueNumber: number) {
      const issue = await request<GitHubIssueResponse>(
        `${repoPath}/issues/${issueNumber}`,
      );

      return {
        body: issue?.body ?? "",
        labels: (issue?.labels ?? [])
          .map((label) => (typeof label === "string" ? label : label.name))
          .filter((label): label is string => Boolean(label)),
      };
    },

    async getIssueComment(commentId: number) {
      const comment = await request<GitHubIssueCommentResponse>(
        `${repoPath}/issues/comments/${commentId}`,
      );

      return { body: comment?.body ?? "" };
    },

    async listIssueComments(issueNumber: number) {
      const comments: string[] = [];

      for (let page = 1; page <= 5; page += 1) {
        const response = await request<GitHubIssueCommentResponse[]>(
          `${repoPath}/issues/${issueNumber}/comments?per_page=100&page=${page}`,
        );

        if (!response?.length) {
          break;
        }

        comments.push(...response.map((comment) => comment.body ?? ""));
      }

      return comments;
    },

    async removeIssueLabel(issueNumber: number, label: string) {
      try {
        await request(
          `${repoPath}/issues/${issueNumber}/labels/${encodeURIComponent(label)}`,
          {
            method: "DELETE",
          },
        );
      } catch (error) {
        if (!isGitHubApiStatus(error, 404)) {
          throw error;
        }
      }
    },
  };
}

export type DispatcherGitHubClient = ReturnType<
  typeof createDispatcherGitHubClient
>;

function getWorkflowId(workflowPath: string): string {
  return workflowPath.replace(/^\.github\/workflows\//, "");
}

class GitHubApiRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "GitHubApiRequestError";
    this.status = status;
  }
}

function isGitHubApiStatus(error: unknown, status: number): boolean {
  return error instanceof GitHubApiRequestError && error.status === status;
}
