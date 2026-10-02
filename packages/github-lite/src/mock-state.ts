import {
  GitHubLiteApiError,
  type GitHubDirectoryEntry,
  type GitHubIssue,
  type GitHubLiteMockState,
  type GitHubRepository,
  type RepositoryPermission,
  type RepoRef,
} from "./github-types.js";
import {
  buildMockBatchDefinitionYaml,
  buildMockBatchWorkflowYaml,
  buildMockExecutionComments,
  buildMockExecutionIssue,
  createMockExecutionScenarios,
  buildMockRoleMappingYaml,
  buildMockWorkflowRuns,
} from "./mock-fixtures.js";

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
    pullRequestFiles: {},
    pullRequests: [
      {
        author: "developer",
        base: "main",
        body: "Register payment daily close batch.",
        createdAt: "2026-05-14T01:01:00.000Z",
        head: "batchplane/register/payment.daily-close-20260514010203",
        headSha: "mock-registration-head-sha",
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
    pullRequestFiles:
      overrides.pullRequestFiles ?? defaultState.pullRequestFiles,
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

export function replaceMockState(
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

export function assertMockRepository(
  state: GitHubLiteMockState,
  repo: RepoRef,
) {
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

export function assertMockIssueOrPullRequest(
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

export function findMockIssue(
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

export function resolveMockBranch(
  state: GitHubLiteMockState,
  ref = state.repository.defaultBranch,
): string {
  if (state.branches[ref]) {
    return ref;
  }

  const branch = Object.entries(state.branches).find(
    ([, sha]) => sha === ref,
  )?.[0];

  if (!branch) {
    throw new GitHubLiteApiError(
      `GitHub branch not found: ${ref}`,
      "not-found",
      404,
    );
  }

  return branch;
}

export function getMockDirectoryEntries(
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

export function ensureMockLabel(state: GitHubLiteMockState, name: string) {
  if (state.labels.some((label) => label.name === name)) {
    return;
  }

  state.labels.push({
    color: "58616C",
    name,
  });
}

export function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

export function batchPlaneLabel(name: string): string {
  return `batchplane:${name}`;
}

export function hasBatchPlaneLabel(labels: string[], name: string): boolean {
  return (
    labels.includes(batchPlaneLabel(name)) ||
    labels.includes(`batchtrail:${name}`)
  );
}

export function removeBatchPlaneLabel(
  labels: string[],
  name: string,
): string[] {
  return labels.filter(
    (label) =>
      label !== batchPlaneLabel(name) && label !== `batchtrail:${name}`,
  );
}

export function nextMockNumber(values: number[]): number {
  return Math.max(0, ...values) + 1;
}

export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
