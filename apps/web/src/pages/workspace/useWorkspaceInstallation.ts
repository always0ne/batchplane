import type { WorkspaceInstallationRequest } from "@batchplane/ui-client";
import { useEffect, useRef, useState } from "react";
import { useBatchPlaneClient } from "../../client/batch-plane-client-context";

type InstallationRequestState =
  | { type: "idle" }
  | { type: "creating" }
  | {
      type: "success";
      result: WorkspaceInstallationRequest;
      variant: "install" | "update";
    }
  | { type: "error"; error: unknown };

export function useWorkspaceInstallation(
  revision: number,
  prepareRequest: () => void,
) {
  const client = useBatchPlaneClient();
  const generation = useRef(0);
  const [state, setState] = useState<InstallationRequestState>({
    type: "idle",
  });

  useEffect(() => {
    generation.current++;
    setState({ type: "idle" });
    return () => {
      generation.current += 1;
    };
  }, [client, revision]);

  async function request(variant: "install" | "update") {
    const operation = ++generation.current;
    try {
      prepareRequest();
      setState({ type: "creating" });
      const result =
        variant === "install"
          ? await client.requestWorkspaceInstallation()
          : await client.requestWorkspaceUpdate();
      if (generation.current === operation)
        setState({ type: "success", result, variant });
    } catch (error) {
      if (generation.current === operation) setState({ type: "error", error });
    }
  }

  return { state, request };
}
