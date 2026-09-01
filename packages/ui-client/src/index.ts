import type { BatchStatus, Criticality } from "@batchplane/domain";

export type BatchListItem = {
  batchId: string;
  criticality: Criticality;
  environment: string;
  gateRequired: boolean;
  hasExecutableCommand: boolean;
  name: string;
  owner: string;
  status: BatchStatus;
};

export type BatchListResult =
  | { type: "workspace-not-connected" }
  | {
      type: "loaded";
      batches: BatchListItem[];
      sourceRevision: string;
    };

export type BatchPlaneClient = {
  listBatches(): Promise<BatchListResult>;
};
