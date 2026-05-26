import type {
  BatchDefinition,
  BatchPlaneRuntimePorts,
  ExecutionRun,
  ExecutionRunJob,
  ExecutionRunStatus,
  GateDecision,
  RepositoryFile,
  RepositoryIssue,
  RepositoryIssueComment,
  RepositoryPullRequest,
} from "@batchplane/domain";
import {
  createGitHubLiteClient,
  type GitHubIssue,
  type GitHubIssueComment,
  type GitHubLiteClient,
  type GitHubLiteClientOptions,
  type GitHubPullRequest,
  type GitHubWorkflowJob,
  type GitHubWorkflowRun,
} from "@batchplane/github-lite";

import { parseExecutionRequestDetail } from "../features/approvals/approval-model";
import { parseBatchDefinitionYaml } from "../features/registration/registration-model";
import type { GitHubSession } from "../features/lite-setup/github-session";
import {
  checkLiteInstallationStatus,
  createLiteInstallationPullRequest,
} from "../features/lite-setup/installation-model";
import {
  batchDefinitionDirectory,
  isBatchDefinitionFile,
} from "../features/batches/batch-repository";

export type GitHubLiteRuntimeOptions = {
  client?: GitHubLiteClient;
  fetcher?: GitHubLiteClientOptions["fetcher"];
};

export function createGitHubLiteRuntime(
  session: GitHubSession,
  options: GitHubLiteRuntimeOptions = {},
): BatchPlaneRuntimePorts {
  const client =
    options.client ??
    createGitHubLiteClient({
      token: session.token,
      fetcher: options.fetcher,
    });
  const repositoryRef = {
    owner: session.owner,
    repo: session.repo,
  };

  return {
    approvals: {
      async approveExecution({ body, issueNumber }) {
        await client.createIssueComment({
          ...repositoryRef,
          body,
          issueNumber,
        });
      },

      async approveRegistration({ body, commitTitle, pullNumber }) {
        await client.createIssueComment({
          ...repositoryRef,
          body,
          issueNumber: pullNumber,
        });

        return client.mergePullRequest({
          ...repositoryRef,
          commitTitle,
          mergeMethod: "squash",
          pullNumber,
        });
      },

      async listExecutionRequestIssues({ state = "open" } = {}) {
        const issues = await client.listIssues({
          ...repositoryRef,
          state,
        });

        return issues.map(toRepositoryIssue);
      },

      async listExecutionRequestComments({ issueNumber }) {
        const comments = await client.listIssueComments({
          ...repositoryRef,
          issueNumber,
        });

        return comments.map(toRepositoryIssueComment);
      },

      async listRegistrationRequests({ baseBranch, state = "open" }) {
        const pullRequests = await client.listPullRequests({
          ...repositoryRef,
          base: baseBranch,
          state,
        });

        return pullRequests.map(toRepositoryPullRequest);
      },

      async readRegistrationRequestFile({ path, ref }) {
        const file = await client.getFile({
          ...repositoryRef,
          path,
          ref,
        });

        return file ? toRepositoryFile(file.path, file.content, ref) : null;
      },

      async rejectExecution({ body, issueNumber }) {
        await client.createIssueComment({
          ...repositoryRef,
          body,
          issueNumber,
        });
        await client.closeIssue({ ...repositoryRef, issueNumber });
      },

      async rejectRegistration({ body, pullNumber }) {
        await client.createIssueComment({
          ...repositoryRef,
          body,
          issueNumber: pullNumber,
        });
        await client.closeIssue({
          ...repositoryRef,
          issueNumber: pullNumber,
        });
      },
    },

    audit: {
      async listAuditTimeline() {
        return [];
      },
    },

    batches: {
      async listBatchDefinitions({ ref }) {
        const entries = await client.getDirectory({
          ...repositoryRef,
          path: batchDefinitionDirectory,
          ref,
        });

        if (!entries) {
          return [];
        }

        const files = entries.filter(isBatchDefinitionFile);
        const definitions = await Promise.all(
          files.map(async (entry) => {
            const file = await client.getFile({
              ...repositoryRef,
              path: entry.path,
              ref,
            });

            return file ? parseBatchDefinitionYaml(file.content) : null;
          }),
        );

        return definitions
          .filter(isLoadedBatchDefinition)
          .sort((left, right) => left.batchId.localeCompare(right.batchId));
      },
    },

    executions: {
      async createExecutionRequest({ body, labels, title }) {
        const issue = await client.createIssue({
          ...repositoryRef,
          body,
          labels,
          title,
        });

        return toRepositoryIssue(issue);
      },

      async getExecutionRun({ runId }) {
        const numericRunId = Number(runId);

        if (!Number.isInteger(numericRunId) || numericRunId <= 0) {
          return null;
        }

        const run = await client.getWorkflowRun({
          ...repositoryRef,
          runId: numericRunId,
        });

        if (!run) {
          return null;
        }

        const [jobs, requests] = await Promise.all([
          client.listWorkflowRunJobs({
            ...repositoryRef,
            runId: numericRunId,
          }),
          loadExecutionApprovalRequests(client, repositoryRef),
        ]);
        const request = findExecutionRequestForRun(run, requests);

        return toExecutionRun(run, {
          jobs,
          request,
          workflow: await findWorkflowForRun(client, repositoryRef, run),
        });
      },

      async listExecutionRuns({
        batchId,
        limit = 20,
        requestId,
        workflowPath,
      } = {}) {
        const [runs, workflows, requests] = await Promise.all([
          client.listWorkflowRuns({
            ...repositoryRef,
            event: "workflow_dispatch",
            perPage: limit,
          }),
          client.listWorkflows(repositoryRef),
          loadExecutionApprovalRequests(client, repositoryRef),
        ]);
        const workflowById = new Map(
          workflows.map((workflow) => [workflow.id, workflow]),
        );

        return runs
          .map((run) => {
            const request = findExecutionRequestForRun(run, requests);

            return toExecutionRun(run, {
              request,
              workflow: workflowById.get(run.workflowId),
            });
          })
          .filter((run) => !batchId || run.batchId === batchId)
          .filter((run) => !requestId || run.requestId === requestId)
          .filter((run) => !workflowPath || run.workflowPath === workflowPath)
          .slice(0, limit);
      },
    },

    registration: {
      async checkRegistrationTargets({
        baseBranch,
        batchDefinitionPath,
        workflowPath,
      }) {
        const [batchDefinitionFile, workflowFile] = await Promise.all([
          client.getFile({
            ...repositoryRef,
            path: batchDefinitionPath,
            ref: baseBranch,
          }),
          client.getFile({
            ...repositoryRef,
            path: workflowPath,
            ref: baseBranch,
          }),
        ]);

        return {
          batchDefinitionExists: Boolean(batchDefinitionFile),
          workflowExists: Boolean(workflowFile),
        };
      },

      async createRegistrationPullRequest({
        artifact,
        baseBranch,
        batchDefinitionPath,
        batchDefinitionYaml,
        body,
        branch,
        title,
        workflowPath,
        workflowYaml,
      }) {
        const baseSha = await client.getBranchHeadSha({
          ...repositoryRef,
          branch: baseBranch,
        });

        await client.createBranch({ ...repositoryRef, branch, sha: baseSha });
        await client.putFile({
          ...repositoryRef,
          branch,
          content: batchDefinitionYaml,
          message: title,
          path: batchDefinitionPath,
        });
        await client.putFile({
          ...repositoryRef,
          branch,
          content: workflowYaml,
          message: title,
          path: workflowPath,
        });

        if (artifact) {
          await client.putFile({
            ...repositoryRef,
            branch,
            content: artifact.content,
            encoding: artifact.encoding,
            message: title,
            path: artifact.path,
          });
        }

        const pullRequest = await client.createPullRequest({
          ...repositoryRef,
          base: baseBranch,
          body,
          head: branch,
          title,
        });

        return toRepositoryPullRequest(pullRequest);
      },
    },

    settings: {
      async checkInstallationStatus({ ref }) {
        return checkLiteInstallationStatus({
          client,
          ref,
          repo: repositoryRef,
        });
      },

      async createInstallationPullRequest({ defaultBranch }) {
        const result = await createLiteInstallationPullRequest({
          client,
          defaultBranch,
          repo: repositoryRef,
        });

        return {
          pullRequest: toRepositoryPullRequest(result.pullRequest),
          status: result.status,
        };
      },

      async getCurrentUser() {
        return client.getCurrentUser();
      },

      async getRepository() {
        return client.getRepository(repositoryRef);
      },
    },
  };
}

