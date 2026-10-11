import {
  WorkspaceNotConnectedError,
  type BatchPlaneClient,
} from "@batchplane/ui-client";
import {
  createSelectedBatchPlaneClient,
  readRuntimeFixtureSelection,
  readRuntimeSession,
} from "./runtime-fixtures";
import type { GitHubSession } from "./github-session";

type RuntimeBatchPlaneClientDependencies = {
  createClient?: typeof createSelectedBatchPlaneClient;
  readSession?: typeof readRuntimeSession;
  readFixture?: typeof readRuntimeFixtureSelection;
};

export type RuntimeBatchPlaneClient = BatchPlaneClient & {
  resetConnection(): void;
};

/** Retain only the product client for the current connection, never API results. */
export function createRuntimeBatchPlaneClient({
  createClient = createSelectedBatchPlaneClient,
  readSession = readRuntimeSession,
  readFixture = readRuntimeFixtureSelection,
}: RuntimeBatchPlaneClientDependencies = {}): RuntimeBatchPlaneClient {
  let selectedConnection:
    | {
        session: GitHubSession;
        fixtureId: ReturnType<typeof readRuntimeFixtureSelection>;
        client: BatchPlaneClient;
      }
    | undefined;

  function resetConnection() {
    selectedConnection = undefined;
  }

  function selectedClient(): BatchPlaneClient | null {
    const session = readSession();
    if (!session) {
      resetConnection();
      return null;
    }

    const fixtureId = readFixture();
    if (
      !selectedConnection ||
      selectedConnection.fixtureId !== fixtureId ||
      selectedConnection.session.owner !== session.owner ||
      selectedConnection.session.repo !== session.repo ||
      selectedConnection.session.token !== session.token
    ) {
      resetConnection();
      selectedConnection = {
        session: { ...session },
        fixtureId,
        client: createClient(session),
      };
    }
    return selectedConnection.client;
  }

  function connectedClient(): BatchPlaneClient {
    const client = selectedClient();
    if (!client) throw new WorkspaceNotConnectedError();
    return client;
  }

  return {
    resetConnection,
    async listBatches() {
      const client = selectedClient();
      if (!client) return { type: "workspace-not-connected" };
      return client.listBatches();
    },
    inspectWorkspace: async () => connectedClient().inspectWorkspace(),
    inspectWorkspaceEncryption: async () =>
      connectedClient().inspectWorkspaceEncryption(),
    initializeWorkspaceEncryption: async () =>
      connectedClient().initializeWorkspaceEncryption(),
    requestWorkspaceInstallation: async () =>
      connectedClient().requestWorkspaceInstallation(),
    requestWorkspaceUpdate: async () =>
      connectedClient().requestWorkspaceUpdate(),
    requestWorkspacePolicyChange: async (input) =>
      connectedClient().requestWorkspacePolicyChange(input),
    getBatchDetail: async (input) => connectedClient().getBatchDetail(input),
    requestBatchRemediation: async (input) =>
      connectedClient().requestBatchRemediation(input),
    getBatchRemediationCapability: async (input) =>
      connectedClient().getBatchRemediationCapability(input),
    loadBatchChangeDraft: async (input) =>
      connectedClient().loadBatchChangeDraft(input),
    getBatchChangeBlocker: async (input) =>
      connectedClient().getBatchChangeBlocker(input),
    previewBatchChange: async (input) =>
      connectedClient().previewBatchChange(input),
    createBatchChangeRequest: async (input) =>
      connectedClient().createBatchChangeRequest(input),
    getChangeRequest: async (input) =>
      connectedClient().getChangeRequest(input),
    approveChangeRequest: async (input) =>
      connectedClient().approveChangeRequest(input),
    rejectChangeRequest: async (input) =>
      connectedClient().rejectChangeRequest(input),
    withdrawChangeRequest: async (input) =>
      connectedClient().withdrawChangeRequest(input),
    loadExecutionRequestDraft: async (input) =>
      connectedClient().loadExecutionRequestDraft(input),
    previewExecutionRequest: async (input) =>
      connectedClient().previewExecutionRequest(input),
    createExecutionRequest: async (input) =>
      connectedClient().createExecutionRequest(input),
    getExecutionRequest: async (input) =>
      connectedClient().getExecutionRequest(input),
    approveExecutionRequest: async (input) =>
      connectedClient().approveExecutionRequest(input),
    rejectExecutionRequest: async (input) =>
      connectedClient().rejectExecutionRequest(input),
    listApprovalRequests: async () => connectedClient().listApprovalRequests(),
    listWorkspaceRequests: async () =>
      connectedClient().listWorkspaceRequests(),
    getMyWork: async () => connectedClient().getMyWork(),
    listExecutionRuns: async (input) =>
      connectedClient().listExecutionRuns(input),
    getExecutionRun: async (input) => connectedClient().getExecutionRun(input),
    getExecutionRunJobLog: async (input) =>
      connectedClient().getExecutionRunJobLog(input),
    createFailureFollowUp: async (input) =>
      connectedClient().createFailureFollowUp(input),
    reviewFailureFollowUp: async (input) =>
      connectedClient().reviewFailureFollowUp(input),
    listAuditTimeline: async (input) =>
      connectedClient().listAuditTimeline(input),
    getDashboardSummary: async () => connectedClient().getDashboardSummary(),
  };
}
