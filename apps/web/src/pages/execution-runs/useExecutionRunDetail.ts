import {
  isWorkspaceNotConnectedError,
  type ExecutionRunPresentation,
} from "@batchplane/ui-client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBatchPlaneClient } from "../../client/batch-plane-client-context";

export type ExecutionRunDetailState =
  | { type: "loading" }
  | { type: "no-session" }
  | { type: "not-found"; runId: string }
  | { type: "error"; error: unknown }
  | { type: "loaded"; run: ExecutionRunPresentation; refreshError?: unknown };

export function useExecutionRunDetail(
  runId: string,
  attemptParameter: string | null,
) {
  const client = useBatchPlaneClient();
  const scope = useMemo(
    () => ({ client, runId, attemptParameter }),
    [client, runId, attemptParameter],
  );
  const version = useRef(0);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    scope: typeof scope;
    state: ExecutionRunDetailState;
  }>();
  useEffect(() => {
    const requestVersion = ++version.current;
    let active = true;
    async function load() {
      try {
        const runAttempt =
          attemptParameter === null ? undefined : Number(attemptParameter);
        const validAttempt =
          runAttempt === undefined ||
          (Number.isSafeInteger(runAttempt) && runAttempt > 0);
        const run = validAttempt
          ? await client.getExecutionRun({
              runId,
              ...(runAttempt === undefined ? {} : { runAttempt }),
            })
          : null;
        if (active && version.current === requestVersion) {
          setResult({
            scope,
            state: run ? { type: "loaded", run } : { type: "not-found", runId },
          });
        }
      } catch (error) {
        if (!active || version.current !== requestVersion) return;
        setResult((current) => {
          if (current?.scope === scope && current.state.type === "loaded") {
            return { scope, state: { ...current.state, refreshError: error } };
          }
          return {
            scope,
            state: isWorkspaceNotConnectedError(error)
              ? { type: "no-session" }
              : { type: "error", error },
          };
        });
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [scope, client, runId, attemptParameter, revision]);
  const acceptRunUpdate = useCallback(
    (update: (run: ExecutionRunPresentation) => ExecutionRunPresentation) => {
      // A confirmed write is newer authority than an already-started read.
      version.current += 1;
      setResult((current) =>
        current?.scope === scope && current.state.type === "loaded"
          ? { scope, state: { type: "loaded", run: update(current.state.run) } }
          : current,
      );
    },
    [scope],
  );
  return {
    state:
      result?.scope === scope ? result.state : ({ type: "loading" } as const),
    refresh: () => setRevision((value) => value + 1),
    acceptRunUpdate,
  };
}