function toRepositoryIssue(issue: GitHubIssue): RepositoryIssue {
  return {
    ...issue,
    state: issue.state === "all" ? "open" : issue.state,
  };
}

type RuntimeRepositoryRef = {
  owner: string;
  repo: string;
};

type ExecutionRequestForRun = NonNullable<
  ReturnType<typeof parseExecutionRequestDetail>
>;

async function loadExecutionApprovalRequests(
  client: GitHubLiteClient,
  repositoryRef: RuntimeRepositoryRef,
): Promise<ExecutionRequestForRun[]> {
  const issues = await client.listIssues({
    ...repositoryRef,
    state: "all",
  });
  const parsedRequests = await Promise.all(
    issues.map(async (issue) => {
      const comments = await client.listIssueComments({
        ...repositoryRef,
        issueNumber: issue.number,
      });

      return parseExecutionRequestDetail(
        toRepositoryIssue(issue),
        comments.map(toRepositoryIssueComment),
      );
    }),
  );

  return parsedRequests.filter(
    (request): request is ExecutionRequestForRun => request !== null,
  );
}

async function findWorkflowForRun(
  client: GitHubLiteClient,
  repositoryRef: RuntimeRepositoryRef,
  run: GitHubWorkflowRun,
) {
  return (
    (await client.getWorkflow({
      ...repositoryRef,
      workflowId: run.workflowId,
    })) ?? undefined
  );
}

