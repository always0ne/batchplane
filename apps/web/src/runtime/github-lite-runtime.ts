import type {
  AuditTimelineItem,
  BatchDefinition,
  BatchPlaneRuntimePorts,
  DeletedBatchArchiveResult,
  DeletedBatchArchiveSourceRequest,
  DeletedBatchArchiveUnavailableReason,
  ExecutionRun,
  ExecutionRunJob,
  ExecutionRunJobLog,
  ExecutionRunStatus,
  FailureFollowUp,
  FailureFollowUpReviewCapability,
  FailureFollowUpReviewDecision,
  GateDecision,
  GovernedChangeFilePreviewStatus,
  RepositoryFile,
  RepositoryIssue,
  RepositoryIssueComment,
  RepositoryPullRequest,
  RepositoryPullRequestFile,
  WorkspacePolicy,
} from "@batchplane/domain";
import {
  defaultWorkspacePolicy,
  formatYamlDiagnostics,
  isCanonicalBatchId,
  parseYamlDocument,
  validateWorkspacePolicyFile,
} from "@batchplane/domain";
import {
  createGitHubLiteClient,
  getBatchDefinitionPath,
  hasAuthoritativeGovernedChangeRequest,
  parseBatchDefinitionYaml as parseGovernedBatchDefinitionYaml,
  parseGovernedChangeRequestEvidence,
  type GitHubIssue,
  type GitHubIssueComment,
  type GitHubFile,
  type GitHubLiteClient,
  type GitHubLiteClientOptions,
  type GitHubPullRequest,
  type GitHubPullRequestFile,
  type GitHubWorkflowJob,
  type GitHubWorkflowJobLog,
  type GitHubWorkflowRun,
} from "@batchplane/github-lite";
import { sha256BytesHex } from "@batchplane/digest";

