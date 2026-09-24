import {
  WorkspaceNotConnectedError,
  type BatchPlaneClient,
} from "@batchplane/ui-client";
import {
  createSelectedBatchPlaneClient,
  readRuntimeSession,
} from "./runtime-fixtures";

type RuntimeBatchPlaneClientDependencies = {
  createClient?: typeof createSelectedBatchPlaneClient;
  readSession?: typeof readRuntimeSession;
};

/** Resolve the selected connection anew for each product operation. */
export function createRuntimeBatchPlaneClient({
  createClient = createSelectedBatchPlaneClient,
  readSession = readRuntimeSession,
}: RuntimeBatchPlaneClientDependencies = {}): BatchPlaneClient {
  function connectedClient() {
    const session = readSession();
    if (!session) throw new WorkspaceNotConnectedError();
    return createClient(session);
  }

  return {
    async listBatches() {
      const session = readSession();
      if (!session) return { type: "workspace-not-connected" };
      return createClient(session).listBatches();
    },
    inspectWorkspace: async () => connectedClient().inspectWorkspace(),
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
