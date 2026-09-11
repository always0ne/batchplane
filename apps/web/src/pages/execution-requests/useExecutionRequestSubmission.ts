import type {
  ExecutionRequestInput,
  CreateExecutionRequestResult,
} from "@batchplane/ui-client";
import { useCallback, useEffect, useRef, useState } from "react";

import { useBatchPlaneClient } from "../../client/batch-plane-client-context";

export type ExecutionRequestSubmissionState =
  | { type: "idle" }
  | { type: "submitting" }
  | { message: string; type: "error" };

export function useExecutionRequestSubmission(lifetimeKey: string) {
  const client = useBatchPlaneClient();
  const inFlight = useRef(false);
  const lifetime = useRef(0);
  const [state, setState] = useState<ExecutionRequestSubmissionState>({
    type: "idle",
  });

  useEffect(() => {
    const currentLifetime = lifetime.current + 1;
    lifetime.current = currentLifetime;
    inFlight.current = false;
    setState({ type: "idle" });
    return () => {
      if (lifetime.current === currentLifetime) lifetime.current += 1;
    };
  }, [client, lifetimeKey]);

  const submit = useCallback(
    async (
      input: ExecutionRequestInput,
    ): Promise<CreateExecutionRequestResult | null> => {
      if (inFlight.current) return null;
      const currentLifetime = lifetime.current;
      inFlight.current = true;
      setState({ type: "submitting" });
      try {
        const result = await client.createExecutionRequest(input);
        if (lifetime.current !== currentLifetime) return null;
        setState({ type: "idle" });
        return result;
      } catch (error) {
        if (lifetime.current !== currentLifetime) return null;
        setState({ message: messageFrom(error), type: "error" });
        return null;
      } finally {
        if (lifetime.current === currentLifetime) inFlight.current = false;
      }
    },
    [client],
  );

  return { state, submit };
}

function messageFrom(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : "";
}
