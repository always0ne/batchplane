import type { BatchDefinition } from "@batchplane/domain";

export type GitHubBatchDefinition = BatchDefinition & {
  governedChangeId?: string;
  workflow: { path: string; ref: string };
  execution?: {
    runsOn: string | string[];
    command: string;
    artifactPath?: string;
  };
};
