import {
  isWorkspaceNotConnectedError,
  type BatchPlaneClient,
  type DashboardSummary,
} from "@batchplane/ui-client";
import { useEffect, useState } from "react";
import { useBatchPlaneClient } from "../../client/batch-plane-client-context";
export type DashboardState =
  | { type: "loading" }
  | { type: "no-session" }
  | { type: "error"; error: unknown }
  | { type: "loaded"; summary: DashboardSummary };
export function useDashboard() {
  const client = useBatchPlaneClient();
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    client: BatchPlaneClient;
    state: DashboardState;
  }>();
  useEffect(() => {
    let active = true;
    setResult({ client, state: { type: "loading" } });
    async function load() {
      try {
        const summary = await client.getDashboardSummary();
        if (active) setResult({ client, state: { type: "loaded", summary } });
      } catch (error) {
        if (active)
          setResult({
            client,
            state: isWorkspaceNotConnectedError(error)
              ? { type: "no-session" }
              : { type: "error", error },
          });
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [client, revision]);
  return {
    state:
      result?.client === client ? result.state : ({ type: "loading" } as const),
    refresh: () => setRevision((value) => value + 1),
  };
}
