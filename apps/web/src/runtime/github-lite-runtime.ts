import type {
  AuditTimelineItem,
  BatchDefinition,
  BatchPlaneRuntimePorts,
  ExecutionRun,
  ExecutionRunJob,
  ExecutionRunJobLog,
  ExecutionRunStatus,
  FailureFollowUp,
  GateDecision,
  RepositoryFile,
  RepositoryIssue,
  RepositoryIssueComment,
  RepositoryPullRequest,
  WorkspacePolicy,
} from "@batchplane/domain";
import {
  defaultWorkspacePolicy,
  formatYamlDiagnostics,
  parseYamlDocument,
  validateWorkspacePolicyFile,
} from "@batchplane/domain";
import {
  createGitHubLiteClient,
  type GitHubIssue,
  type GitHubIssueComment,
  type GitHubLiteClient,
  type GitHubLiteClientOptions,
  type GitHubPullRequest,
  type GitHubWorkflowJob,
  type GitHubWorkflowJobLog,
  type GitHubWorkflowRun,
} from "@batchplane/github-lite";

import { parseExecutionRequestDetail } from "../features/approvals/approval-model";
import {
  deriveRegistrationReviewState,
  parseRegistrationApprovalDecision,
  parseRegistrationRequestSummary,
} from "../features/approvals/registration-approval-model";
import { parseBatchDefinitionYaml } from "../features/registration/registration-model";
import type { GitHubSession } from "../features/lite-setup/github-session";
import {
  checkLiteInstallationStatus,
  createLiteInstallationPullRequest,
  createWorkspacePolicyPullRequest as createWorkspacePolicyChangePullRequest,
  liteWorkspacePolicyPath,
} from "../features/lite-setup/installation-model";
import {
  batchDefinitionDirectory,
  isBatchDefinitionFile,
} from "../features/batches/batch-repository";
import {
  buildFailureFollowUpComment,
  parseFailureFollowUps,
} from "../features/execution-requests/failure-follow-up-model";

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
      async listAuditTimeline({ limit = 50 } = {}) {
        const [issues, pullRequests, workflowRuns, workflows] =
          await Promise.all([
            client.listIssues({
              ...repositoryRef,
              state: "all",
            }),
            client.listPullRequests({
              ...repositoryRef,
              state: "all",
            }),
            client.listWorkflowRuns({
              ...repositoryRef,
              event: "workflow_dispatch",
              perPage: Math.max(limit, 20),
            }),
            client.listWorkflows({
              ...repositoryRef,
              dispatchableOnly: true,
            }),
          ]);
        const [issueComments, pullRequestComments] = await Promise.all([
          Promise.all(
            issues.map((issue) =>
              client.listIssueComments({
                ...repositoryRef,
                issueNumber: issue.number,
              }),
            ),
          ),
          Promise.all(
            pullRequests.map((pullRequest) =>
              client.listIssueComments({
                ...repositoryRef,
                issueNumber: pullRequest.number,
              }),
            ),
          ),
        ]);
        const workflowById = new Map(
          workflows.map((workflow) => [workflow.id, workflow]),
        );

        return [
          ...pullRequests.flatMap((pullRequest, index) =>
            toRegistrationAuditItems(
              toRepositoryPullRequest(pullRequest),
              (pullRequestComments[index] ?? []).map(toRepositoryIssueComment),
            ),
          ),
          ...issues.flatMap((issue, index) => {
            const mappedIssue = toRepositoryIssue(issue);
            const comments = (issueComments[index] ?? []).map(
              toRepositoryIssueComment,
            );
            const request = parseExecutionRequestDetail(mappedIssue, comments);

            return request ? toExecutionRequestAuditItems(request) : [];
          }),
          ...workflowRuns.map((run) => {
            const workflow = workflowById.get(run.workflowId);

            return toWorkflowRunAuditItem(run, workflow?.path);
          }),
        ]
          .sort(compareAuditItemsDesc)
          .slice(0, limit);
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
      async createFailureFollowUp({
        actionTaken,
        explanation,
        owner,
        runId,
        status,
      }) {
        const run = await loadWorkflowRunForFailureFollowUp({
          client,
          repositoryRef,
          runId,
        });
        const requests = await loadExecutionApprovalRequests(
          client,
          repositoryRef,
        );
        const request = findExecutionRequestForRun(
          run,
          requests,
          run.workflowPath,
        );

        if (!request) {
          throw new Error(
            "Execution request evidence was not found for this run.",
          );
        }

        const user = await client.getCurrentUser();
        const followUp: FailureFollowUp = {
          actionTaken,
          author: user.login,
          batchId:
            run.batchId ??
            request.batchId ??
            parseBatchIdFromRun(run, run.workflowPath) ??
            "",
          createdAt: new Date().toISOString(),
          explanation,
          followUpId: createFailureFollowUpId(run.id),
          owner,
          requestId:
            run.requestId ??
            request.requestId ??
            parseRequestIdFromRun(run) ??
            "",
          runId: String(run.id),
          status,
        };
        const comment = await client.createIssueComment({
          ...repositoryRef,
          body: buildFailureFollowUpComment(followUp),
          issueNumber: request.issue.number,
        });

        return (
          parseFailureFollowUps([
            {
              author: user.login,
              body: comment.body,
              createdAt: followUp.createdAt,
              id: comment.id,
              issueNumber: request.issue.number,
            },
          ])[0] ?? followUp
        );
      },

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

        const [jobs, requests, workflow] = await Promise.all([
          client.listWorkflowRunJobs({
            ...repositoryRef,
            runId: numericRunId,
          }),
          loadExecutionApprovalRequests(client, repositoryRef),
          findWorkflowForRun(client, repositoryRef, run),
        ]);
        const request = findExecutionRequestForRun(
          run,
          requests,
          workflow?.path,
        );

        return toExecutionRun(run, {
          jobs,
          request,
          workflow,
        });
      },

      async getExecutionRunJobLog({ jobId }) {
        const numericJobId = Number(jobId);

        if (!Number.isInteger(numericJobId) || numericJobId <= 0) {
          throw new Error("Execution run job ID must be a positive number.");
        }

        return toExecutionRunJobLog(
          await client.getWorkflowJobLog({
            ...repositoryRef,
            jobId: numericJobId,
          }),
        );
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
          client.listWorkflows({
            ...repositoryRef,
            dispatchableOnly: true,
          }),
          loadExecutionApprovalRequests(client, repositoryRef),
        ]);
        const workflowById = new Map(
          workflows.map((workflow) => [workflow.id, workflow]),
        );
        const jobsByRunId = await loadWorkflowRunJobsForList({
          client,
          repositoryRef,
          runs,
        });

        return runs
          .map((run) => {
            const workflow = workflowById.get(run.workflowId);
            const request = findExecutionRequestForRun(
              run,
              requests,
              workflow?.path,
            );

            return toExecutionRun(run, {
              jobs: jobsByRunId.get(run.id),
              request,
              workflow,
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

      async createWorkspacePolicyPullRequest({ defaultBranch, policy }) {
        const pullRequest = await createWorkspacePolicyChangePullRequest({
          client,
          defaultBranch,
          policy,
          repo: repositoryRef,
        });

        return toRepositoryPullRequest(pullRequest);
      },

      async getCurrentUser() {
        return client.getCurrentUser();
      },

      async getRepository() {
        return client.getRepository(repositoryRef);
      },

      async getWorkspacePolicy({ ref } = {}) {
        const repository = await client.getRepository(repositoryRef);
        const file = await client.getFile({
          ...repositoryRef,
          path: liteWorkspacePolicyPath,
          ref: ref || repository.defaultBranch,
        });

        if (!file) {
          return defaultWorkspacePolicy;
        }

        return parseWorkspacePolicyFile(file.content);
      },
    },
  };
}

function parseWorkspacePolicyFile(content: string): WorkspacePolicy {
  const parsed = parseYamlDocument(content);

  if (!parsed.ok) {
    throw new Error(formatYamlDiagnostics(parsed.diagnostics));
  }

  const validated = validateWorkspacePolicyFile(parsed.value);

  if (!validated.ok) {
    throw new Error(
      validated.diagnostics
        .map((diagnostic) => `${diagnostic.field}: ${diagnostic.message}`)
        .join("; "),
    );
  }

  return validated.value.spec;
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

function toRegistrationAuditItems(
  pullRequest: RepositoryPullRequest,
  comments: RepositoryIssueComment[],
): AuditTimelineItem[] {
  if (!isRegistrationAuditPullRequest(pullRequest)) {
    return [];
  }

  const summary = parseRegistrationRequestSummary(pullRequest);
  const decision = parseRegistrationApprovalDecision(comments);
  const reviewState = deriveRegistrationReviewState(pullRequest, decision);
  const batchId = summary.batchId || pullRequest.title;
  const items: AuditTimelineItem[] = [
    {
      actor: pullRequest.author,
      itemId: `registration-pr-${pullRequest.number}`,
      occurredAt: pullRequest.createdAt ?? pullRequest.updatedAt ?? "",
      sourceUrl: pullRequest.url,
      subjectId: batchId,
      subjectType: "BATCH",
      summary: `Registration request #${pullRequest.number}: ${pullRequest.title}`,
      type: pullRequest.merged ? "BATCH_REGISTERED" : "BATCH_CHANGED",
      metadata: compactAuditMetadata({
        batchId,
        pullNumber: pullRequest.number,
        reviewState,
      }),
    },
  ];

  if (decision) {
    items.push({
      actor: decision.actor,
      itemId: `registration-pr-${pullRequest.number}-decision-${decision.commentId}`,
      occurredAt: decision.decidedAt,
      sourceUrl: pullRequest.url,
      subjectId: batchId,
      subjectType: "BATCH",
      summary: `Registration ${decision.decision.toLowerCase()} for ${batchId}`,
      type: "APPROVAL_RECORDED",
      metadata: compactAuditMetadata({
        batchId,
        decision: decision.decision,
        pullNumber: pullRequest.number,
        reviewState,
      }),
    });
  }

  return items;
}

function isRegistrationAuditPullRequest(
  pullRequest: RepositoryPullRequest,
): boolean {
  return (
    pullRequest.head.startsWith("batchplane/register/") ||
    pullRequest.head.startsWith("batchtrail/register/") ||
    pullRequest.title.startsWith("Register batch ")
  );
}

function toExecutionRequestAuditItems(
  request: ExecutionRequestForRun,
): AuditTimelineItem[] {
  const items: AuditTimelineItem[] = [
    {
      actor: request.requestedBy,
      itemId: `execution-request-${request.requestId}`,
      occurredAt: request.requestedAt || request.issue.createdAt || "",
      sourceUrl: request.issue.url,
      subjectId: request.requestId,
      subjectType: "EXECUTION_REQUEST",
      summary: `Execution requested for ${request.batchId}`,
      type: "EXECUTION_REQUESTED",
      metadata: compactAuditMetadata({
        batchId: request.batchId,
        issueNumber: request.issue.number,
        requestId: request.requestId,
        status: request.status,
      }),
    },
  ];

  if (request.approvalDecision) {
    items.push({
      actor: request.approvalDecision.actor,
      itemId: `execution-request-${request.requestId}-approval`,
      occurredAt: request.approvalDecision.decidedAt,
      sourceUrl: request.issue.url,
      subjectId: request.requestId,
      subjectType: "EXECUTION_REQUEST",
      summary: `Execution ${request.approvalDecision.decision.toLowerCase()} for ${request.batchId}`,
      type: "APPROVAL_RECORDED",
      metadata: compactAuditMetadata({
        batchId: request.batchId,
        decision: request.approvalDecision.decision,
        issueNumber: request.issue.number,
        requestId: request.requestId,
      }),
    });
  }

  if (request.dispatcherStatus) {
    items.push({
      actor: request.dispatcherStatus.actor,
      itemId: `execution-request-${request.requestId}-dispatch-${request.dispatcherStatus.status}`,
      occurredAt: request.dispatcherStatus.createdAt,
      sourceUrl: request.issue.url,
      subjectId: request.requestId,
      subjectType: "EXECUTION_REQUEST",
      summary: `Dispatcher recorded ${request.dispatcherStatus.status.toLowerCase()} for ${request.batchId}`,
      type: "DISPATCH_RECORDED",
      metadata: compactAuditMetadata({
        batchId: request.batchId,
        issueNumber: request.issue.number,
        requestId: request.requestId,
        status: request.dispatcherStatus.status,
      }),
    });
  }

  if (request.gateDecision) {
    items.push({
      actor: request.gateDecision.actor,
      itemId: `execution-request-${request.requestId}-gate`,
      occurredAt: request.gateDecision.createdAt,
      sourceUrl: request.issue.url,
      subjectId: request.requestId,
      subjectType: "EXECUTION_REQUEST",
      summary: `Gate ${request.gateDecision.allowed ? "allowed" : "blocked"} ${request.batchId}`,
      type: "GATE_DECIDED",
      metadata: compactAuditMetadata({
        batchId: request.batchId,
        gateResult: request.gateDecision.allowed ? "ALLOWED" : "BLOCKED",
        issueNumber: request.issue.number,
        reasonCode: request.gateDecision.reasonCode,
        requestId: request.requestId,
      }),
    });
  }

  return items;
}

function toWorkflowRunAuditItem(
  run: GitHubWorkflowRun,
  workflowPath?: string,
): AuditTimelineItem {
  const requestId = run.requestId ?? parseRequestIdFromRun(run) ?? "";
  const batchId = run.batchId ?? parseBatchIdFromRun(run, workflowPath) ?? "";

  return {
    actor: run.actor,
    itemId: `workflow-run-${run.id}`,
    occurredAt: run.updatedAt || run.startedAt || run.createdAt || "",
    sourceUrl: run.url,
    subjectId: String(run.id),
    subjectType: "EXECUTION_RUN",
    summary: `Workflow run ${run.conclusion ?? run.status} for ${batchId || run.name}`,
    type: "RUN_COMPLETED",
    metadata: compactAuditMetadata({
      batchId,
      conclusion: run.conclusion ?? "",
      requestId,
      runId: run.id,
      status: run.status,
      workflowPath: workflowPath ?? run.workflowPath ?? "",
    }),
  };
}

function compactAuditMetadata(
  metadata: Record<string, string | number | boolean | undefined>,
): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(metadata).filter(
      (entry): entry is [string, string | number | boolean] =>
        entry[1] !== undefined && entry[1] !== "",
    ),
  );
}

