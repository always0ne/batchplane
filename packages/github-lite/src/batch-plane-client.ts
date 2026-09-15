import type { GitHubRepositoryContext } from "./github-types.js";
import type { GitHubBatchDefinition } from "./github-batch-definition.js";
import { loadBatchDefinitions } from "./batch-repository.js";
import {
  loadDeletedBatchArchive,
  type DeletedBatchArchiveResult,
} from "./deleted-batch-archive.js";

import type {
  BatchControl,
  BatchDetailArchiveResult,
  BatchDetailDefinition,
  BatchListItem,
  BatchPlaneClient,
} from "@batchplane/ui-client";
import { toProductReadError } from "./product-read-errors.js";

import type { createGitHubLiteBatchRevisionClient } from "./batch-revision-client.js";
import { formatGeneratedScheduleCrons } from "./github-workflow.js";
import type { createGitHubLiteGovernedChangeClient } from "./governed-change-client.js";

type BatchRevisionReadClient = Pick<
  ReturnType<typeof createGitHubLiteBatchRevisionClient>,
  "listRecentExecutionRequestSummaries" | "verifyApprovedBatchRevision"
>;

type GovernedChangeReadClient = Pick<
  ReturnType<typeof createGitHubLiteGovernedChangeClient>,
  "getBatchRemediationCapability"
>;

export type GitHubLiteBatchReadClientDependencies = GitHubRepositoryContext & {
  revisionClient: BatchRevisionReadClient;
  governedChangeClient: GovernedChangeReadClient;
};

/**
 * Adapts GitHub-backed Batch reads to the provider-neutral UI client contract.
 * The caller supplies the concrete GitHub client and repository.
 */
export function createGitHubLiteBatchReadClient({
  client,
  repositoryRef,
  revisionClient,
  governedChangeClient,
}: GitHubLiteBatchReadClientDependencies): Pick<
  BatchPlaneClient,
  "getBatchDetail" | "listBatches"
> {
  return {
    async listBatches() {
      try {
        const repository = await client.getRepository(repositoryRef);
        const batches = await loadBatchDefinitions({
          client,
          repository: repositoryRef,
          ref: repository.defaultBranch,
        });
        const listItems = await Promise.all(
          batches.map(async (batch) =>
            toBatchListItem(
              batch,
              toBatchControl(
                await revisionClient.verifyApprovedBatchRevision({
                  batchId: batch.batchId,
                }),
                await governedChangeClient.getBatchRemediationCapability({
                  batchId: batch.batchId,
                }),
              ),
            ),
          ),
        );

        return {
          batches: listItems,
          sourceRevision: repository.defaultBranch,
          type: "loaded" as const,
        };
      } catch (error) {
        return { error: toProductReadError(error), type: "error" as const };
      }
    },

    async getBatchDetail({ batchId }) {
      const repository = await client.getRepository(repositoryRef);
      const [batches, recentExecutionRequests] = await Promise.all([
        loadBatchDefinitions({
          client,
          repository: repositoryRef,
          ref: repository.defaultBranch,
        }),
        revisionClient.listRecentExecutionRequestSummaries({ batchId }),
      ]);
      const batch = batches.find((candidate) => candidate.batchId === batchId);

      if (batch) {
        const control = toBatchControl(
          await revisionClient.verifyApprovedBatchRevision({ batchId }),
          await governedChangeClient.getBatchRemediationCapability({ batchId }),
        );
        return {
          batch: toBatchDetailDefinition(batch),
          control,
          defaultBranch: repository.defaultBranch,
          recentExecutionRequests,
          type: "active" as const,
        };
      }

      const archive = await loadDeletedBatchArchive({
        client,
        repository: repositoryRef,
        batchId,
        baseBranch: repository.defaultBranch,
      });
      if (archive) {
        return {
          archive: toBatchDetailArchive(archive),
          defaultBranch: repository.defaultBranch,
          recentExecutionRequests,
          type: "deleted" as const,
        };
      }

      return { batchId, type: "not-found" as const };
    },
  };
}

function toBatchDetailDefinition(
  batch: GitHubBatchDefinition,
): BatchDetailDefinition {
  return {
    batchId: batch.batchId,
    criticality: batch.criticality,
    description: batch.description,
    domain: batch.domain,
    environment: batch.environment,
    gateRequired: batch.gateRequired,
    labels: batch.labels,
    name: batch.name,
    owner: batch.owner,
    status: batch.status,
    executionTarget: {
      ...(batch.execution
        ? {
            command: batch.execution.command,
            executionEnvironment: formatRunnerLabel(batch.execution.runsOn),
            ...(batch.execution.artifactPath
              ? {
                  executionFile: {
                    location: batch.execution.artifactPath,
                    name:
                      batch.execution.artifactPath.split("/").at(-1) ??
                      batch.execution.artifactPath,
                  },
                }
              : {}),
          }
        : {}),
      platformName: "GitHub Actions",
      targetName: batch.workflow.path,
      targetRevision: batch.workflow.ref,
    },
    schedules: batch.schedules?.map((schedule) => ({
      ...schedule,
      generatedCron: formatGeneratedScheduleCrons(schedule),
    })),
  };
}

function formatRunnerLabel(value: string | string[]): string {
  return Array.isArray(value) ? value.join(", ") : value;
}

function toBatchDetailArchive(
  archive: DeletedBatchArchiveResult,
): BatchDetailArchiveResult {
  if (archive.status !== "VERIFIED") return archive;

  return { ...archive, batch: toBatchDetailDefinition(archive.batch) };
}

function toBatchListItem(
  batch: GitHubBatchDefinition,
  control: BatchControl,
): BatchListItem {
  return {
    batchId: batch.batchId,
    control,
    criticality: batch.criticality,
    environment: batch.environment,
    gateRequired: batch.gateRequired,
    hasExecutableCommand: Boolean(batch.execution?.command.trim()),
    name: batch.name,
    owner: batch.owner,
    status: batch.status,
  };
}

function toBatchControl(
  result: Awaited<
    ReturnType<BatchRevisionReadClient["verifyApprovedBatchRevision"]>
  >,
  remediation: Awaited<
    ReturnType<GovernedChangeReadClient["getBatchRemediationCapability"]>
  >,
): BatchControl {
  if (result.controlStatus === "VERIFIED") {
    return {
      approvedRevision: {
        ...result.approvedRevision,
        verifiedSha: result.verifiedSha,
      },
      remediation,
      status: "VERIFIED",
    };
  }

  return {
    disabledReason: result.reasonCode,
    remediation,
    status: result.controlStatus,
  };
}
