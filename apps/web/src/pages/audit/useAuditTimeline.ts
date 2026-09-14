import {
  isWorkspaceNotConnectedError,
  type BatchPlaneClient,
  type ExecutionAuditItem,
} from "@batchplane/ui-client";
import { useEffect, useState } from "react";
import { useBatchPlaneClient } from "../../client/batch-plane-client-context";
export type AuditTimelineState =
  | { type: "loading" }
  | { type: "no-session" }
  | { type: "error"; error: unknown }
  | { type: "loaded"; items: ExecutionAuditItem[] };
export function useAuditTimeline() {
  const client = useBatchPlaneClient();
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    client: BatchPlaneClient;
    state: AuditTimelineState;
  }>();
  useEffect(() => {
    let active = true;
    setResult({ client, state: { type: "loading" } });
    async function load() {
      try {
        const items = await client.listAuditTimeline({ limit: 100 });
        if (active) setResult({ client, state: { type: "loaded", items } });
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
