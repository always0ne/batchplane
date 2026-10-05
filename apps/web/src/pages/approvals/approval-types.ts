import type { ExecutionRequest } from "@batchplane/ui-client";

export type ActionState =
  | { type: "idle" }
  | { action: "approve" | "reject"; requestLocator: string; type: "running" }
  | { message: string; type: "success" }
  | { message: string; type: "error" };

export type ExecutionAction = (
  request: ExecutionRequest,
  action: "approve" | "reject",
  reason?: string,
) => Promise<void>;
