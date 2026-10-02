export * from "./batches.js";
export * from "./batch-details.js";
export * from "./execution-requests.js";
export * from "./change-requests.js";
export * from "./github-actions-execution.js";
export * from "./request-inventory.js";
export * from "./execution-inspection.js";
export * from "./workspace.js";

import type {
  WorkspaceInspection,
  WorkspaceInstallationRequest,
  WorkspacePolicy,
  WorkspacePolicyRequest,
} from "./workspace.js";

import type {
  BatchDetailResult,
  BatchRemediationCapability,
  RequestBatchRemediationInput,
} from "./batch-details.js";
import type { BatchListResult } from "./batches.js";
import type {
  CreateFailureFollowUpInput,
  DashboardSummary,
  ExecutionAuditItem,
  ExecutionJobLog,
  ExecutionRunLocator,
  ExecutionRunQuery,
  FailureFollowUp,
  FailureFollowUpReviewDecision,
  ReviewFailureFollowUpInput,
} from "./execution-inspection.js";
import type {
  CreateExecutionRequestResult,
  ExecutionRequest,
  ExecutionRequestDraftResult,
  ExecutionRequestInput,
  ExecutionRequestPreview,
  ExecutionRunPresentation,
} from "./execution-requests.js";
import type {
  BatchChangeBlocker,
  BatchChangeDraft,
  CreateChangeRequestResult,
  ChangeRequestDetail,
  ChangeRequestPreview,
} from "./change-requests.js";
import type {
  ApprovalRequestInventory,
  MyWorkInventory,
  WorkspaceRequestInventory,
} from "./request-inventory.js";

export type BatchPlaneClient = {
  inspectWorkspace(): Promise<WorkspaceInspection>;
  requestWorkspaceInstallation(): Promise<WorkspaceInstallationRequest>;
  requestWorkspaceUpdate(): Promise<WorkspaceInstallationRequest>;
  requestWorkspacePolicyChange(input: {
    policy: WorkspacePolicy;
  }): Promise<WorkspacePolicyRequest>;
  listExecutionRuns(
    input?: ExecutionRunQuery,
  ): Promise<ExecutionRunPresentation[]>;
  getExecutionRun(
    input: ExecutionRunLocator,
  ): Promise<ExecutionRunPresentation | null>;
  getExecutionRunJobLog(input: { jobId: string }): Promise<ExecutionJobLog>;
  createFailureFollowUp(
    input: CreateFailureFollowUpInput,
  ): Promise<FailureFollowUp>;
  reviewFailureFollowUp(
    input: ReviewFailureFollowUpInput,
  ): Promise<FailureFollowUpReviewDecision>;
  listAuditTimeline(input?: { limit?: number }): Promise<ExecutionAuditItem[]>;
  getDashboardSummary(): Promise<DashboardSummary>;
  listBatches(): Promise<BatchListResult>;
  getBatchDetail(input: { batchId: string }): Promise<BatchDetailResult>;
  requestBatchRemediation(
    input: RequestBatchRemediationInput,
  ): Promise<CreateChangeRequestResult>;
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
  previewBatchChange(input: BatchChangeDraft): Promise<ChangeRequestPreview>;
  createBatchChangeRequest(
    input: BatchChangeDraft,
  ): Promise<CreateChangeRequestResult>;
  getChangeRequest(input: {
    requestLocator: string;
  }): Promise<ChangeRequestDetail | null>;
  approveChangeRequest(input: {
    requestLocator: string;
  }): Promise<ChangeRequestDetail>;
  rejectChangeRequest(input: {
    reason: string;
    requestLocator: string;
  }): Promise<ChangeRequestDetail>;
  withdrawChangeRequest(input: {
    requestLocator: string;
  }): Promise<ChangeRequestDetail>;
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
    super("Connect a Workspace before requesting a change request.");
    this.name = "WorkspaceNotConnectedError";
  }
}

export function isWorkspaceNotConnectedError(
  error: unknown,
): error is WorkspaceNotConnectedError {
  return error instanceof WorkspaceNotConnectedError;
}
