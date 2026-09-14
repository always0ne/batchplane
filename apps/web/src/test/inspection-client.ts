import type { BatchPlaneClient } from "@batchplane/ui-client";
export function inspectionTestClient(
  overrides: Partial<BatchPlaneClient> = {},
): BatchPlaneClient {
  return {
    listBatches: unused,
    getBatchDetail: unused,
    loadBatchChangeDraft: unused,
    getBatchChangeBlocker: unused,
    previewBatchChange: unused,
    createBatchChangeRequest: unused,
    getGovernedChange: unused,
    approveGovernedChange: unused,
    rejectGovernedChange: unused,
    withdrawGovernedChange: unused,
    requestBatchRemediation: unused,
    getBatchRemediationCapability: unused,
    loadExecutionRequestDraft: unused,
    previewExecutionRequest: unused,
    createExecutionRequest: unused,
    getExecutionRequest: unused,
    approveExecutionRequest: unused,
    rejectExecutionRequest: unused,
    listApprovalRequests: unused,
    listWorkspaceRequests: unused,
    getMyWork: unused,
    listExecutionRuns: unused,
    getExecutionRun: unused,
    getExecutionRunJobLog: unused,
    createFailureFollowUp: unused,
    reviewFailureFollowUp: unused,
    listAuditTimeline: unused,
    getDashboardSummary: unused,
    ...overrides,
  };
}
async function unused(): Promise<never> {
  throw new Error("Unexpected product client call in this test.");
}
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
