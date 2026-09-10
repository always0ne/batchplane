import {
  isWorkspaceNotConnectedError,
  type GovernedChangeDetail,
} from "@batchplane/ui-client";
import { useCallback, useEffect, useRef, useState } from "react";

import { useBatchPlaneClient } from "../../client/batch-plane-client-context";

export type GovernedChangeAction = "approve" | "reject" | "withdraw";

type DetailState =
  | { type: "loading" }
  | { type: "not-found" }
  | { type: "workspace-not-connected" }
  | { detail: GovernedChangeDetail; type: "loaded" }
  | { message: string; type: "error" };

export function useGovernedChangeDetail(requestLocator: string) {
  const client = useBatchPlaneClient();
  const requestVersion = useCurrentRequestVersion(client, requestLocator);
  const [detailState, setDetailState] = useState<DetailState>({
    type: "loading",
  });
  const [runningAction, setRunningAction] = useState<GovernedChangeAction>();
  const [actionError, setActionError] = useState("");

  const refresh = useCallback(async () => {
    const version = requestVersion.current.version;
    await loadDetail({
      client,
      isCurrent: () => requestVersion.current.version === version,
      requestLocator,
      setActionError,
      setDetailState,
    });
  }, [client, requestLocator, requestVersion]);

  useEffect(() => {
    const version = requestVersion.current.version;
    setRunningAction(undefined);
    void loadDetail({
      client,
      isCurrent: () => requestVersion.current.version === version,
      requestLocator,
      setActionError,
      setDetailState,
    });
    return () => {
      if (requestVersion.current.version === version) {
        requestVersion.current.version += 1;
      }
    };
  }, [client, requestLocator, requestVersion]);

  const applyAction = useCallback(
    async (action: GovernedChangeAction, rejectionReason = "") => {
      const version = requestVersion.current.version;
      setRunningAction(action);
      setActionError("");
      try {
        const detail =
          action === "approve"
            ? await client.approveGovernedChange({ requestLocator })
            : action === "reject"
              ? await client.rejectGovernedChange({
                  reason: rejectionReason,
                  requestLocator,
                })
              : await client.withdrawGovernedChange({ requestLocator });
        if (requestVersion.current.version !== version) return false;
        setDetailState({ detail, type: "loaded" });
        return true;
      } catch (error) {
        if (requestVersion.current.version !== version) return false;
        setActionError(messageFrom(error));
        return false;
      } finally {
        if (requestVersion.current.version === version)
          setRunningAction(undefined);
      }
    },
    [client, requestLocator, requestVersion],
  );

  return { actionError, applyAction, detailState, refresh, runningAction };
}

function useCurrentRequestVersion(
  client: ReturnType<typeof useBatchPlaneClient>,
  requestLocator: string,
) {
  const current = useRef({ client, requestLocator, version: 0 });

  if (
    current.current.client !== client ||
    current.current.requestLocator !== requestLocator
  ) {
    current.current = {
      client,
      requestLocator,
      version: current.current.version + 1,
    };
  }

  return current;
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
    const detail = await client.getGovernedChange({ requestLocator });
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
