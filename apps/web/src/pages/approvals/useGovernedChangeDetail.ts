import type { GovernedChangeDetail } from "@batchplane/ui-client";
import { useCallback, useEffect, useState } from "react";

import { useBatchPlaneClient } from "../../client/batch-plane-client-context";

export type GovernedChangeAction = "approve" | "reject" | "withdraw";

type DetailState =
  | { type: "loading" }
  | { type: "not-found" }
  | { detail: GovernedChangeDetail; type: "loaded" }
  | { message: string; type: "error" };

export function useGovernedChangeDetail(requestLocator: string) {
  const client = useBatchPlaneClient();
  const [detailState, setDetailState] = useState<DetailState>({
    type: "loading",
  });
  const [runningAction, setRunningAction] = useState<GovernedChangeAction>();
  const [actionError, setActionError] = useState("");

  const refresh = useCallback(async () => {
    setDetailState({ type: "loading" });
    setActionError("");

    try {
      const detail = await client.getGovernedChange({ requestLocator });
      setDetailState(
        detail ? { detail, type: "loaded" } : { type: "not-found" },
      );
    } catch (error) {
      setDetailState({ message: messageFrom(error), type: "error" });
    }
  }, [client, requestLocator]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const applyAction = useCallback(
    async (action: GovernedChangeAction, rejectionReason = "") => {
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
        setDetailState({ detail, type: "loaded" });
        return true;
      } catch (error) {
        setActionError(messageFrom(error));
        return false;
      } finally {
        setRunningAction(undefined);
      }
    },
    [client, requestLocator],
  );

  return { actionError, applyAction, detailState, refresh, runningAction };
}

function messageFrom(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : "";
}
