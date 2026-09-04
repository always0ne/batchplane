export * from "./batches.js";
export * from "./governed-changes.js";

import type {
  BatchChangeDraft,
  BatchChangeBlocker,
  CreateGovernedChangeResult,
  GovernedChangeDetail,
  GovernedChangePreview,
} from "./governed-changes.js";
import type { BatchListResult } from "./batches.js";

export type BatchPlaneClient = {
  listBatches(): Promise<BatchListResult>;
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
