import {
  isWorkspaceNotConnectedError,
  type ExecutionRequest,
} from "@batchplane/ui-client";
import { useCallback, useEffect, useRef, useState } from "react";

import { useBatchPlaneClient } from "../../client/batch-plane-client-context";

export type ExecutionRequestDetailState =
  | { type: "loading" }
  | { type: "workspace-not-connected" }
  | { type: "not-found" }
  | {
      readState: "current" | "pending" | "unavailable";
      request: ExecutionRequest;
      type: "loaded";
    }
  | { message: string; type: "error" };

export type ExecutionRequestAction = "approve" | "reject";

export function useExecutionRequestDetail({
  initialRequest,
  requestLocator,
}: {
  initialRequest: ExecutionRequest | null;
  requestLocator: string;
}) {
  const client = useBatchPlaneClient();
  const version = useRef(0);
  const actionEpoch = useRef(0);
  const actionInFlight = useRef(false);
  const authoritativeRequest = useRef<ExecutionRequest | null>(initialRequest);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [state, setState] = useState<ExecutionRequestDetailState>(() =>
    initialRequest
      ? { readState: "pending", request: initialRequest, type: "loaded" }
      : { type: "loading" },
  );
  const [runningAction, setRunningAction] = useState<ExecutionRequestAction>();
  const [actionError, setActionError] = useState<{
    message: string;
    type: "error";
  } | null>(null);
  const [completedAction, setCompletedAction] =
    useState<ExecutionRequestAction>();

  useEffect(() => {
    actionEpoch.current += 1;
    actionInFlight.current = false;
    authoritativeRequest.current = initialRequest;

    return () => {
      actionEpoch.current += 1;
      actionInFlight.current = false;
    };
  }, [client, initialRequest, requestLocator]);

  useEffect(() => {
    const requestVersion = version.current + 1;
    version.current = requestVersion;
    const keepInitialRequest = Boolean(initialRequest) && refreshVersion === 0;
    if (!keepInitialRequest) setState({ type: "loading" });
    setActionError(null);
    setCompletedAction(undefined);

    void client
      .getExecutionRequest({ requestLocator })
      .then((request) => {
        if (version.current !== requestVersion) return;
        const retainedRequest = authoritativeRequest.current;
        if (!request && retainedRequest) {
          setState({
            readState: "pending",
            request: retainedRequest,
            type: "loaded",
          });
          return;
        }
        if (!request) {
          setState({ type: "not-found" });
          return;
        }
        if (delayedRead(retainedRequest, request)) {
          setState({
            readState: "pending",
            request: retainedRequest!,
            type: "loaded",
          });
          return;
        }
        if (request.status !== "REQUESTED") {
          authoritativeRequest.current = request;
        }
        setState({ readState: "current", request, type: "loaded" });
      })
      .catch((error) => {
        if (version.current !== requestVersion) return;
        if (isWorkspaceNotConnectedError(error)) {
          setState({ type: "workspace-not-connected" });
          return;
        }
        if (authoritativeRequest.current) {
          setState({
            readState: "unavailable",
            request: authoritativeRequest.current,
            type: "loaded",
          });
        } else {
          setState({ message: messageFrom(error), type: "error" });
        }
      });

    return () => {
      if (version.current === requestVersion) version.current += 1;
    };
  }, [client, initialRequest, refreshVersion, requestLocator]);

  const applyAction = useCallback(
    async (action: ExecutionRequestAction, rejectionReason = "") => {
      if (actionInFlight.current) return false;
      const requestVersion = version.current;
      const currentActionEpoch = actionEpoch.current;
      actionInFlight.current = true;
      setRunningAction(action);
      setActionError(null);
      setCompletedAction(undefined);
      try {
        const request =
          action === "approve"
            ? await client.approveExecutionRequest({ requestLocator })
            : await client.rejectExecutionRequest({
                reason: rejectionReason,
                requestLocator,
              });
        if (
          version.current !== requestVersion ||
          actionEpoch.current !== currentActionEpoch
        ) {
          return false;
        }
        version.current += 1;
        authoritativeRequest.current = request;
        setState({ readState: "current", request, type: "loaded" });
        setCompletedAction(action);
        return true;
      } catch (error) {
        if (
          version.current !== requestVersion ||
          actionEpoch.current !== currentActionEpoch
        ) {
          return false;
        }
        setActionError({ message: messageFrom(error), type: "error" });
        return false;
      } finally {
        if (actionEpoch.current === currentActionEpoch) {
          actionInFlight.current = false;
          setRunningAction(undefined);
        }
      }
    },
    [client, requestLocator],
  );

  const refresh = useCallback(() => {
    setRefreshVersion((currentVersion) => currentVersion + 1);
  }, []);

  return {
    actionError,
    applyAction,
    completedAction,
    refresh,
    runningAction,
    state,
  };
}

function delayedRead(
  authoritativeRequest: ExecutionRequest | null,
  request: ExecutionRequest,
): boolean {
  return Boolean(
    authoritativeRequest &&
    authoritativeRequest.status !== "REQUESTED" &&
    request.status === "REQUESTED" &&
    authoritativeRequest.requestLocator === request.requestLocator &&
    authoritativeRequest.requestId === request.requestId &&
    authoritativeRequest.evidence.requestDigest ===
      request.evidence.requestDigest,
  );
}

function messageFrom(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : "";
}