function compareAuditItemsDesc(
  left: AuditTimelineItem,
  right: AuditTimelineItem,
): number {
  return auditTimestamp(right.occurredAt) - auditTimestamp(left.occurredAt);
}

function auditTimestamp(value: string): number {
  const timestamp = Date.parse(value);

  return Number.isNaN(timestamp) ? 0 : timestamp;
}

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

async function loadWorkflowRunJobsForList({
  client,
  repositoryRef,
  runs,
}: {
  client: GitHubLiteClient;
  repositoryRef: RuntimeRepositoryRef;
  runs: GitHubWorkflowRun[];
}): Promise<Map<number, GitHubWorkflowJob[]>> {
  const jobsByRunId = await Promise.all(
    runs.filter(shouldLoadJobsForRunList).map(async (run) => {
      const jobs = await client.listWorkflowRunJobs({
        ...repositoryRef,
        runId: run.id,
      });

      return [run.id, jobs] as const;
    }),
  );

  return new Map(jobsByRunId);
}

function shouldLoadJobsForRunList(run: GitHubWorkflowRun): boolean {
  return run.status === "completed" && run.conclusion !== "success";
}

function findExecutionRequestForRun(
  run: GitHubWorkflowRun,
  requests: ExecutionRequestForRun[],
  workflowPath?: string,
): ExecutionRequestForRun | undefined {
  const explicitRequestId = run.requestId ?? parseRequestIdFromRun(run);
  const explicitBatchId = run.batchId ?? parseBatchIdFromRun(run, workflowPath);

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
  const inferredBatchId = parseBatchIdFromRun(run, workflow?.path);

  return {
    actor: run.actor,
    batchId: run.batchId ?? request?.batchId ?? inferredBatchId ?? "",
    ...(run.updatedAt ? { completedAt: run.updatedAt } : {}),
    event: run.event,
    ...(gateDecision ? { gateDecision } : {}),
    failureFollowUps: request
      ? parseFailureFollowUps(request.comments).filter(
          (followUp) => followUp.runId === String(run.id),
        )
      : [],
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
    ...(request
      ? {
          requestIssueNumber: request.issue.number,
          requestIssueUrl: request.issue.url,
        }
      : {}),
  };
}

