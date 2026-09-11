import type {
  ExecutionRequestInput,
  ExecutionRequestPreview,
} from "@batchplane/ui-client";
import { useEffect, useRef, useState } from "react";

import { useBatchPlaneClient } from "../../client/batch-plane-client-context";

export type ExecutionRequestPreviewState =
  | { type: "idle" }
  | { type: "loading" }
  | { preview: ExecutionRequestPreview; type: "ready" }
  | { message: string; type: "error" };

export function useExecutionRequestPreview({
  input,
  isReady,
}: {
  input: ExecutionRequestInput;
  isReady: boolean;
}) {
  const client = useBatchPlaneClient();
  const version = useRef(0);
  const [state, setState] = useState<ExecutionRequestPreviewState>({
    type: "idle",
  });

  useEffect(() => {
    const requestVersion = version.current + 1;
    version.current = requestVersion;

    if (!isReady) {
      setState({ type: "idle" });
      return;
    }

    setState({ type: "loading" });
    void client
      .previewExecutionRequest(input)
      .then((preview) => {
        if (version.current === requestVersion) {
          setState({ preview, type: "ready" });
        }
      })
      .catch((error) => {
        if (version.current === requestVersion) {
          setState({ message: messageFrom(error), type: "error" });
        }
      });

    return () => {
      if (version.current === requestVersion) version.current += 1;
    };
  }, [client, input, isReady]);

  return state;
}

function messageFrom(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : "";
}
