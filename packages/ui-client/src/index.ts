export * from "./batches.js";
export * from "./governed-changes.js";

import type {
  BatchChangeDraft,
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
