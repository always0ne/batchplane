import type { BatchChangeDraft } from "@batchplane/ui-client";
import { useCallback, useState } from "react";

import { useBatchPlaneClient } from "../../client/batch-plane-client-context";
import type { BatchChangePreviewState } from "./useBatchChangePreview";

export type BatchChangeSubmissionState = "idle" | "submitting" | "error";

export function useBatchChangeSubmission({
  draft,
  missingFields,
  previewState,
}: {
  draft: BatchChangeDraft;
  missingFields: string[];
  previewState: BatchChangePreviewState;
}) {
  const client = useBatchPlaneClient();
  const [state, setState] = useState<BatchChangeSubmissionState>("idle");
  const [error, setError] = useState("");

  const submit = useCallback(async () => {
    if (missingFields.length > 0 || previewState.type !== "ready") return null;
    if (!previewState.preview.hasEffectiveChanges) return null;

    setState("submitting");
    setError("");
    try {
      const result = await client.createBatchChangeRequest(draft);
      setState("idle");
      return result.request.requestLocator;
    } catch (submitError) {
      setError(messageFrom(submitError));
      setState("error");
      return null;
    }
  }, [client, draft, missingFields.length, previewState]);

  return { error, state, submit };
}

function messageFrom(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : "";
}
