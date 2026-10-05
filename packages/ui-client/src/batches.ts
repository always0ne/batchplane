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

export type BatchListError =
  | { type: "request-rejected" }
  | { type: "authentication-required" }
  | { type: "access-denied" }
  | { type: "resource-unavailable" }
  | { type: "conflict" }
  | { type: "invalid-input" }
  | { type: "temporarily-unavailable" }
  | { type: "provider-unknown" }
  | { type: "unknown" }
  | { type: "message"; message: string };

export type BatchListResult =
  | { type: "workspace-not-connected" }
  | { type: "error"; error: BatchListError }
  | {
      type: "loaded";
      batches: BatchListItem[];
      sourceRevision: string;
    };
