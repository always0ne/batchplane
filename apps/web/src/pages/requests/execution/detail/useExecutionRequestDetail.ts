import {
  isWorkspaceNotConnectedError,
  type ExecutionRequest,
} from "@batchplane/ui-client";
import { useCallback, useEffect, useRef, useState } from "react";

import { useBatchPlaneClient } from "../../../../client/batch-plane-client-context";

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
  const readGeneration = useRef(0);
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
    const currentReadGeneration = readGeneration.current + 1;
    readGeneration.current = currentReadGeneration;
    const keepInitialRequest = Boolean(initialRequest) && refreshVersion === 0;
    if (!keepInitialRequest) setState({ type: "loading" });
    setActionError(null);
    setCompletedAction(undefined);

    void client
      .getExecutionRequest({ requestLocator })
      .then((request) => {
        if (readGeneration.current !== currentReadGeneration) return;
        const selected = selectReadResult(
          request,
          authoritativeRequest.current,
        );
        authoritativeRequest.current = selected.authoritativeRequest;
        setState(selected.state);
      })
      .catch((error) => {
        if (readGeneration.current !== currentReadGeneration) return;
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
      if (readGeneration.current === currentReadGeneration) {
        readGeneration.current += 1;
      }
    };
  }, [client, initialRequest, refreshVersion, requestLocator]);

  const applyAction = useCallback(
    async (action: ExecutionRequestAction, rejectionReason = "") => {
      if (actionInFlight.current) return false;
      const currentReadGeneration = readGeneration.current;
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
          readGeneration.current !== currentReadGeneration ||
          actionEpoch.current !== currentActionEpoch
        ) {
          return false;
        }
        readGeneration.current += 1;
        authoritativeRequest.current = request;
        setState({ readState: "current", request, type: "loaded" });
        setCompletedAction(action);
        return true;
      } catch (error) {
        if (
          readGeneration.current !== currentReadGeneration ||
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

function selectReadResult(
  request: ExecutionRequest | null,
  authoritativeRequest: ExecutionRequest | null,
): {
  authoritativeRequest: ExecutionRequest | null;
  state: ExecutionRequestDetailState;
} {
  if (!request) {
    return {
      authoritativeRequest,
      state: authoritativeRequest
        ? {
            readState: "pending",
            request: authoritativeRequest,
            type: "loaded",
          }
        : { type: "not-found" },
    };
  }

  if (authoritativeRequest && delayedRead(authoritativeRequest, request)) {
    return {
      authoritativeRequest,
      state: {
        readState: "pending",
        request: authoritativeRequest,
        type: "loaded",
      },
    };
  }

  return {
    authoritativeRequest:
      request.status === "REQUESTED" ? authoritativeRequest : request,
    state: { readState: "current", request, type: "loaded" },
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
