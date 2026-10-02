import type {
  WorkspaceApprovalMode,
  WorkspacePolicy,
  WorkspacePolicyRequest,
} from "@batchplane/ui-client";
import { useEffect, useRef, useState } from "react";
import { useBatchPlaneClient } from "../../../client/batch-plane-client-context";
import type { WorkspaceInspectionState } from "./useWorkspaceInspection";

export type PolicyRequestState =
  | { type: "idle" }
  | { type: "creating"; revision: number }
  | { type: "success"; result: WorkspacePolicyRequest; revision: number }
  | { type: "error"; error: unknown; revision: number };

export function useWorkspacePolicy(inspection: WorkspaceInspectionState) {
  const client = useBatchPlaneClient();
  const generation = useRef(0);
  const [requestState, setRequestState] = useState<PolicyRequestState>({
    type: "idle",
  });
  const [modeOverride, setModeOverride] = useState<WorkspaceApprovalMode>();
  const currentRequestState =
    requestState.type === "idle" ||
    requestState.revision === inspection.revision
      ? requestState
      : { type: "idle" as const };

  let currentPolicy: WorkspacePolicy | undefined;
  if (currentRequestState.type === "success") {
    currentPolicy = currentRequestState.result.currentPolicy;
  } else if (inspection.type === "loaded") {
    currentPolicy = inspection.data.policy;
  }

  let selectedMode: WorkspaceApprovalMode = "SELF_APPROVAL_BLOCKED";
  if (inspection.type === "loaded") {
    selectedMode = modeOverride ?? currentPolicy?.approval.mode ?? selectedMode;
  }

  useEffect(() => {
    generation.current++;
    setRequestState({ type: "idle" });
    setModeOverride(undefined);
    return () => {
      generation.current += 1;
    };
  }, [client, inspection.revision]);

  async function createRequest() {
    if (inspection.type !== "loaded") {
      return;
    }
    const operation = ++generation.current;
    const revision = inspection.revision;
    try {
      setRequestState({ type: "creating", revision });
      const result = await client.requestWorkspacePolicyChange({
        policy: { approval: { mode: selectedMode } },
      });
      if (generation.current === operation)
        setRequestState({ type: "success", result, revision });
    } catch (error) {
      if (generation.current === operation)
        setRequestState({ type: "error", error, revision });
    }
  }

  return {
    requestState: currentRequestState,
    selectedMode,
    setSelectedMode: setModeOverride,
    currentPolicy,
    createRequest,
  };
}
