import type {
  BatchDefinition,
  BatchPlaneRuntimePorts,
} from "@batchplane/domain";
import type {
  BatchControl,
  BatchDetailArchiveResult,
  BatchDetailDefinition,
  BatchListError,
  BatchListItem,
  BatchPlaneClient,
} from "@batchplane/ui-client";

import type { createGitHubLiteBatchRevisionClient } from "./batch-revision-client.js";
import type { createGitHubLiteGovernedChangeClient } from "./governed-change-client.js";
import { formatGeneratedScheduleCrons } from "./github-workflow.js";

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
        return { error: toBatchListError(error), type: "error" as const };
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

function toBatchListError(error: unknown): BatchListError {
  if (isGitHubLiteApiError(error)) {
    const errorType =
      getGitHubErrorTypeByCode(error.code) ??
      getGitHubErrorTypeByStatus(error.status) ??
      "provider-unknown";

    return { type: errorType };
  }

  if (error instanceof Error && error.message.trim()) {
    return { message: error.message, type: "message" };
  }

  return { type: "unknown" };
}

const githubErrorTypeByCode = {
  "bad-request": "request-rejected",
  conflict: "conflict",
  forbidden: "access-denied",
  "not-found": "resource-unavailable",
  "rate-limited": "temporarily-unavailable",
  unauthorized: "authentication-required",
  unknown: "provider-unknown",
  validation: "invalid-input",
} as const satisfies Record<string, Exclude<BatchListError["type"], "message">>;

function getGitHubErrorTypeByCode(
  code: unknown,
): Exclude<BatchListError["type"], "message"> | undefined {
  if (typeof code !== "string" || !(code in githubErrorTypeByCode)) {
    return undefined;
  }

  return githubErrorTypeByCode[code as keyof typeof githubErrorTypeByCode];
}

function getGitHubErrorTypeByStatus(
  status: unknown,
): Exclude<BatchListError["type"], "message"> | undefined {
  if (status === 401) return "authentication-required";
  if (status === 403) return "access-denied";
  if (status === 404) return "resource-unavailable";
  if (status === 409) return "conflict";
  if (status === 422) return "invalid-input";
  if (status === 429) return "temporarily-unavailable";
  return undefined;
}

function isGitHubLiteApiError(
  error: unknown,
): error is Error & { code?: unknown; status?: unknown } {
  return error instanceof Error && error.name === "GitHubLiteApiError";
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
