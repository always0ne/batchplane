import {
  isWorkspaceNotConnectedError,
  type BatchPlaneClient,
  type ExecutionRunPresentation,
} from "@batchplane/ui-client";
import { useEffect, useState } from "react";

import { useBatchPlaneClient } from "../../client/batch-plane-client-context";

export type ExecutionsState =
  | { type: "loading" }
  | { type: "no-session" }
  | { type: "error"; error: unknown }
  | { type: "loaded"; runs: ExecutionRunPresentation[] };

export function useExecutions() {
  const client = useBatchPlaneClient();
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    client: BatchPlaneClient;
    state: ExecutionsState;
  }>();

  useEffect(() => {
    let active = true;
    setResult({ client, state: { type: "loading" } });

    async function load() {
      try {
        const runs = await client.listExecutionRuns({ limit: 100 });
        if (active) setResult({ client, state: { type: "loaded", runs } });
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
