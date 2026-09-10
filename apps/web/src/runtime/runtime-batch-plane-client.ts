import {
  WorkspaceNotConnectedError,
  type BatchPlaneClient,
} from "@batchplane/ui-client";
import { createGitHubLiteBatchReadClient } from "@batchplane/github-lite";
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

      return createBatchReadClient(session).listBatches();
    },
    async getBatchDetail({ batchId }) {
      const session = requireSession(readSession());
      return createBatchReadClient(session).getBatchDetail({ batchId });
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

  function createBatchReadClient(
    session: NonNullable<ReturnType<typeof readRuntimeSession>>,
  ) {
    return createGitHubLiteBatchReadClient({
      governedChangeClient: createGovernedChangeClient(session),
      revisionClient: createBatchRevisionClient(session),
      runtime: createRuntime(session),
    });
  }
}

function requireSession(session: ReturnType<typeof readRuntimeSession>) {
  if (!session) {
    throw new WorkspaceNotConnectedError();
  }

  return session;
}
