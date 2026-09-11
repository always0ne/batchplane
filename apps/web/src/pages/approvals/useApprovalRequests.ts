import {
  isWorkspaceNotConnectedError,
  type ApprovalRequestInventory,
  type ExecutionRequest,
} from "@batchplane/ui-client";
import { useCallback, useEffect, useRef, useState } from "react";

import { useBatchPlaneClient } from "../../client/batch-plane-client-context";

export type ApprovalRequestsState =
  | { type: "loading" }
  | { type: "workspace-not-connected" }
  | { inventory: ApprovalRequestInventory; type: "loaded" }
  | { message: string; type: "error" };

export function useApprovalRequests() {
  const client = useBatchPlaneClient();
  const requestVersion = useRef(0);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [state, setState] = useState<ApprovalRequestsState>({
    type: "loading",
  });

  useEffect(() => {
    const version = requestVersion.current + 1;
    requestVersion.current = version;
    setState({ type: "loading" });

    void client
      .listApprovalRequests()
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

  const applyExecutionResult = useCallback((request: ExecutionRequest) => {
    // A command result is newer than any list request already in flight.
    requestVersion.current += 1;
    setState((current) => {
      if (current.type !== "loaded") return current;

      return {
        inventory: {
          ...current.inventory,
          requests: current.inventory.requests
            .map((item) =>
              item.kind === "EXECUTION" &&
              item.request.requestLocator === request.requestLocator
                ? {
                    ...item,
                    actor: request.requestedBy || item.actor,
                    request,
                    targetLabel: request.schedule
                      ? [request.batchId, request.schedule.scheduleId].join(
                          " / ",
                        )
                      : request.batchId,
                    updatedAt: request.updatedAt,
                  }
                : item,
            )
            .filter(
              (item) =>
                item.kind !== "EXECUTION" ||
                item.request.requestLocator !== request.requestLocator ||
                item.request.status === "REQUESTED",
            ),
        },
        type: "loaded",
      };
    });
  }, []);

  return { applyExecutionResult, refresh, state };
}

function messageFrom(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : "";
}
