import type {
  WorkspaceApprovalMode,
  WorkspacePolicyRequest,
} from "@batchplane/ui-client";
import { useEffect, useRef, useState } from "react";
import { useBatchPlaneClient } from "../../client/batch-plane-client-context";
import type { WorkspaceInspectionState } from "./useWorkspaceInspection";

type PolicyRequestState =
  | { type: "idle" }
  | { type: "creating" }
  | { type: "success"; result: WorkspacePolicyRequest }
  | { type: "error"; error: unknown };

export function useWorkspacePolicy(
  inspection: WorkspaceInspectionState,
  prepareRequest: () => void,
) {
  const client = useBatchPlaneClient();
  const generation = useRef(0);
  const [state, setState] = useState<PolicyRequestState>({ type: "idle" });
  const [selectedMode, setSelectedMode] = useState<WorkspaceApprovalMode>();
  const currentPolicy =
    state.type === "success"
      ? state.result.currentPolicy
      : inspection.type === "loaded"
        ? inspection.data.policy
        : undefined;
  const mode =
    selectedMode ?? currentPolicy?.approval.mode ?? "SELF_APPROVAL_BLOCKED";

  useEffect(() => {
    generation.current++;
    setState({ type: "idle" });
    setSelectedMode(undefined);
    return () => {
      generation.current += 1;
    };
  }, [client, inspection.revision]);

  async function request() {
    const operation = ++generation.current;
    try {
      prepareRequest();
      setState({ type: "creating" });
      const result = await client.requestWorkspacePolicyChange({
        policy: { approval: { mode } },
      });
      if (generation.current === operation)
        setState({ type: "success", result });
    } catch (error) {
      if (generation.current === operation) setState({ type: "error", error });
    }
  }

  return { state, mode, setMode: setSelectedMode, currentPolicy, request };
}
