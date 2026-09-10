import type { BatchRemediationKind } from "@batchplane/ui-client";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useBatchPlaneClient } from "../../client/batch-plane-client-context";

export function useBatchRemediation(batchId: string, errorFallback: string) {
  const client = useBatchPlaneClient();
  const navigate = useNavigate();
  const [runningKind, setRunningKind] = useState<BatchRemediationKind>();
  const [error, setError] = useState("");
  const request = useCallback(
    async (kind: BatchRemediationKind) => {
      if (runningKind) return;
      setRunningKind(kind);
      setError("");
      try {
        const result = await client.requestBatchRemediation({ batchId, kind });
        navigate(
          `/approvals/registration/${encodeURIComponent(result.request.requestLocator)}`,
        );
      } catch (requestError) {
        setError(
          requestError instanceof Error && requestError.message.trim()
            ? requestError.message
            : errorFallback,
        );
      } finally {
        setRunningKind(undefined);
      }
    },
    [batchId, client, errorFallback, navigate, runningKind],
  );

  return { error, request, runningKind };
}
