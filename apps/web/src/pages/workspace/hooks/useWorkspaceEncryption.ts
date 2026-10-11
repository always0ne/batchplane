import { useEffect, useRef, useState } from "react";
import type {
  BatchListError,
  WorkspaceEncryptionStatus,
  WorkspaceEncryptionSetupResult,
} from "@batchplane/ui-client";
import { useBatchPlaneClient } from "../../../client/batch-plane-client-context";
import type { WorkspaceInspectionState } from "./useWorkspaceInspection";

type EncryptionState =
  | { type: "idle" }
  | { type: "loading"; revision: number }
  | { type: "error"; error: unknown; revision: number }
  | {
      type: "loaded";
      status: WorkspaceEncryptionStatus;
      revision: number;
      uploadError?: BatchListError;
      failureStage?: WorkspaceEncryptionSetupResult["failureStage"];
    };

export function useWorkspaceEncryption(inspection: WorkspaceInspectionState) {
  const client = useBatchPlaneClient();
  const generation = useRef(0);
  const busy = useRef(false);
  const [state, setState] = useState<EncryptionState>({ type: "idle" });
  const [initializing, setInitializing] = useState(false);
  const currentState =
    state.type === "idle" || state.revision === inspection.revision
      ? state
      : { type: "idle" as const };

  useEffect(() => {
    const operation = ++generation.current;
    busy.current = false;
    setInitializing(false);
    if (inspection.type !== "loaded") {
      setState({ type: "idle" });
    } else {
      const revision = inspection.revision;
      setState({ type: "loading", revision });
      void client.inspectWorkspaceEncryption().then(
        (status) => {
          if (generation.current === operation)
            setState({ type: "loaded", status, revision });
        },
        (error: unknown) => {
          if (generation.current === operation)
            setState({ type: "error", error, revision });
        },
      );
    }
    return () => {
      generation.current += 1;
    };
  }, [client, inspection.type, inspection.revision]);

  async function initialize() {
    if (
      busy.current ||
      inspection.type !== "loaded" ||
      currentState.type !== "loaded" ||
      (!currentState.status.canInitialize &&
        !currentState.status.canRetryUpload)
    )
      return;
    busy.current = true;
    const operation = ++generation.current;
    const revision = inspection.revision;
    setInitializing(true);
    try {
      const result = await client.initializeWorkspaceEncryption();
      if (generation.current === operation)
        setState({
          type: "loaded",
          status: result.status,
          revision,
          ...(result.error ? { uploadError: result.error } : {}),
          ...(result.failureStage ? { failureStage: result.failureStage } : {}),
        });
    } catch (error) {
      if (generation.current === operation)
        setState({ type: "error", error, revision });
    } finally {
      if (generation.current === operation) {
        busy.current = false;
        setInitializing(false);
      }
    }
  }

  return { state: currentState, initializing, initialize };
}
