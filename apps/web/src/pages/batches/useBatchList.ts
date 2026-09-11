import type { BatchListResult } from "@batchplane/ui-client";
import { useEffect, useState } from "react";

import { useBatchPlaneClient } from "../../client/batch-plane-client-context";

export type BatchListState = { type: "loading" } | BatchListResult;

export function useBatchList() {
  const client = useBatchPlaneClient();
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [state, setState] = useState<BatchListState>({ type: "loading" });

  function refresh() {
    setRefreshVersion((currentVersion) => currentVersion + 1);
  }

  useEffect(() => {
    let isCurrentRequest = true;

    async function loadBatchList() {
      setState({ type: "loading" });

      try {
        const batchList = await client.listBatches();

        if (isCurrentRequest) {
          setState(batchList);
        }
      } catch (error) {
        if (isCurrentRequest) {
          setState({
            type: "error",
            error:
              error instanceof Error && error.message.trim()
                ? { message: error.message, type: "message" }
                : { type: "unknown" },
          });
        }
      }
    }

    void loadBatchList();

    return () => {
      isCurrentRequest = false;
    };
  }, [client, refreshVersion]);

  return { refresh, state };
}
