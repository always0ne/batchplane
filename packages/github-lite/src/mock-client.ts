import {
  decodeBase64,
  encodeBase64,
  getByteLength,
  hasWorkflowDispatchTrigger,
  truncateTextByBytes,
} from "./github-http.js";
import {
  GitHubLiteApiError,
  type GitHubIssue,
  type GitHubIssueComment,
  type GitHubLabel,
  type GitHubLiteClient,
  type GitHubLiteMockState,
  type GitHubPullRequest,
  type MockGitHubLiteClient,
} from "./github-types.js";
import {
  applyMockExecutionCommentTransition,
  trackMockExecutionRequest,
} from "./mock-execution.js";
import {
  buildMockPullRequestFiles,
  buildMockWorkflowJobLog,
  buildMockWorkflowRunJobs,
} from "./mock-fixtures.js";
import {
  assertMockIssueOrPullRequest,
  assertMockRepository,
  cloneJson,
  ensureMockLabel,
  findMockIssue,
  getMockDirectoryEntries,
  nextMockNumber,
  replaceMockState,
  resolveMockBranch,
  uniqueStrings,
} from "./mock-state.js";
import { createGitHubLiteMockState } from "./mock-state.js";

export function createMockGitHubLiteClient(
  initialState = createGitHubLiteMockState(),
): MockGitHubLiteClient {
  const baselineState = cloneJson(initialState);
  const state = cloneJson(initialState);
  const client: GitHubLiteClient = {
    ...createMockRepositoryOperations(state),
    ...createMockIssueOperations(state),
    ...createMockPullRequestOperations(state),
    ...createMockWorkflowOperations(state),
    ...createMockRepositoryAccessOperations(state),
  };

  return Object.assign(client, {
    reset(nextState = baselineState) {
      replaceMockState(state, nextState);
    },
    state,
  });
}

function createMockIssueOperations(
  state: GitHubLiteMockState,
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
  return {
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

    async getIssue(params) {
      assertMockRepository(state, params);

      const issue = state.issues.find(
        (candidate) => candidate.number === params.issueNumber,
      );

      return issue ? cloneJson(issue) : null;
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
        updatedAt: new Date(0).toISOString(),
      };

      state.issueComments.push(comment);
      applyMockExecutionCommentTransition(state, comment);

      return cloneJson(comment);
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
  };
}

function createMockRepositoryOperations(
  state: GitHubLiteMockState,
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
  return {
    async createBranch(params) {
      assertMockRepository(state, params);

      if (state.branches[params.branch]) {
        throw new GitHubLiteApiError(
          `GitHub branch already exists: ${params.branch}`,
          "bad-request",
          422,
        );
      }

      const sourceBranch = Object.entries(state.branches).find(
        ([, sha]) => sha === params.sha,
      )?.[0];
      state.branches[params.branch] = params.sha;

      if (sourceBranch) {
        const inheritedFiles = state.files
          .filter((file) => file.branch === sourceBranch)
          .map((file) => ({
            ...cloneJson(file),
            branch: params.branch,
          }));

        state.files.push(...inheritedFiles);
      }
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
            contentBase64: encodeBase64(file.content),
            path: file.path,
            sha: file.sha,
          }
        : null;
    },

    async getRepository(params) {
      assertMockRepository(state, params);

      return cloneJson(state.repository);
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

      state.branches[params.branch] = `mock-branch-sha-${state.files.length}`;

      return { path: params.path, sha };
    },

    async deleteFile(params) {
      assertMockRepository(state, params);

      if (!state.branches[params.branch]) {
        throw new GitHubLiteApiError(
          `GitHub branch not found: ${params.branch}`,
          "not-found",
          404,
        );
      }

      const existingIndex = state.files.findIndex(
        (file) => file.branch === params.branch && file.path === params.path,
      );

      if (existingIndex < 0) {
        throw new GitHubLiteApiError(
          `GitHub file not found: ${params.path}`,
          "not-found",
          404,
        );
      }

      state.files.splice(existingIndex, 1);
      state.branches[params.branch] = `mock-branch-sha-${state.files.length}`;

      return { path: params.path };
    },
  };
}

function createMockPullRequestOperations(
  state: GitHubLiteMockState,
): Pick<
  GitHubLiteClient,
  | "createPullRequest"
  | "getPullRequest"
  | "listPullRequestFiles"
  | "listPullRequests"
  | "mergePullRequest"
  | "updatePullRequest"
