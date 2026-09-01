import type { BatchListResult } from "@batchplane/ui-client";
import { useEffect, useState } from "react";

import { useBatchPlaneClient } from "../../client/batch-plane-client-context";
import { formatRuntimeError } from "../../runtime/runtime-errors";

export type BatchListState =
  | { type: "loading" }
  | BatchListResult
  | { type: "error"; message: string };

export function useBatchList(errorFallback: string) {
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
            message: formatRuntimeError(error, errorFallback),
          });
        }
      }
    }

    void loadBatchList();

    return () => {
      isCurrentRequest = false;
    };
  }, [client, errorFallback, refreshVersion]);

  return { refresh, state };
}
