import {
  isWorkspaceNotConnectedError,
  type BatchDetailResult,
} from "@batchplane/ui-client";
import { useCallback, useEffect, useRef, useState } from "react";

import { useBatchPlaneClient } from "../../client/batch-plane-client-context";

export type BatchDetailState =
  | { type: "loading" }
  | { type: "workspace-not-connected" }
  | { type: "error"; message: string }
  | Exclude<BatchDetailResult, { type: "not-found" }>
  | { type: "not-found"; batchId: string };

export function useBatchDetail(batchId: string, errorFallback: string) {
  const client = useBatchPlaneClient();
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [state, setState] = useState<BatchDetailState>({ type: "loading" });
  const currentRequest = useRef(0);

  const refresh = useCallback(() => {
    setRefreshVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    const requestId = currentRequest.current + 1;
    currentRequest.current = requestId;
    setState({ type: "loading" });

    async function loadDetail() {
      try {
        const result = await client.getBatchDetail({ batchId });
        if (currentRequest.current === requestId) setState(result);
      } catch (error) {
        if (currentRequest.current !== requestId) return;
        if (isWorkspaceNotConnectedError(error)) {
          setState({ type: "workspace-not-connected" });
          return;
        }
        setState({
          type: "error",
          message:
            error instanceof Error && error.message.trim()
              ? error.message
              : errorFallback,
        });
      }
    }

    void loadDetail();
    return () => {
      if (currentRequest.current === requestId) currentRequest.current += 1;
    };
  }, [batchId, client, errorFallback, refreshVersion]);

  return { refresh, state };
}
