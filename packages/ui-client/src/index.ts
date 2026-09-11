export * from "./batches.js";
export * from "./batch-details.js";
export * from "./execution-requests.js";
export * from "./governed-changes.js";
export * from "./request-inventory.js";

import type {
  BatchChangeDraft,
  BatchChangeBlocker,
  CreateGovernedChangeResult,
  GovernedChangeDetail,
  GovernedChangePreview,
} from "./governed-changes.js";
import type {
  CreateExecutionRequestResult,
  ExecutionRequest,
  ExecutionRequestDraftResult,
  ExecutionRequestInput,
  ExecutionRequestPreview,
} from "./execution-requests.js";
import type {
  ApprovalRequestInventory,
  MyWorkInventory,
  WorkspaceRequestInventory,
} from "./request-inventory.js";
import type { BatchListResult } from "./batches.js";
import type {
  BatchDetailResult,
  BatchRemediationCapability,
  RequestBatchRemediationInput,
} from "./batch-details.js";

export type BatchPlaneClient = {
  listBatches(): Promise<BatchListResult>;
  getBatchDetail(input: { batchId: string }): Promise<BatchDetailResult>;
  requestBatchRemediation(
    input: RequestBatchRemediationInput,
  ): Promise<CreateGovernedChangeResult>;
  getBatchRemediationCapability(input: {
    batchId: string;
  }): Promise<BatchRemediationCapability>;
  loadBatchChangeDraft(input: {
    batchId?: string;
    mode: "create" | "change" | "delete";
  }): Promise<BatchChangeDraft>;
  getBatchChangeBlocker(input: {
    batchId: string;
  }): Promise<BatchChangeBlocker | null>;
  previewBatchChange(input: BatchChangeDraft): Promise<GovernedChangePreview>;
  createBatchChangeRequest(
    input: BatchChangeDraft,
  ): Promise<CreateGovernedChangeResult>;
  getGovernedChange(input: {
    requestLocator: string;
  }): Promise<GovernedChangeDetail | null>;
  approveGovernedChange(input: {
    requestLocator: string;
  }): Promise<GovernedChangeDetail>;
  rejectGovernedChange(input: {
    reason: string;
    requestLocator: string;
  }): Promise<GovernedChangeDetail>;
  withdrawGovernedChange(input: {
    requestLocator: string;
  }): Promise<GovernedChangeDetail>;
  loadExecutionRequestDraft(input: {
    batchId: string;
  }): Promise<ExecutionRequestDraftResult>;
  previewExecutionRequest(
    input: ExecutionRequestInput,
  ): Promise<ExecutionRequestPreview>;
  createExecutionRequest(
    input: ExecutionRequestInput,
  ): Promise<CreateExecutionRequestResult>;
  getExecutionRequest(input: {
    requestLocator: string;
  }): Promise<ExecutionRequest | null>;
  approveExecutionRequest(input: {
    requestLocator: string;
  }): Promise<ExecutionRequest>;
  rejectExecutionRequest(input: {
    reason: string;
    requestLocator: string;
  }): Promise<ExecutionRequest>;
  listApprovalRequests(): Promise<ApprovalRequestInventory>;
  listWorkspaceRequests(): Promise<WorkspaceRequestInventory>;
  getMyWork(): Promise<MyWorkInventory>;
};

export class WorkspaceNotConnectedError extends Error {
  readonly code = "WORKSPACE_NOT_CONNECTED";

  constructor() {
    super("Connect a Workspace before requesting a governed change.");
    this.name = "WorkspaceNotConnectedError";
  }
}

export function isWorkspaceNotConnectedError(
  error: unknown,
): error is WorkspaceNotConnectedError {
  return error instanceof WorkspaceNotConnectedError;
}