> {
  return {
    async createPullRequest(params) {
      assertMockRepository(state, params);

      const pullNumber = nextMockNumber([
        ...state.issues.map((issue) => issue.number),
        ...state.pullRequests.map((pullRequest) => pullRequest.number),
      ]);
      const pullRequest: GitHubPullRequest = {
        author: state.currentUser.login,
        base: params.base,
        baseSha: state.branches[params.base],
        body: params.body,
        createdAt: new Date(0).toISOString(),
        head: params.head,
        headSha: state.branches[params.head],
        merged: false,
        number: pullNumber,
        state: "open",
        title: params.title,
        updatedAt: new Date(0).toISOString(),
        url: `${state.repository.url}/pull/${pullNumber}`,
      };

      state.pullRequests.push(pullRequest);
      state.pullRequestFiles[pullNumber] = buildMockPullRequestFiles(
        state,
        params.base,
        params.head,
      );

      return cloneJson(pullRequest);
    },

    async getPullRequest(params) {
      assertMockRepository(state, params);

      const pullRequest = state.pullRequests.find(
        (candidate) => candidate.number === params.pullNumber,
      );

      return pullRequest ? cloneJson(pullRequest) : null;
    },

    async updatePullRequest(params) {
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

      if (params.body !== undefined) {
        pullRequest.body = params.body;
      }

      if (params.title !== undefined) {
        pullRequest.title = params.title;
      }

      pullRequest.updatedAt = new Date(0).toISOString();
      return cloneJson(pullRequest);
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

    async listPullRequestFiles(params) {
      assertMockRepository(state, params);
      assertMockIssueOrPullRequest(state, params.pullNumber);

      return cloneJson(state.pullRequestFiles[params.pullNumber] ?? []);
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

      if (
        params.expectedHeadSha &&
        params.expectedHeadSha !== pullRequest.headSha
      ) {
        return {
          merged: false,
          message: "Pull request head SHA no longer matches.",
          sha: "",
        };
      }

      pullRequest.merged = true;
      pullRequest.state = "closed";
      pullRequest.mergeSha = String(params.pullNumber).padStart(40, "0");
      pullRequest.mergedAt = new Date().toISOString();

      const baseSnapshotSha = pullRequest.baseSha;
      if (baseSnapshotSha) {
        state.files.push(
          ...state.files
            .filter((file) => file.branch === pullRequest.base)
            .map((file) => ({ ...file, branch: baseSnapshotSha })),
        );
        state.branches[baseSnapshotSha] = baseSnapshotSha;
      }
      const headFiles = state.files.filter(
        (file) => file.branch === pullRequest.head,
      );
      state.files = state.files.filter(
        (file) =>
          file.branch !== pullRequest.base ||
          !headFiles.some((headFile) => headFile.path === file.path),
      );
      state.files.push(
        ...headFiles.map((file) => ({ ...file, branch: pullRequest.base })),
      );
      state.branches[pullRequest.base] = pullRequest.mergeSha;
      // A merge SHA is an immutable content address, not an alias for the
      // later-moving default branch. Historical revision verification and
      // restoration both need to read the merged snapshot by that SHA.
      state.files.push(
        ...state.files
          .filter((file) => file.branch === pullRequest.base)
          .map((file) => ({ ...file, branch: pullRequest.mergeSha! })),
      );
      state.branches[pullRequest.mergeSha] = pullRequest.mergeSha;

      return {
        merged: true,
        message: "Pull Request successfully merged",
        sha: pullRequest.mergeSha,
      };
    },
  };
}

function createMockWorkflowOperations(
  state: GitHubLiteMockState,
): Pick<
  GitHubLiteClient,
  | "getWorkflow"
  | "getWorkflowJobLog"
  | "getWorkflowRun"
  | "listWorkflowRunJobs"
  | "listWorkflowRuns"
  | "listWorkflows"
> {
  return {
    async listWorkflows(params) {
      assertMockRepository(state, params);

      const workflows = state.workflows.filter((workflow) => {
        if (!params.dispatchableOnly) {
          return true;
        }

        const file = state.files.find(
          (candidate) =>
            candidate.branch === state.repository.defaultBranch &&
            candidate.path === workflow.path,
        );

        return file ? hasWorkflowDispatchTrigger(file.content) : false;
      });

      return workflows.map(cloneJson);
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

      const candidates = state.workflowRuns.filter(
        (candidate) => candidate.id === params.runId,
      );
      const run =
        params.runAttempt === undefined
          ? candidates.reduce<(typeof candidates)[number] | undefined>(
              (latest, candidate) =>
                !latest || candidate.runAttempt > latest.runAttempt
                  ? candidate
                  : latest,
              undefined,
            )
          : candidates.find(
              (candidate) => candidate.runAttempt === params.runAttempt,
            );

      return run ? cloneJson(run) : null;
    },

    async listWorkflowRunJobs(params) {
      assertMockRepository(state, params);

      return buildMockWorkflowRunJobs(state, params.runId).map(cloneJson);
    },

    async getWorkflowJobLog(params) {
      assertMockRepository(state, params);

      const run = state.workflowRuns.find((candidate) =>
        buildMockWorkflowRunJobs(state, candidate.id).some(
          (job) => job.id === params.jobId,
        ),
      );
      const job = run
        ? buildMockWorkflowRunJobs(state, run.id).find(
            (candidate) => candidate.id === params.jobId,
          )
        : undefined;

      if (!run || !job) {
        throw new GitHubLiteApiError(
          `GitHub workflow job not found: ${params.jobId}`,
          "not-found",
          404,
        );
      }

      const content = buildMockWorkflowJobLog(state.repository, run, job);
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
  };
}

function createMockRepositoryAccessOperations(
  state: GitHubLiteMockState,
): Pick<
  GitHubLiteClient,
  "getRepositoryPermissionForUser" | "getTeamMembershipForUser"
> {
  return {
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
  };
}
