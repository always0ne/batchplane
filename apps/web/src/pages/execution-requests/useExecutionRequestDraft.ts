import {
  isWorkspaceNotConnectedError,
  type ExecutionRequestDraft,
} from "@batchplane/ui-client";
import { useEffect, useRef, useState } from "react";

import { useBatchPlaneClient } from "../../client/batch-plane-client-context";

export type ExecutionRequestDraftState =
  | { type: "loading" }
  | { type: "workspace-not-connected" }
  | { type: "not-found" }
  | { draft: ExecutionRequestDraft; type: "loaded" }
  | { message: string; type: "error" };

export function useExecutionRequestDraft(batchId: string) {
  const client = useBatchPlaneClient();
  const version = useRef(0);
  const [state, setState] = useState<ExecutionRequestDraftState>({
    type: "loading",
  });

  useEffect(() => {
    const requestVersion = version.current + 1;
    version.current = requestVersion;
    setState({ type: "loading" });

    void client
      .loadExecutionRequestDraft({ batchId })
      .then((result) => {
        if (version.current === requestVersion) {
          setState(
            result.type === "not-found"
              ? { type: "not-found" }
              : { draft: result.draft, type: "loaded" },
          );
        }
      })
      .catch((error) => {
        if (version.current !== requestVersion) return;
        if (isWorkspaceNotConnectedError(error)) {
          setState({ type: "workspace-not-connected" });
          return;
        }
        setState({ message: messageFrom(error), type: "error" });
      });

    return () => {
      if (version.current === requestVersion) version.current += 1;
    };
  }, [batchId, client]);

  return state;
}

function messageFrom(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : "";
}
