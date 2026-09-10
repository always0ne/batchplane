import {
  WorkspaceNotConnectedError,
  type BatchPlaneClient,
  type BatchListItem,
  type BatchControl,
} from "@batchplane/ui-client";
import type { BatchDefinition } from "@batchplane/domain";
import {
  createBatchPlaneRuntime,
  createRuntimeBatchRevisionClient,
  createRuntimeGovernedChangeClient,
  readRuntimeSession,
} from "./runtime-fixtures";

type RuntimeBatchPlaneClientDependencies = {
  createBatchRevisionClient?: typeof createRuntimeBatchRevisionClient;
  createGovernedChangeClient?: typeof createRuntimeGovernedChangeClient;
  createRuntime?: typeof createBatchPlaneRuntime;
  readSession?: typeof readRuntimeSession;
};

export function createRuntimeBatchPlaneClient({
  createBatchRevisionClient = createRuntimeBatchRevisionClient,
  createGovernedChangeClient = createRuntimeGovernedChangeClient,
  createRuntime = createBatchPlaneRuntime,
  readSession = readRuntimeSession,
}: RuntimeBatchPlaneClientDependencies = {}): BatchPlaneClient {
  return {
    async listBatches() {
      const session = readSession();

      if (!session) {
        return { type: "workspace-not-connected" };
      }

      const runtime = createRuntime(session);
      const repository = await runtime.settings.getRepository();
      const batches = await runtime.batches.listBatchDefinitions({
        ref: repository.defaultBranch,
      });
      const revisionClient = createBatchRevisionClient(session);
      const governedChangeClient = createGovernedChangeClient(session);
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
        type: "loaded",
      };
    },
    async getBatchDetail({ batchId }) {
      const session = requireSession(readSession());
      const runtime = createRuntime(session);
      const repository = await runtime.settings.getRepository();
      const [batches, revisionClient] = await Promise.all([
        runtime.batches.listBatchDefinitions({ ref: repository.defaultBranch }),
        Promise.resolve(createBatchRevisionClient(session)),
      ]);
      const recentExecutionRequests =
        await revisionClient.listRecentExecutionRequestSummaries({ batchId });
      const batch = batches.find((candidate) => candidate.batchId === batchId);

      if (batch) {
        const control = toBatchControl(
          await revisionClient.verifyApprovedBatchRevision({
            batchId,
          }),
          await createGovernedChangeClient(
            session,
          ).getBatchRemediationCapability({
            batchId,
          }),
        );
        return {
          batch,
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
          archive,
          defaultBranch: repository.defaultBranch,
          recentExecutionRequests,
          type: "deleted" as const,
        };
      }

      return { batchId, type: "not-found" as const };
    },
    async requestBatchRemediation(input) {
      const session = requireSession(readSession());

      return createGovernedChangeClient(session).requestBatchRemediation(input);
    },
    async getBatchRemediationCapability({ batchId }) {
      const session = requireSession(readSession());

      return createGovernedChangeClient(session).getBatchRemediationCapability({
        batchId,
      });
    },
    async loadBatchChangeDraft(input) {
      const session = requireSession(readSession());

      return createGovernedChangeClient(session).loadBatchChangeDraft(input);
    },
    async getBatchChangeBlocker(input) {
      const session = requireSession(readSession());

      return createGovernedChangeClient(session).getBatchChangeBlocker(input);
    },
    async previewBatchChange(input) {
      const session = requireSession(readSession());

      return createGovernedChangeClient(session).previewBatchChange(input);
    },
    async createBatchChangeRequest(input) {
      const session = requireSession(readSession());

      return createGovernedChangeClient(session).createBatchChangeRequest(
        input,
      );
    },
    async getGovernedChange(input) {
      const session = requireSession(readSession());

      return createGovernedChangeClient(session).getGovernedChange(input);
    },
    async approveGovernedChange(input) {
      const session = requireSession(readSession());

      return createGovernedChangeClient(session).approveGovernedChange(input);
    },
    async rejectGovernedChange(input) {
      const session = requireSession(readSession());

      return createGovernedChangeClient(session).rejectGovernedChange(input);
    },
    async withdrawGovernedChange(input) {
      const session = requireSession(readSession());

      return createGovernedChangeClient(session).withdrawGovernedChange(input);
    },
  };
}

function requireSession(session: ReturnType<typeof readRuntimeSession>) {
  if (!session) {
    throw new WorkspaceNotConnectedError();
  }

  return session;
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
    ReturnType<
      ReturnType<
        typeof createRuntimeBatchRevisionClient
      >["verifyApprovedBatchRevision"]
    >
  >,
  remediation: Awaited<
    ReturnType<BatchPlaneClient["getBatchRemediationCapability"]>
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
