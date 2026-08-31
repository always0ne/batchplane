import {
  type BatchPlaneClient,
  type BatchListItem,
} from "@batchplane/ui-client";
import type { BatchDefinition } from "@batchplane/domain";

import {
  createBatchPlaneRuntime,
  readRuntimeSession,
} from "./runtime-fixtures";

type RuntimeBatchPlaneClientDependencies = {
  createRuntime?: typeof createBatchPlaneRuntime;
  readSession?: typeof readRuntimeSession;
};

export function createRuntimeBatchPlaneClient({
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
  };
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
