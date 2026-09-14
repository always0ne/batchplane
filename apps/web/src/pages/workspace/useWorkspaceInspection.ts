import type { WorkspaceInspection } from "@batchplane/ui-client";
import { useEffect, useRef, useState } from "react";
import { useBatchPlaneClient } from "../../client/batch-plane-client-context";

export type WorkspaceInspectionState = {
  revision: number;
} & (
  | { type: "idle" }
  | { type: "checking" }
  | { type: "loaded"; data: WorkspaceInspection }
  | { type: "error"; error: unknown }
);

export function useWorkspaceInspection() {
  const client = useBatchPlaneClient();
  const generation = useRef(0);
  const [state, setState] = useState<WorkspaceInspectionState>({
    type: "idle",
    revision: 0,
  });

  useEffect(() => {
    setState({ type: "idle", revision: ++generation.current });
    return () => {
      generation.current += 1;
    };
  }, [client]);

  function reset() {
    setState({ type: "idle", revision: ++generation.current });
  }

  async function check() {
    const revision = ++generation.current;
    setState({ type: "checking", revision });
    try {
      const data = await client.inspectWorkspace();
      if (generation.current === revision)
        setState({ type: "loaded", data, revision });
    } catch (error) {
      if (generation.current === revision)
        setState({ type: "error", error, revision });
    }
  }

  return { state, reset, check };
}
