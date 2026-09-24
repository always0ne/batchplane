import {
  isWorkspaceNotConnectedError,
  type ChangeRequestDetail,
} from "@batchplane/ui-client";
import { useCallback, useEffect, useRef, useState } from "react";

import { useBatchPlaneClient } from "../../../../client/batch-plane-client-context";

export type ChangeRequestAction = "approve" | "reject" | "withdraw";

type DetailState =
  | { type: "loading" }
  | { type: "not-found" }
  | { type: "workspace-not-connected" }
  | { detail: ChangeRequestDetail; type: "loaded" }
  | { message: string; type: "error" };

export function useChangeRequestDetail(requestLocator: string) {
  const client = useBatchPlaneClient();
  const requestVersion = useRef(0);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [detailState, setDetailState] = useState<DetailState>({
    type: "loading",
  });
  const [runningAction, setRunningAction] = useState<ChangeRequestAction>();
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    const version = requestVersion.current + 1;
    requestVersion.current = version;
    setRunningAction(undefined);
    void loadDetail({
      client,
      isCurrent: () => requestVersion.current === version,
      requestLocator,
      setActionError,
      setDetailState,
    });
    return () => {
      if (requestVersion.current === version) {
        requestVersion.current += 1;
      }
    };
  }, [client, refreshVersion, requestLocator]);

  const applyAction = useCallback(
    async (action: ChangeRequestAction, rejectionReason = "") => {
      const version = requestVersion.current;
      setRunningAction(action);
      setActionError("");
      try {
        const detail =
          action === "approve"
            ? await client.approveChangeRequest({ requestLocator })
            : action === "reject"
              ? await client.rejectChangeRequest({
                  reason: rejectionReason,
                  requestLocator,
                })
              : await client.withdrawChangeRequest({ requestLocator });
        if (requestVersion.current !== version) return false;
        setDetailState({ detail, type: "loaded" });
        return true;
      } catch (error) {
        if (requestVersion.current !== version) return false;
        setActionError(messageFrom(error));
        return false;
      } finally {
        if (requestVersion.current === version) setRunningAction(undefined);
      }
    },
    [client, requestLocator],
  );

  const refresh = useCallback(() => {
    setRefreshVersion((currentVersion) => currentVersion + 1);
  }, []);

  return { actionError, applyAction, detailState, refresh, runningAction };
}

async function loadDetail({
  client,
  isCurrent,
  requestLocator,
  setActionError,
  setDetailState,
}: {
  client: ReturnType<typeof useBatchPlaneClient>;
  isCurrent: () => boolean;
  requestLocator: string;
  setActionError: (message: string) => void;
  setDetailState: (state: DetailState) => void;
}) {
  if (!isCurrent()) return;
  setDetailState({ type: "loading" });
  setActionError("");

  try {
    const detail = await client.getChangeRequest({ requestLocator });
    if (!isCurrent()) return;
    setDetailState(detail ? { detail, type: "loaded" } : { type: "not-found" });
  } catch (error) {
    if (isCurrent()) {
      if (isWorkspaceNotConnectedError(error)) {
        setDetailState({ type: "workspace-not-connected" });
        return;
      }
      setDetailState({ message: messageFrom(error), type: "error" });
    }
  }
}

function messageFrom(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : "";
}
