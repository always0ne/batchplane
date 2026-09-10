import {
  isWorkspaceNotConnectedError,
  type BatchChangeBlocker,
  type BatchChangeDraft,
} from "@batchplane/ui-client";
import { useEffect, useState } from "react";

import { useBatchPlaneClient } from "../../client/batch-plane-client-context";

export type BatchChangeDraftLoadState =
  | { type: "loading" }
  | { type: "workspace-not-connected" }
  | { message: string; type: "error" }
  | { blocker: BatchChangeBlocker; type: "blocked" }
  | { draft: BatchChangeDraft; type: "ready" };

export function useBatchChangeDraftLoader({
  mode,
  targetBatchId,
}: {
  mode: BatchChangeDraft["mode"];
  targetBatchId: string;
}) {
  const client = useBatchPlaneClient();
  const [state, setState] = useState<BatchChangeDraftLoadState>({
    type: "loading",
  });

  useEffect(() => {
    let isCurrent = true;

    async function loadDraft() {
      setState({ type: "loading" });

      try {
        if (mode !== "create" && targetBatchId) {
          const blocker = await client.getBatchChangeBlocker({
            batchId: targetBatchId,
          });
          if (blocker) {
            if (isCurrent) setState({ blocker, type: "blocked" });
            return;
          }
        }

        const draft = await client.loadBatchChangeDraft({
          ...(targetBatchId ? { batchId: targetBatchId } : {}),
          mode,
        });
        if (isCurrent) setState({ draft, type: "ready" });
      } catch (error) {
        if (!isCurrent) return;
        if (isWorkspaceNotConnectedError(error)) {
          setState({ type: "workspace-not-connected" });
          return;
        }
        setState({ message: messageFrom(error), type: "error" });
      }
    }

    void loadDraft();
    return () => {
      isCurrent = false;
    };
  }, [client, mode, targetBatchId]);

  return state;
}

function messageFrom(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : "";
}
