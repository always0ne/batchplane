import type { BatchDefinition } from "@batchplane/domain";
import type {
  GitHubBatchParameterDefinition,
  GitHubBatchSchedule,
} from "./parameter-storage.js";

export type GitHubBatchDefinition = Omit<
  BatchDefinition,
  "parameters" | "schedules"
> & {
  parameters?: GitHubBatchParameterDefinition[];
  schedules?: GitHubBatchSchedule[];
  governedChangeId?: string;
  workflow: { path: string; ref: string };
  execution?: {
    runsOn: string | string[];
    command: string;
    artifactPath?: string;
  };
};
