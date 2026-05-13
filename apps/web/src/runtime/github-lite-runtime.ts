import type {
  BatchDefinition,
  BatchTrailRuntimePorts,
  RepositoryIssue,
  RepositoryPullRequest,
} from "@batchtrail/domain";
import {
  createGitHubLiteClient,
  type GitHubIssue,
  type GitHubLiteClientOptions,
  type GitHubPullRequest,
} from "@batchtrail/github-lite";

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
  fetcher?: GitHubLiteClientOptions["fetcher"];
};

export function createGitHubLiteRuntime(
  session: GitHubSession,
  options: GitHubLiteRuntimeOptions = {},
): BatchTrailRuntimePorts {
  const client = createGitHubLiteClient({
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
        await client.closeIssue({ ...repositoryRef, issueNumber });
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

      async listExecutionRequestIssues() {
        const issues = await client.listIssues({
          ...repositoryRef,
          state: "open",
        });

        return issues.map(toRepositoryIssue);
      },

      async listRegistrationRequests({ baseBranch }) {
        const pullRequests = await client.listPullRequests({
          ...repositoryRef,
          base: baseBranch,
          state: "open",
        });

        return pullRequests.map(toRepositoryPullRequest);
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

function toRepositoryPullRequest(
  pullRequest: GitHubPullRequest,
): RepositoryPullRequest {
  return pullRequest;
}

function isLoadedBatchDefinition(
  definition: BatchDefinition | null,
): definition is BatchDefinition {
  return Boolean(definition?.batchId);
}
