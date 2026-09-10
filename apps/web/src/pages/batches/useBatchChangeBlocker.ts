import type { BatchChangeBlocker } from "@batchplane/ui-client";
import { useEffect, useRef, useState } from "react";

import { useBatchPlaneClient } from "../../client/batch-plane-client-context";

export type BatchChangeBlockerState =
  | { type: "loading" }
  | { type: "ready"; blocker: BatchChangeBlocker | null }
  | { type: "error"; message: string };

export function useBatchChangeBlocker(batchId: string, errorFallback: string) {
  const client = useBatchPlaneClient();
  const [state, setState] = useState<BatchChangeBlockerState>({
    type: "loading",
  });
  const currentRequest = useRef(0);

  useEffect(() => {
    const requestId = currentRequest.current + 1;
    currentRequest.current = requestId;
    setState({ type: "loading" });
    void client
      .getBatchChangeBlocker({ batchId })
      .then((blocker) => {
        if (currentRequest.current === requestId)
          setState({ type: "ready", blocker });
      })
      .catch((error) => {
        if (currentRequest.current === requestId)
          setState({
            type: "error",
            message:
              error instanceof Error && error.message.trim()
                ? error.message
                : errorFallback,
          });
      });
    return () => {
      if (currentRequest.current === requestId) currentRequest.current += 1;
    };
  }, [batchId, client, errorFallback]);

  return { state };
}
