import type { BatchRemediationKind } from "@batchplane/ui-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { useBatchPlaneClient } from "../../../../client/batch-plane-client-context";

export function useBatchRemediation(batchId: string, errorFallback: string) {
  const client = useBatchPlaneClient();
  const navigate = useNavigate();
  const [runningKind, setRunningKind] = useState<BatchRemediationKind>();
  const [error, setError] = useState("");
  const lifetime = useRef({ active: true });
  useEffect(() => {
    const current = { active: true };
    lifetime.current = current;
    setRunningKind(undefined);
    setError("");
    return () => {
      current.active = false;
    };
  }, [batchId, client]);
  const request = useCallback(
    async (kind: BatchRemediationKind) => {
      const current = lifetime.current;
      if (!current.active || runningKind) return;
      setRunningKind(kind);
      setError("");
      try {
        const result = await client.requestBatchRemediation({ batchId, kind });
        if (!current.active) return;
        navigate(
          `/approvals/registration/${encodeURIComponent(result.request.requestLocator)}`,
        );
      } catch (requestError) {
        if (!current.active) return;
        setError(
          requestError instanceof Error && requestError.message.trim()
            ? requestError.message
            : errorFallback,
        );
      } finally {
        if (current.active) setRunningKind(undefined);
      }
    },
    [batchId, client, errorFallback, navigate, runningKind],
  );

  return { error, request, runningKind };
}
