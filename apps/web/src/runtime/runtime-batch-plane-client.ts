import {
  type BatchPlaneClient,
  type BatchListItem,
} from "@batchplane/ui-client";
import type { BatchDefinition } from "@batchplane/domain";
import {
  createBatchPlaneRuntime,
  createRuntimeGovernedChangeClient,
  readRuntimeSession,
} from "./runtime-fixtures";

type RuntimeBatchPlaneClientDependencies = {
  createGovernedChangeClient?: typeof createRuntimeGovernedChangeClient;
  createRuntime?: typeof createBatchPlaneRuntime;
  readSession?: typeof readRuntimeSession;
};

export function createRuntimeBatchPlaneClient({
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

      return {
        batches: batches.map(toBatchListItem),
        sourceRevision: repository.defaultBranch,
        type: "loaded",
      };
    },
    async loadBatchChangeDraft(input) {
      const session = requireSession(readSession());

      return createGovernedChangeClient(session).loadBatchChangeDraft(input);
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
    throw new Error("Connect a Workspace before requesting a governed change.");
  }

  return session;
}

function toBatchListItem(batch: BatchDefinition): BatchListItem {
  return {
    batchId: batch.batchId,
    criticality: batch.criticality,
    environment: batch.environment,
    gateRequired: batch.gateRequired,
    hasExecutableCommand: Boolean(batch.execution?.command.trim()),
    name: batch.name,
    owner: batch.owner,
    status: batch.status,
  };
}