async function loadWorkflowRunForFailureFollowUp({
  client,
  repositoryRef,
  runId,
}: {
  client: GitHubLiteClient;
  repositoryRef: RuntimeRepositoryRef;
  runId: string;
}): Promise<GitHubWorkflowRun> {
  const numericRunId = Number(runId);

  if (!Number.isInteger(numericRunId) || numericRunId <= 0) {
    throw new Error("Execution run ID must be a positive number.");
  }

  const run = await client.getWorkflowRun({
    ...repositoryRef,
    runId: numericRunId,
  });

  if (!run) {
    throw new Error("Execution run was not found.");
  }

  return run;
}

function createFailureFollowUpId(runId: number): string {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(16).slice(2, 10).padEnd(8, "0");

  return `ffu-${runId}-${suffix}`;
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

function toExecutionRunJobLog(log: GitHubWorkflowJobLog): ExecutionRunJobLog {
  return {
    content: log.content,
    jobId: String(log.jobId),
    sizeBytes: log.sizeBytes,
    truncated: log.truncated,
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
  const gateJobFailed = jobs.some(
    (job) => isGateJob(job) && job.status === "FAILED",
  );
  const businessJobFailed = jobs.some(
    (job) => !isGateJob(job) && job.status === "FAILED",
  );

  return gateJobFailed && !businessJobFailed;
}

function isGateJob(job: ExecutionRunJob): boolean {
  return job.name.toLowerCase().includes("gate");
}

function parseRequestIdFromRun(run: GitHubWorkflowRun): string | undefined {
  const text = [run.displayTitle, run.name].filter(Boolean).join(" ");
  const match = text.match(/\bbtr-\d{14}-[a-z0-9_.-]+-[a-f0-9]{8}\b/u);

  return match?.[0];
}

function parseBatchIdFromRun(
  run: GitHubWorkflowRun,
  workflowPath?: string,
): string | undefined {
  const requestId = parseRequestIdFromRun(run);

  if (requestId) {
    const match = requestId.match(/^btr-\d{14}-(.+)-[a-f0-9]{8}$/u);
    if (match?.[1]) {
      return match[1];
    }
  }

  return (
    run.batchId ??
    parseBatchIdFromWorkflowPath(workflowPath) ??
    parseBatchIdFromWorkflowPath(run.workflowPath)
  );
}

function parseBatchIdFromWorkflowPath(
  workflowPath: string | undefined,
): string | undefined {
  const fileName = workflowPath?.split("/").pop();
  const match = fileName?.match(/^(.+)\.ya?ml$/u);
  const batchId = match?.[1];

  if (!batchId || isGenericWorkflowFileName(batchId)) {
    return undefined;
  }

  return batchId;
}

function isGenericWorkflowFileName(fileName: string): boolean {
  return [
    "batchplane-dispatcher",
    "batchplane-sample-target",
    "batchtrail-dispatcher",
    "batchtrail-sample-target",
  ].includes(fileName.toLowerCase());
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
