import { WorkspaceNotConnectedError } from "@batchplane/ui-client";
import { describe, expect, it, vi } from "vitest";
import { createRuntimeBatchPlaneClient } from "./runtime-batch-plane-client";

describe("Workspace runtime client connection boundary", () => {
  it.each([
    "inspectWorkspace",
    "requestWorkspaceInstallation",
    "requestWorkspaceUpdate",
    "requestWorkspacePolicyChange",
  ] as const)(
    "%s rejects a disconnected session before creating a runtime",
    async (method) => {
      const createClient = vi.fn();
      const client = createRuntimeBatchPlaneClient({
        readSession: () => null,
        createClient,
      });
      const operation =
        method === "requestWorkspacePolicyChange"
          ? client[method]({
              policy: { approval: { mode: "SELF_APPROVAL_BLOCKED" } },
            })
          : client[method]();
      await expect(operation).rejects.toBeInstanceOf(
        WorkspaceNotConnectedError,
      );
      expect(createClient).not.toHaveBeenCalled();
    },
  );
});
