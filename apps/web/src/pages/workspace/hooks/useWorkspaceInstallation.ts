import type { WorkspaceInstallationRequest } from "@batchplane/ui-client";
import { useEffect, useRef, useState } from "react";
import { useBatchPlaneClient } from "../../../client/batch-plane-client-context";
import type { WorkspaceInspectionState } from "./useWorkspaceInspection";

export type InstallationRequestVariant = "install" | "update";

export type InstallationRequestState =
  | { type: "idle" }
  | { type: "creating"; revision: number }
  | {
      type: "success";
      result: WorkspaceInstallationRequest;
      revision: number;
      variant: InstallationRequestVariant;
    }
  | { type: "error"; error: unknown; revision: number };

export function useWorkspaceInstallation(inspection: WorkspaceInspectionState) {
  const client = useBatchPlaneClient();
  const generation = useRef(0);
  const [state, setState] = useState<InstallationRequestState>({
    type: "idle",
  });
  const requestState =
    state.type === "idle" || state.revision === inspection.revision
      ? state
      : { type: "idle" as const };

  useEffect(() => {
    generation.current++;
    setState({ type: "idle" });
    return () => {
      generation.current += 1;
    };
  }, [client, inspection.revision]);

  async function createRequest(variant: InstallationRequestVariant) {
    if (inspection.type !== "loaded") {
      return;
    }
    const operation = ++generation.current;
    const revision = inspection.revision;
    try {
      setState({ type: "creating", revision });
      const result =
        variant === "install"
          ? await client.requestWorkspaceInstallation()
          : await client.requestWorkspaceUpdate();
      if (generation.current === operation)
        setState({ type: "success", result, revision, variant });
    } catch (error) {
      if (generation.current === operation)
        setState({ type: "error", error, revision });
    }
  }

  return { requestState, createRequest };
}
