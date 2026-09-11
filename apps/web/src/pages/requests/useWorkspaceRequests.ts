import {
  isWorkspaceNotConnectedError,
  type WorkspaceRequestInventory,
} from "@batchplane/ui-client";
import { useCallback, useEffect, useRef, useState } from "react";

import { useBatchPlaneClient } from "../../client/batch-plane-client-context";

export type WorkspaceRequestsState =
  | { type: "loading" }
  | { type: "workspace-not-connected" }
  | { inventory: WorkspaceRequestInventory; type: "loaded" }
  | { message: string; type: "error" };

export function useWorkspaceRequests() {
  const client = useBatchPlaneClient();
  const requestVersion = useRef(0);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [state, setState] = useState<WorkspaceRequestsState>({
    type: "loading",
  });

  useEffect(() => {
    const version = requestVersion.current + 1;
    requestVersion.current = version;
    setState({ type: "loading" });

    void client
      .listWorkspaceRequests()
      .then((inventory) => {
        if (requestVersion.current === version) {
          setState({ inventory, type: "loaded" });
        }
      })
      .catch((error) => {
        if (requestVersion.current !== version) return;
        if (isWorkspaceNotConnectedError(error)) {
          setState({ type: "workspace-not-connected" });
          return;
        }
        setState({ message: messageFrom(error), type: "error" });
      });

    return () => {
      if (requestVersion.current === version) requestVersion.current += 1;
    };
  }, [client, refreshVersion]);

  const refresh = useCallback(() => {
    setRefreshVersion((currentVersion) => currentVersion + 1);
  }, []);

  return { refresh, state };
}

function messageFrom(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : "";
}