function findExecutionRequestForRun(
  run: GitHubWorkflowRun,
  requests: ExecutionRequestForRun[],
): ExecutionRequestForRun | undefined {
  const explicitRequestId = run.requestId ?? parseRequestIdFromRun(run);
  const explicitBatchId = run.batchId ?? parseBatchIdFromRun(run);

  return requests.find((request) => {
    if (explicitRequestId) {
      return request.requestId === explicitRequestId;
    }

    return (
      Boolean(explicitBatchId) &&
      request.batchId === explicitBatchId &&
      request.status !== "REQUESTED"
    );
  });
}

function toExecutionRun(
  run: GitHubWorkflowRun,
  {
    jobs = [],
    request,
    workflow,
  }: {
    jobs?: GitHubWorkflowJob[];
    request?: ExecutionRequestForRun;
    workflow?: { name: string; path: string };
  } = {},
): ExecutionRun {
  const gateDecision = request?.gateDecision
    ? toGateDecision(request.gateDecision)
    : undefined;
  const mappedJobs = jobs.map(toExecutionRunJob);

  return {
    actor: run.actor,
    batchId: run.batchId ?? request?.batchId ?? parseBatchIdFromRun(run) ?? "",
    ...(run.updatedAt ? { completedAt: run.updatedAt } : {}),
    event: run.event,
    ...(gateDecision ? { gateDecision } : {}),
    jobs: mappedJobs,
    requestId:
      run.requestId ?? request?.requestId ?? parseRequestIdFromRun(run) ?? "",
    runAttempt: run.runAttempt,
    runId: String(run.id),
    ...(run.startedAt ? { startedAt: run.startedAt } : {}),
    status: toExecutionRunStatus(run, gateDecision, mappedJobs),
    workflowName: workflow?.name ?? run.name,
    workflowPath: workflow?.path ?? run.workflowPath,
    workflowRunId: String(run.id),
    workflowRunUrl: run.url,
  };
}

function toExecutionRunJob(job: GitHubWorkflowJob): ExecutionRunJob {
  return {
    ...(job.completedAt ? { completedAt: job.completedAt } : {}),
    ...(job.conclusion ? { conclusion: job.conclusion } : {}),
    jobId: String(job.id),
    name: job.name,
    ...(job.startedAt ? { startedAt: job.startedAt } : {}),
    status: toExecutionRunStatus(job),
    ...(job.url ? { url: job.url } : {}),
  };
}

function toGateDecision(
  gateDecision: ExecutionRequestForRun["gateDecision"],
): GateDecision | undefined {
  if (!gateDecision) {
    return undefined;
  }

  return {
    allowed: gateDecision.allowed,
    decidedAt: gateDecision.createdAt,
    message: gateDecision.allowed
      ? "Gate allowed execution."
      : "Gate blocked execution.",
    reasonCode: gateDecision.reasonCode,
  };
}

function toExecutionRunStatus(
  run: Pick<GitHubWorkflowRun | GitHubWorkflowJob, "conclusion" | "status">,
  gateDecision?: GateDecision,
  jobs: ExecutionRunJob[] = [],
): ExecutionRunStatus {
  if (gateDecision?.allowed === false || hasBlockedGateJob(jobs)) {
    return "BLOCKED";
  }

  if (run.status === "queued") {
    return "QUEUED";
  }

  if (run.status === "in_progress") {
    return "RUNNING";
  }

  switch (run.conclusion) {
    case "success":
      return "SUCCEEDED";
    case "cancelled":
    case "skipped":
      return "CANCELED";
    case "failure":
    case "timed_out":
    case "action_required":
      return "FAILED";
    default:
      return "RUNNING";
  }
}

function hasBlockedGateJob(jobs: ExecutionRunJob[]): boolean {
  return jobs.some(
    (job) =>
      job.name.toLowerCase().includes("gate") &&
      job.status === "FAILED" &&
      jobs.some(
        (candidate) =>
          candidate.name !== job.name && candidate.status === "CANCELED",
      ),
  );
}

function parseRequestIdFromRun(run: GitHubWorkflowRun): string | undefined {
  const text = [run.displayTitle, run.name].filter(Boolean).join(" ");
  const match = text.match(/\bbtr-\d{14}-[a-z0-9_.-]+-[a-f0-9]{8}\b/u);

  return match?.[0];
}

function parseBatchIdFromRun(run: GitHubWorkflowRun): string | undefined {
  const requestId = parseRequestIdFromRun(run);

  if (requestId) {
    const match = requestId.match(/^btr-\d{14}-(.+)-[a-f0-9]{8}$/u);
    return match?.[1];
  }

  return run.batchId;
}

function toRepositoryIssueComment(
  comment: GitHubIssueComment,
): RepositoryIssueComment {
  return comment;
}

function toRepositoryPullRequest(
  pullRequest: GitHubPullRequest,
): RepositoryPullRequest {
  return pullRequest;
}

function toRepositoryFile(
  path: string,
  content: string,
  ref: string,
): RepositoryFile {
  return {
    content,
    path,
    ref,
  };
}

function isLoadedBatchDefinition(
  definition: BatchDefinition | null,
): definition is BatchDefinition {
  return Boolean(definition?.batchId);
}
