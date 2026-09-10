import type { BatchStatus, Criticality } from "@batchplane/domain";
import type { BatchControl } from "./batch-details.js";

export type BatchListItem = {
  batchId: string;
  criticality: Criticality;
  environment: string;
  gateRequired: boolean;
  hasExecutableCommand: boolean;
  name: string;
  owner: string;
  status: BatchStatus;
  control: BatchControl;
};

export type BatchListResult =
  | { type: "workspace-not-connected" }
  | {
      type: "loaded";
      batches: BatchListItem[];
      sourceRevision: string;
    };
