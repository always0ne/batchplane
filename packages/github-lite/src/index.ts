export type RepoRef = {
  owner: string;
  repo: string;
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
  getCurrentUser(): Promise<{ login: string }>;
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
