import type {
  WorkspaceApprovalMode,
  WorkspacePolicyRequest,
} from "@batchplane/ui-client";
import { useEffect, useRef, useState } from "react";
import { useBatchPlaneClient } from "../../client/batch-plane-client-context";
import type { WorkspaceInspectionState } from "./useWorkspaceInspection";

type PolicyRequestState =
  | { type: "idle" }
  | { type: "creating"; revision: number }
  | { type: "success"; result: WorkspacePolicyRequest; revision: number }
  | { type: "error"; error: unknown; revision: number };

export function useWorkspacePolicy(inspection: WorkspaceInspectionState) {
  const client = useBatchPlaneClient();
  const generation = useRef(0);
  const [state, setState] = useState<PolicyRequestState>({ type: "idle" });
  const [selectedMode, setSelectedMode] = useState<WorkspaceApprovalMode>();
  const activeState =
    state.type === "idle" || state.revision === inspection.revision
      ? state
      : { type: "idle" as const };
  const currentPolicy =
    activeState.type === "success"
      ? activeState.result.currentPolicy
      : inspection.type === "loaded"
        ? inspection.data.policy
        : undefined;
  const mode =
    inspection.type === "loaded"
      ? (selectedMode ??
        currentPolicy?.approval.mode ??
        "SELF_APPROVAL_BLOCKED")
      : "SELF_APPROVAL_BLOCKED";

  useEffect(() => {
    generation.current++;
    setState({ type: "idle" });
    setSelectedMode(undefined);
    return () => {
      generation.current += 1;
    };
  }, [client, inspection.revision]);

  async function request() {
    if (inspection.type !== "loaded") {
      return;
    }
    const operation = ++generation.current;
    const revision = inspection.revision;
    try {
      setState({ type: "creating", revision });
      const result = await client.requestWorkspacePolicyChange({
        policy: { approval: { mode } },
      });
      if (generation.current === operation)
        setState({ type: "success", result, revision });
    } catch (error) {
      if (generation.current === operation)
        setState({ type: "error", error, revision });
    }
  }

  return {
    state: activeState,
    mode,
    setMode: setSelectedMode,
    currentPolicy,
    request,
  };
}