import { parseExecutionRequestDetail } from "../features/approvals/approval-model";
import {
  deriveRegistrationReviewState,
  parseRegistrationApprovalDecision,
  parseRegistrationRequestSummary,
} from "../features/approvals/registration-approval-model";
import type { GitHubSession } from "../features/lite-setup/github-session";
import {
  checkLiteInstallationStatus,
  createLiteInstallationPullRequest,
  createLiteInstallationUpdatePullRequest,
  createWorkspacePolicyPullRequest as createWorkspacePolicyChangePullRequest,
  liteWorkspacePolicyPath,
} from "../features/lite-setup/installation-model";
import {
  batchDefinitionDirectory,
  isBatchDefinitionFile,
} from "../features/batches/batch-repository";
import {
  buildFailureFollowUpComment,
  buildFailureFollowUpReviewComment,
  parseFailureFollowUps,
  parseFailureFollowUpReviews,
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
  const failureFollowUpReviewsInFlight = new Set<string>();

  return {
    approvals: {
      async approveExecution({ body, issueNumber }) {
        const comment = await client.createIssueComment({
          ...repositoryRef,
          body,
          issueNumber,
        });

        return toRepositoryIssueComment(comment);
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

      async getExecutionRequestIssue({ issueNumber }) {
        const issue = await client.getIssue({
          ...repositoryRef,
          issueNumber,
        });

        return issue && !issue.isPullRequest ? toRepositoryIssue(issue) : null;
      },

      async listExecutionRequestIssues({ state = "open" } = {}) {
        const issues = await client.listIssues({
          ...repositoryRef,
          state,
        });

        return issues
          .filter((issue) => !issue.isPullRequest)
          .map(toRepositoryIssue);
      },

      async listExecutionRequestComments({ issueNumber }) {
        const comments = await client.listIssueComments({
          ...repositoryRef,
          issueNumber,
        });

        return comments.map(toRepositoryIssueComment);
      },

      async getRegistrationRequest({ pullNumber }) {
        const pullRequest = await client.getPullRequest({
          ...repositoryRef,
          pullNumber,
        });

        return pullRequest ? toRepositoryPullRequest(pullRequest) : null;
      },

      async listRegistrationRequests({ baseBranch, state = "open" }) {
        const pullRequests = await client.listPullRequests({
          ...repositoryRef,
          base: baseBranch,
          state,
        });

        return pullRequests.map(toRepositoryPullRequest);
      },

      async listRegistrationRequestFiles({ pullNumber }) {
        const files = await client.listPullRequestFiles({
          ...repositoryRef,
          pullNumber,
        });

        return files.map(toRepositoryPullRequestFile);
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
        const executionRequests = issues
          .map((issue, index) => {
            const mappedIssue = toRepositoryIssue(issue);
            const comments = (issueComments[index] ?? []).map(
              toRepositoryIssueComment,
            );

            return parseExecutionRequestDetail(mappedIssue, comments);
          })
          .filter(
            (request): request is ExecutionRequestForRun => request !== null,
          );
        const failureFollowUpsByIssue =
          await projectFailureFollowUpsForRequests({
            client,
            includeReviewCapabilities: false,
            repositoryRef,
            requests: executionRequests,
          });

        return [
          ...pullRequests.flatMap((pullRequest, index) =>
            toRegistrationAuditItems(
              toRepositoryPullRequest(pullRequest),
              (pullRequestComments[index] ?? []).map(toRepositoryIssueComment),
            ),
          ),
          ...executionRequests.flatMap((request) =>
            toExecutionRequestAuditItems({
              failureFollowUps:
                failureFollowUpsByIssue.get(request.issue.number) ?? [],
              request,
            }),
          ),
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
      async getDeletedBatchArchive({ batchId, ref }) {
        const baseBranch =
          ref ?? (await client.getRepository(repositoryRef)).defaultBranch;

        return loadDeletedBatchArchive({
          batchId,
          baseBranch,
          client,
          repository: repositoryRef,
        });
      },

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

            return file ? parseGovernedBatchDefinitionYaml(file.content) : null;
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
        const normalizedActionTaken = actionTaken.trim();
        const normalizedExplanation = explanation.trim();
        const normalizedOwner = owner.trim();

        if (
          !normalizedActionTaken ||
          !normalizedExplanation ||
          !normalizedOwner
        ) {
          throw new Error(
            "Failure follow-up explanation, action taken, and owner are required.",
          );
        }

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

        const [user, workspacePolicy] = await Promise.all([
          client.getCurrentUser(),
          loadWorkspacePolicy({ client, repositoryRef }),
        ]);
        const followUp: FailureFollowUp = {
          actionTaken: normalizedActionTaken,
          author: user.login,
          batchId: request.batchId,
          createdAt: new Date().toISOString(),
          explanation: normalizedExplanation,
          followUpId: createFailureFollowUpId(run.id),
          owner: normalizedOwner,
          requestId: request.requestId,
          runId: String(run.id),
          reviewStatus: "AWAITING_REVIEW",
          reviews: [],
          status,
        };
        const comment = await client.createIssueComment({
          ...repositoryRef,
          body: buildFailureFollowUpComment(followUp),
          issueNumber: request.issue.number,
        });
        const persistedFollowUp = (
          await projectFailureFollowUps({
            actorLogin: user.login,
            comments: [
              ...request.comments,
              {
                author: comment.author,
                body: comment.body,
                createdAt: comment.createdAt,
                id: comment.id,
                issueNumber: request.issue.number,
              },
            ],
            context: createFailureFollowUpProjectionContext({
              client,
              repositoryRef,
              workspacePolicy,
            }),
            expectedRequest: request,
          })
        ).find(
          (candidate) =>
            candidate.followUpId === followUp.followUpId &&
            candidate.runId === String(run.id),
        );

        if (!persistedFollowUp) {
          throw new Error(
            "GitHub did not return verifiable failure follow-up evidence.",
          );
        }

        return persistedFollowUp;
      },

      async reviewFailureFollowUp({ decision, followUpId, reason, runId }) {
        const normalizedReason = reason.trim();

        if (!normalizedReason) {
          throw new Error("A review reason is required.");
        }

        if (failureFollowUpReviewsInFlight.has(followUpId)) {
          throw new Error("A review decision is already being recorded.");
        }

        failureFollowUpReviewsInFlight.add(followUpId);

        try {
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
          const workspacePolicy = await loadWorkspacePolicy({
            client,
            repositoryRef,
          });
          const followUps = await projectFailureFollowUps({
            actorLogin: user.login,
            comments: request.comments,
            context: createFailureFollowUpProjectionContext({
              client,
              repositoryRef,
              workspacePolicy,
            }),
            expectedRequest: request,
          });
          const followUp = followUps.find(
            (candidate) =>
              candidate.followUpId === followUpId &&
              candidate.runId === String(run.id),
          );

          if (!followUp) {
            throw new Error("Failure follow-up evidence was not found.");
          }

          if (followUp.reviewStatus !== "AWAITING_REVIEW") {
            throw new Error(
              "Failure follow-up has already received a review decision.",
            );
          }

          if (!followUp.reviewCapability?.canReview) {
            throw new Error(
              failureFollowUpReviewCapabilityError(
                followUp.reviewCapability?.unavailableReason,
              ),
            );
          }

          const selfReview = followUp.author === user.login;

          const review: FailureFollowUpReviewDecision = {
            approvalMode: workspacePolicy.approval.mode,
            batchId: followUp.batchId,
            decision,
            followUpId,
            reason: normalizedReason,
            requestId: followUp.requestId,
            reviewedAt: new Date().toISOString(),
            reviewer: user.login,
            reviewId: createFailureFollowUpReviewId(run.id),
            runId: String(run.id),
            selfReview,
          };
          const comment = await client.createIssueComment({
            ...repositoryRef,
            body: buildFailureFollowUpReviewComment(review),
            issueNumber: request.issue.number,
          });

          const persistedFollowUps = await projectFailureFollowUps({
            actorLogin: user.login,
            comments: [
              ...request.comments,
              {
                author: comment.author,
                body: comment.body,
                createdAt: comment.createdAt,
                id: comment.id,
                issueNumber: request.issue.number,
              },
            ],
            context: createFailureFollowUpProjectionContext({
              client,
              repositoryRef,
              workspacePolicy,
            }),
            expectedRequest: request,
          });
          const persistedReview = persistedFollowUps
            .find(
              (candidate) =>
                candidate.followUpId === followUpId &&
                candidate.runId === String(run.id),
            )
            ?.reviews.find(
              (candidate) => candidate.reviewId === review.reviewId,
            );

          if (!persistedReview) {
            throw new Error(
              "GitHub did not return verifiable failure follow-up review evidence.",
            );
          }

          return persistedReview;
        } finally {
          failureFollowUpReviewsInFlight.delete(followUpId);
        }
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

        const failureFollowUpsByIssue =
          await projectFailureFollowUpsForRequests({
            client,
            includeReviewCapabilities: true,
            repositoryRef,
            requests: request ? [request] : [],
          });
        const failureFollowUps = request
          ? (failureFollowUpsByIssue.get(request.issue.number) ?? [])
          : [];

        return toExecutionRun(run, {
          failureFollowUps,
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
        const runContexts = runs.map((run) => {
          const workflow = workflowById.get(run.workflowId);
          const request = findExecutionRequestForRun(
            run,
            requests,
            workflow?.path,
          );

          return { request, run, workflow };
        });
        const failureFollowUpsByIssue =
          await projectFailureFollowUpsForRequests({
            client,
            includeReviewCapabilities: true,
            repositoryRef,
            requests: runContexts.flatMap(({ request }) =>
              request ? [request] : [],
            ),
          });

        return runContexts
          .map(({ request, run, workflow }) =>
            toExecutionRun(run, {
              failureFollowUps: request
                ? failureFollowUpsByIssue.get(request.issue.number)
                : undefined,
              jobs: jobsByRunId.get(run.id),
              request,
              workflow,
            }),
          )
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

      async previewGovernedChangeFiles({ baseBranch, files }) {
        return Promise.all(
          files.map(async (file) => {
            const baseFile = await client.getFile({
              ...repositoryRef,
              path: file.path,
              ref: baseBranch,
            });
            const baseContent = baseFile?.content ?? "";
            const nextContent = file.content ?? "";

            return {
              baseContent,
              nextContent,
              path: file.path,
              status: deriveGovernedChangeFilePreviewStatus(
                baseFile?.content ?? null,
                file.content,
              ),
            };
          }),
        );
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
        await putRepositoryFile({
          branch,
          client,
          content: batchDefinitionYaml,
          message: title,
          path: batchDefinitionPath,
          repositoryRef,
        });
        await putRepositoryFile({
          branch,
          client,
          content: workflowYaml,
          message: title,
          path: workflowPath,
          repositoryRef,
        });

        if (artifact) {
          await putRepositoryFile({
            branch,
            client,
            content: artifact.content,
            encoding: artifact.encoding,
            message: title,
            path: artifact.path,
            repositoryRef,
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

      async createBatchDeletionPullRequest({
        artifactPath,
        baseBranch,
        batchDefinitionPath,
        body,
        branch,
        title,
        workflowPath,
      }) {
        const [baseSha, batchDefinitionFile, workflowFile, artifactFile] =
          await Promise.all([
            client.getBranchHeadSha({
              ...repositoryRef,
              branch: baseBranch,
            }),
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
            artifactPath
              ? client.getFile({
                  ...repositoryRef,
                  path: artifactPath,
                  ref: baseBranch,
                })
              : Promise.resolve(null),
          ]);
        const missingRequiredPaths = [
          batchDefinitionFile ? "" : batchDefinitionPath,
          workflowFile ? "" : workflowPath,
        ].filter(Boolean);

        if (
          missingRequiredPaths.length > 0 ||
          !batchDefinitionFile ||
          !workflowFile
        ) {
          throw new Error(
            `Cannot create delete request because required governed files are missing: ${missingRequiredPaths.join(", ")}.`,
          );
        }

        await client.createBranch({ ...repositoryRef, branch, sha: baseSha });
        await deleteRepositoryFile({
          branch,
          client,
          message: title,
          path: batchDefinitionPath,
          repositoryRef,
          sha: batchDefinitionFile.sha,
        });
        await deleteRepositoryFile({
          branch,
          client,
          message: title,
          path: workflowPath,
          repositoryRef,
          sha: workflowFile.sha,
        });

        if (artifactFile) {
          await deleteRepositoryFile({
            branch,
            client,
            message: title,
            path: artifactFile.path,
            repositoryRef,
            sha: artifactFile.sha,
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

      async createInstallationUpdatePullRequest({ defaultBranch }) {
        const result = await createLiteInstallationUpdatePullRequest({
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
        return loadWorkspacePolicy({ client, ref, repositoryRef });
      },
    },
  };
}

async function putRepositoryFile({
  branch,
  client,
  content,
  encoding,
  message,
  path,
  repositoryRef,
}: {
  branch: string;
  client: GitHubLiteClient;
  content: string;
  encoding?: "utf-8" | "base64";
  message: string;
  path: string;
  repositoryRef: { owner: string; repo: string };
}) {
  const existingFile = await client.getFile({
    ...repositoryRef,
    path,
    ref: branch,
  });

  await client.putFile({
    ...repositoryRef,
    branch,
    content,
    encoding,
    message,
    path,
    ...(existingFile?.sha ? { sha: existingFile.sha } : {}),
  });
}

async function deleteRepositoryFile({
  branch,
  client,
  message,
  path,
  repositoryRef,
  sha,
}: {
  branch: string;
  client: GitHubLiteClient;
  message: string;
  path: string;
  repositoryRef: { owner: string; repo: string };
  sha: string;
}) {
  await client.deleteFile({
    ...repositoryRef,
    branch,
    message,
    path,
    sha,
  });
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

async function loadDeletedBatchArchive({
  baseBranch,
  batchId,
  client,
  repository,
}: {
  baseBranch: string;
  batchId: string;
  client: GitHubLiteClient;
  repository: { owner: string; repo: string };
}): Promise<DeletedBatchArchiveResult | null> {
  if (!isCanonicalBatchId(batchId)) {
    return null;
  }

  const pullRequests = await client.listPullRequests({
    ...repository,
    base: baseBranch,
    state: "closed",
  });
  const candidate = pullRequests
    .filter((pullRequest) => pullRequest.merged)
    .filter((pullRequest) => isDeleteArchiveCandidate(pullRequest, batchId))
    .sort((left, right) => right.number - left.number)[0];

  return candidate
    ? inspectDeletedBatchRequest({
        batchId,
        client,
        pullRequest: candidate,
        repository,
      })
    : null;
}

function isDeleteArchiveCandidate(
  pullRequest: GitHubPullRequest,
  batchId: string,
): boolean {
  const evidence = parseGovernedChangeRequestEvidence(pullRequest.body);

  if (evidence?.type === "DELETE" && evidence.batchId === batchId) {
    return true;
  }

  const normalizedBatchId = batchId.toLowerCase();
  const branchPrefixes = ["batchplane/delete/", "batchtrail/delete/"].map(
    (prefix) => `${prefix}${normalizedBatchId}-`,
  );

  return (
    branchPrefixes.some((prefix) =>
      pullRequest.head.toLowerCase().startsWith(prefix),
    ) ||
    pullRequest.title.trim().toLowerCase() ===
      `delete batch ${normalizedBatchId}`
  );
}

async function inspectDeletedBatchRequest({
  batchId,
  client,
  pullRequest,
  repository,
}: {
  batchId: string;
  client: GitHubLiteClient;
  pullRequest: GitHubPullRequest;
  repository: { owner: string; repo: string };
}): Promise<DeletedBatchArchiveResult> {
  const sourceRequest = toDeletedArchiveSourceRequest(pullRequest);
  const evidence = parseGovernedChangeRequestEvidence(pullRequest.body);

  if (!evidence) {
    return createUnavailableDeletedBatchArchive(
      sourceRequest,
      "LEGACY_OR_MALFORMED_EVIDENCE",
    );
  }

  const definitionPath = getBatchDefinitionPath(batchId);
  const definitionArtifact = evidence.artifacts.find(
    (artifact) => artifact.kind === "BATCH_DEFINITION",
  );
  const workflowArtifact = evidence.artifacts.find(
    (artifact) => artifact.kind === "WORKFLOW",
  );

  if (
    evidence.type !== "DELETE" ||
    evidence.batchId !== batchId ||
    definitionArtifact?.path !== definitionPath ||
    definitionArtifact.beforeDigest === null ||
    definitionArtifact.afterDigest !== null ||
    !workflowArtifact
  ) {
    return createUnavailableDeletedBatchArchive(
      sourceRequest,
      "REQUEST_EVIDENCE_MISMATCH",
    );
  }

  let baseFile: GitHubFile | null;

  try {
    baseFile = await client.getFile({
      ...repository,
      path: definitionPath,
      ref: evidence.baseRevisionSha,
    });
  } catch {
    return createUnavailableDeletedBatchArchive(
      sourceRequest,
      "BASE_REVISION_UNAVAILABLE",
    );
  }

  if (!baseFile) {
    return createUnavailableDeletedBatchArchive(
      sourceRequest,
      "BATCH_DEFINITION_NOT_FOUND",
    );
  }

  if ((await digestGitHubFile(baseFile)) !== definitionArtifact.beforeDigest) {
    return createUnavailableDeletedBatchArchive(
      sourceRequest,
      "BATCH_DEFINITION_DIGEST_MISMATCH",
    );
  }

  let batch: BatchDefinition;

  try {
    batch = parseGovernedBatchDefinitionYaml(baseFile.content);
  } catch {
    return createUnavailableDeletedBatchArchive(
      sourceRequest,
      "BATCH_DEFINITION_MALFORMED",
    );
  }

  if (
    batch.batchId !== batchId ||
    batch.workflow.path !== workflowArtifact.path
  ) {
    return createUnavailableDeletedBatchArchive(
      sourceRequest,
      "BATCH_DEFINITION_MALFORMED",
    );
  }

  let requestIsVerified = false;

  try {
    requestIsVerified = await hasAuthoritativeGovernedChangeRequest(
      client,
      repository,
      pullRequest,
      evidence,
    );
  } catch {
    return createUnavailableDeletedBatchArchive(
      sourceRequest,
      "REQUEST_EVIDENCE_UNVERIFIED",
    );
  }

  return requestIsVerified
    ? { batch, sourceRequest, status: "VERIFIED" }
    : createUnavailableDeletedBatchArchive(
        sourceRequest,
        "REQUEST_EVIDENCE_UNVERIFIED",
      );
}

function toDeletedArchiveSourceRequest(
  pullRequest: GitHubPullRequest,
): DeletedBatchArchiveSourceRequest {
  return {
    locator: String(pullRequest.number),
    number: pullRequest.number,
    url: pullRequest.url,
  };
}

function createUnavailableDeletedBatchArchive(
  sourceRequest: DeletedBatchArchiveSourceRequest,
  unavailableReason: DeletedBatchArchiveUnavailableReason,
): DeletedBatchArchiveResult {
  return {
    sourceRequest,
    status: "UNAVAILABLE",
    unavailableReason,
  };
}

async function digestGitHubFile(file: GitHubFile): Promise<string> {
  return sha256BytesHex(getGitHubFileBytes(file));
}

function getGitHubFileBytes(
  file: Pick<GitHubFile, "content" | "contentBase64">,
): Uint8Array {
  if (file.contentBase64 !== undefined) {
    return Uint8Array.from(atob(file.contentBase64), (character) =>
      character.charCodeAt(0),
    );
  }

  return new TextEncoder().encode(file.content);
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

function toExecutionRequestAuditItems({
  failureFollowUps,
  request,
}: {
  failureFollowUps: FailureFollowUp[];
  request: ExecutionRequestForRun;
}): AuditTimelineItem[] {
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

  for (const followUp of failureFollowUps) {
    items.push({
      actor: followUp.author,
      itemId: `failure-follow-up-${followUp.followUpId}`,
      occurredAt: followUp.createdAt,
      sourceUrl: request.issue.url,
      subjectId: followUp.runId,
      subjectType: "EXECUTION_RUN",
      summary: `Failure follow-up recorded for ${followUp.batchId}`,
      type: "FAILURE_FOLLOW_UP_RECORDED",
      metadata: compactAuditMetadata({
        batchId: followUp.batchId,
        followUpId: followUp.followUpId,
        requestId: followUp.requestId,
        reviewStatus: followUp.reviewStatus,
        runId: followUp.runId,
        status: followUp.status,
      }),
    });

    for (const review of followUp.reviews) {
      items.push({
        actor: review.reviewer,
        itemId: `failure-follow-up-review-${review.reviewId}`,
        occurredAt: review.reviewedAt,
        sourceUrl: request.issue.url,
        subjectId: review.runId,
        subjectType: "EXECUTION_RUN",
        summary: `Failure follow-up ${review.decision.toLowerCase()} for ${review.batchId}`,
        type: "FAILURE_FOLLOW_UP_REVIEWED",
        metadata: compactAuditMetadata({
          approvalMode: review.approvalMode,
          batchId: review.batchId,
          decision: review.decision,
          followUpId: review.followUpId,
          requestId: review.requestId,
          reviewId: review.reviewId,
          runId: review.runId,
          selfReview: review.selfReview,
        }),
      });
    }
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

type FailureFollowUpProjectionContext = {
  permissionByLogin: Map<string, Promise<string>>;
  repositoryRef: RuntimeRepositoryRef;
  workspacePolicy: WorkspacePolicy;
  client: GitHubLiteClient;
};

function createFailureFollowUpProjectionContext({
  client,
  repositoryRef,
  workspacePolicy,
}: Omit<
  FailureFollowUpProjectionContext,
  "permissionByLogin"
>): FailureFollowUpProjectionContext {
  return {
    client,
    permissionByLogin: new Map(),
    repositoryRef,
    workspacePolicy,
  };
}

async function projectFailureFollowUpsForRequests({
  client,
  includeReviewCapabilities,
  repositoryRef,
  requests,
}: {
  client: GitHubLiteClient;
  includeReviewCapabilities: boolean;
  repositoryRef: RuntimeRepositoryRef;
  requests: ExecutionRequestForRun[];
}): Promise<Map<number, FailureFollowUp[]>> {
  const uniqueRequests = new Map(
    requests.map((request) => [request.issue.number, request]),
  );
  const requestsWithFollowUps = [...uniqueRequests.values()].filter(
    hasFailureFollowUpsForExecutionRequest,
  );

  if (requestsWithFollowUps.length === 0) {
    return new Map();
  }

  const [workspacePolicy, user] = await Promise.all([
    loadWorkspacePolicy({ client, repositoryRef }),
    includeReviewCapabilities ? client.getCurrentUser() : undefined,
  ]);
  const context = createFailureFollowUpProjectionContext({
    client,
    repositoryRef,
    workspacePolicy,
  });
  const projections = await Promise.all(
    requestsWithFollowUps.map(
      async (request) =>
        [
          request.issue.number,
          await projectFailureFollowUps({
            ...(user ? { actorLogin: user.login } : {}),
            comments: request.comments,
            context,
            expectedRequest: request,
          }),
        ] as const,
    ),
  );

  return new Map(projections);
}

function hasFailureFollowUpsForExecutionRequest(
  request: ExecutionRequestForRun,
): boolean {
  return parseFailureFollowUps(request.comments, []).some(
    (followUp) =>
      followUp.requestId === request.requestId &&
      followUp.batchId === request.batchId,
  );
}

async function projectFailureFollowUps({
  actorLogin,
  comments,
  context,
  expectedRequest,
}: {
  actorLogin?: string;
  comments: RepositoryIssueComment[];
  context: FailureFollowUpProjectionContext;
  expectedRequest: Pick<ExecutionRequestForRun, "batchId" | "requestId">;
}): Promise<FailureFollowUp[]> {
  const followUpById = new Map<string, FailureFollowUp>();

  for (const followUp of parseFailureFollowUps(comments, [])) {
    if (
      followUp.requestId !== expectedRequest.requestId ||
      followUp.batchId !== expectedRequest.batchId ||
      followUpById.has(followUp.followUpId)
    ) {
      continue;
    }

    // The first structurally valid GitHub comment for an ID is authoritative.
    // Later duplicate markers must not replace its author or request relation.
    followUpById.set(followUp.followUpId, followUp);
  }

  const acceptedReviewByFollowUpId = new Set<string>();
  const verifiedReviews: FailureFollowUpReviewDecision[] = [];

  for (const parsedReview of parseFailureFollowUpReviews(comments)) {
    const followUp = followUpById.get(parsedReview.followUpId);

    if (
      !followUp ||
      !parsedReview.reason.trim() ||
      acceptedReviewByFollowUpId.has(followUp.followUpId)
    ) {
      continue;
    }

    try {
      const permission = await getFailureFollowUpReviewerPermission(
        context,
        parsedReview.reviewer,
      );
      const selfReview = parsedReview.reviewer === followUp.author;

      if (
        !isWorkspaceManagerPermission(permission) ||
        (selfReview &&
          context.workspacePolicy.approval.mode === "SELF_APPROVAL_BLOCKED")
      ) {
        continue;
      }

      acceptedReviewByFollowUpId.add(followUp.followUpId);
      verifiedReviews.push({
        approvalMode: context.workspacePolicy.approval.mode,
        batchId: followUp.batchId,
        decision: parsedReview.decision,
        followUpId: followUp.followUpId,
        reason: parsedReview.reason.trim(),
        requestId: followUp.requestId,
        reviewedAt: parsedReview.reviewedAt,
        reviewer: parsedReview.reviewer,
        reviewId: parsedReview.reviewId,
        runId: followUp.runId,
        selfReview,
      });
    } catch {
      // A permission lookup failure cannot create review evidence.
    }
  }

  const reviewsByFollowUpId = new Map<
    string,
    FailureFollowUpReviewDecision[]
  >();

  for (const review of verifiedReviews) {
    reviewsByFollowUpId.set(review.followUpId, [review]);
  }

  const followUps: FailureFollowUp[] = [...followUpById.values()].map(
    (followUp) => {
      const reviews = reviewsByFollowUpId.get(followUp.followUpId) ?? [];

      return {
        ...followUp,
        reviewStatus: reviews[0]?.decision ?? "AWAITING_REVIEW",
        reviews,
      };
    },
  );

  if (!actorLogin) {
    return followUps;
  }

  let actorPermission: string;

  try {
    actorPermission = await getFailureFollowUpReviewerPermission(
      context,
      actorLogin,
    );
  } catch {
    return followUps.map((followUp) => ({
      ...followUp,
      reviewCapability: {
        canReview: false,
        unavailableReason: "PERMISSION_UNAVAILABLE",
      },
    }));
  }

  return followUps.map((followUp) => ({
    ...followUp,
    reviewCapability: deriveFailureFollowUpReviewCapability({
      actorLogin,
      actorPermission,
      followUp,
      workspacePolicy: context.workspacePolicy,
    }),
  }));
}

function getFailureFollowUpReviewerPermission(
  context: FailureFollowUpProjectionContext,
  login: string,
): Promise<string> {
  const existing = context.permissionByLogin.get(login);

  if (existing) {
    return existing;
  }

  const permission = context.client
    .getRepositoryPermissionForUser({
      ...context.repositoryRef,
      username: login,
    })
    .then((result) => result.permission);
  context.permissionByLogin.set(login, permission);

  return permission;
}

function deriveFailureFollowUpReviewCapability({
  actorLogin,
  actorPermission,
  followUp,
  workspacePolicy,
}: {
  actorLogin: string;
  actorPermission: string;
  followUp: FailureFollowUp;
  workspacePolicy: WorkspacePolicy;
}): FailureFollowUpReviewCapability {
  if (followUp.reviewStatus !== "AWAITING_REVIEW") {
    return { canReview: false, unavailableReason: "ALREADY_REVIEWED" };
  }

  if (!isWorkspaceManagerPermission(actorPermission)) {
    return { canReview: false, unavailableReason: "NOT_WORKSPACE_MANAGER" };
  }

  if (
    followUp.author === actorLogin &&
    workspacePolicy?.approval.mode === "SELF_APPROVAL_BLOCKED"
  ) {
    return { canReview: false, unavailableReason: "SELF_REVIEW_BLOCKED" };
  }

  return { canReview: true };
}

function toExecutionRun(
  run: GitHubWorkflowRun,
  {
    failureFollowUps = [],
    jobs = [],
    request,
    workflow,
  }: {
    failureFollowUps?: FailureFollowUp[];
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
    failureFollowUps: failureFollowUps.filter(
      (followUp) => followUp.runId === String(run.id),
    ),
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

function createFailureFollowUpReviewId(runId: number): string {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(16).slice(2, 10).padEnd(8, "0");

  return `ffur-${runId}-${suffix}`;
}

async function loadWorkspacePolicy({
  client,
  ref,
  repositoryRef,
}: {
  client: GitHubLiteClient;
  ref?: string;
  repositoryRef: RuntimeRepositoryRef;
}): Promise<WorkspacePolicy> {
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
}

function isWorkspaceManagerPermission(permission: string): boolean {
  return permission === "admin" || permission === "maintain";
}

function failureFollowUpReviewCapabilityError(
  reason: FailureFollowUpReviewCapability["unavailableReason"],
): string {
  if (reason === "SELF_REVIEW_BLOCKED") {
    return "Self-review is blocked by the Workspace approval policy.";
  }

  if (reason === "ALREADY_REVIEWED") {
    return "Failure follow-up has already received a review decision.";
  }

  if (reason === "PERMISSION_UNAVAILABLE") {
    return "Workspace manager permission could not be verified.";
  }

  return "Workspace manager permission is required to review failure follow-up evidence.";
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

function deriveGovernedChangeFilePreviewStatus(
  baseContent: string | null,
  nextContent: string | null,
): GovernedChangeFilePreviewStatus {
  if (baseContent === null && nextContent === null) {
    return "UNCHANGED";
  }

  if (baseContent === null) {
    return "ADDED";
  }

  if (nextContent === null) {
    return "DELETED";
  }

  return baseContent === nextContent ? "UNCHANGED" : "MODIFIED";
}

function toRepositoryPullRequestFile(
  file: GitHubPullRequestFile,
): RepositoryPullRequestFile {
  const statusMap = {
    added: "added",
    changed: "modified",
    copied: "added",
    modified: "modified",
    removed: "removed",
    renamed: "renamed",
    unchanged: "unchanged",
  } as const;

  return {
    ...(file.patch ? { patch: file.patch } : {}),
    path: file.path,
    status: statusMap[file.status] ?? "modified",
  };
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
