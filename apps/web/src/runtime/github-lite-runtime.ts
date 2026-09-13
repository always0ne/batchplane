import { sha256BytesHex } from "@batchplane/digest";
import type {
  ApprovedBatchRevision,
  BatchDefinition,
  BatchPlaneRuntimePorts,
  DeletedBatchArchiveResult,
  DeletedBatchArchiveSourceRequest,
  DeletedBatchArchiveUnavailableReason,
  GovernedChangeFilePreviewStatus,
  RepositoryFile,
  RepositoryIssue,
  RepositoryIssueComment,
  RepositoryPullRequest,
  RepositoryPullRequestFile,
} from "@batchplane/domain";
import { isCanonicalBatchId } from "@batchplane/domain";
import {
  createGitHubLiteAuditClient,
  createGitHubLiteClient,
  createGitHubLiteExecutionLogClient,
  createGitHubLiteExecutionRunClient,
  createGitHubLiteFailureFollowUpClient,
  getBatchDefinitionPath,
  hasAuthoritativeGovernedChangeRequest,
  parseBatchDefinitionYaml as parseGovernedBatchDefinitionYaml,
  parseGovernedChangeRequestEvidence,
  verifyApprovedBatchRevision,
  type GitHubFile,
  type GitHubIssue,
  type GitHubIssueComment,
  type GitHubLiteClient,
  type GitHubLiteClientOptions,
  type GitHubPullRequest,
  type GitHubPullRequestFile,
} from "@batchplane/github-lite";

import { loadWorkspacePolicy } from "@batchplane/github-lite";
import {
  batchDefinitionDirectory,
  isBatchDefinitionFile,
} from "../features/batches/batch-repository";
import type { GitHubSession } from "../features/lite-setup/github-session";
import {
  checkLiteInstallationStatus,
  createLiteInstallationPullRequest,
  createLiteInstallationUpdatePullRequest,
  createWorkspacePolicyPullRequest as createWorkspacePolicyChangePullRequest,
} from "../features/lite-setup/installation-model";

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
      ...createGitHubLiteAuditClient({ client, repositoryRef }),
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
      ...createGitHubLiteExecutionRunClient({ client, repositoryRef }),
      ...createGitHubLiteExecutionLogClient({ client, repositoryRef }),
      ...createGitHubLiteFailureFollowUpClient({ client, repositoryRef }),

      async createExecutionRequest({ body, labels, title }) {
        const requestRevision = readExecutionRequestRevisionBinding(body);
        const requestBatchId = readExecutionRequestBatchId(body);

        if (!requestRevision || !requestBatchId) {
          throw new Error(
            "Execution request is missing approved Batch revision evidence.",
          );
        }

        const verification = await verifyApprovedBatchRevision({
          batchId: requestBatchId,
          client,
          expectedRevision: requestRevision,
          repository: repositoryRef,
        });
        if (verification.controlStatus !== "VERIFIED") {
          throw new Error(verification.reasonCode);
        }

        const issue = await client.createIssue({
          ...repositoryRef,
          body,
          labels,
          title,
        });

        return toRepositoryIssue(issue);
      },

      async getApprovedBatchRevision({
        batchId,
      }): Promise<ApprovedBatchRevision> {
        const verification = await verifyApprovedBatchRevision({
          batchId,
          client,
          repository: repositoryRef,
        });

        if (verification.controlStatus !== "VERIFIED") {
          throw new Error(verification.reasonCode);
        }

        return {
          ...verification.approvedRevision,
          verifiedSha: verification.verifiedSha,
        };
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

function readExecutionRequestRevisionBinding(body: string): {
  governedChangeId: string;
  targetRevisionDigest: string;
} | null {
  const match = /### Canonical payload\s*```json\s*([\s\S]*?)\s*```/u.exec(
    body,
  );

  if (!match?.[1]) return null;
  try {
    const payload = JSON.parse(match[1]) as {
      spec?: {
        approvedBatchRevision?: {
          governedChangeId?: string;
          targetRevisionDigest?: string;
        };
      };
    };
    const revision = payload.spec?.approvedBatchRevision;

    return revision?.governedChangeId &&
      revision.targetRevisionDigest?.startsWith("sha256:")
      ? {
          governedChangeId: revision.governedChangeId,
          targetRevisionDigest: revision.targetRevisionDigest,
        }
      : null;
  } catch {
    return null;
  }
}

function readExecutionRequestBatchId(body: string): string | null {
  const marker =
    /<!--\s*batchplane:execution-request[\s\S]*?^batchId=(.+)$/mu.exec(body);

  return marker?.[1]?.trim() || null;
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
