import type {
  BatchDefinition,
  BatchPlaneRuntimePorts,
} from "@batchplane/domain";
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

export type GitHubLiteBatchReadClientDependencies = {
  runtime: Pick<BatchPlaneRuntimePorts, "batches" | "settings">;
  revisionClient: BatchRevisionReadClient;
  governedChangeClient: GovernedChangeReadClient;
};

/**
 * Adapts GitHub-backed Batch reads to the provider-neutral UI client contract.
 * Runtime composition supplies the concrete session and transport dependencies.
 */
export function createGitHubLiteBatchReadClient({
  runtime,
  revisionClient,
  governedChangeClient,
}: GitHubLiteBatchReadClientDependencies): Pick<
  BatchPlaneClient,
  "getBatchDetail" | "listBatches"
> {
  return {
    async listBatches() {
      try {
        const repository = await runtime.settings.getRepository();
        const batches = await runtime.batches.listBatchDefinitions({
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
      const repository = await runtime.settings.getRepository();
      const [batches, recentExecutionRequests] = await Promise.all([
        runtime.batches.listBatchDefinitions({ ref: repository.defaultBranch }),
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

      const archive = await runtime.batches.getDeletedBatchArchive({
        batchId,
        ref: repository.defaultBranch,
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
  batch: BatchDefinition,
): BatchDetailDefinition {
  return {
    ...batch,
    schedules: batch.schedules?.map((schedule) => ({
      ...schedule,
      generatedCron: formatGeneratedScheduleCrons(schedule),
    })),
  };
}

function toBatchDetailArchive(
  archive: Exclude<
    Awaited<
      ReturnType<BatchPlaneRuntimePorts["batches"]["getDeletedBatchArchive"]>
    >,
    null
  >,
): BatchDetailArchiveResult {
  if (archive.status !== "VERIFIED") return archive;

  return { ...archive, batch: toBatchDetailDefinition(archive.batch) };
}

function toBatchListItem(
  batch: BatchDefinition,
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
