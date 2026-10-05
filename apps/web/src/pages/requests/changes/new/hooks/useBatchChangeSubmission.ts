import type { BatchChangeDraft } from "@batchplane/ui-client";
import { useCallback, useEffect, useRef, useState } from "react";

import { useBatchPlaneClient } from "../../../../../client/batch-plane-client-context";
import type { BatchChangePreviewState } from "./useBatchChangePreview";

export type BatchChangeSubmissionState = "idle" | "submitting" | "error";

export function useBatchChangeSubmission({
  artifactBlocked,
  draft,
  missingFields,
  previewState,
}: {
  artifactBlocked: boolean;
  draft: BatchChangeDraft;
  missingFields: string[];
  previewState: BatchChangePreviewState;
}) {
  const client = useBatchPlaneClient();
  const [state, setState] = useState<BatchChangeSubmissionState>("idle");
  const [error, setError] = useState("");
  const lifetime = useRef({ active: true });
  useEffect(() => {
    const current = { active: true };
    lifetime.current = current;
    setState("idle");
    setError("");
    return () => {
      current.active = false;
    };
  }, [client]);

  const submit = useCallback(async () => {
    const current = lifetime.current;
    if (
      !current.active ||
      artifactBlocked ||
      missingFields.length > 0 ||
      previewState.type !== "ready"
    )
      return null;
    if (!previewState.preview.hasEffectiveChanges) return null;

    setState("submitting");
    setError("");
    try {
      const result = await client.createBatchChangeRequest(draft);
      if (!current.active) return null;
      setState("idle");
      return result.request.requestLocator;
    } catch (submitError) {
      if (!current.active) return null;
      setError(messageFrom(submitError));
      setState("error");
      return null;
    }
  }, [artifactBlocked, client, draft, missingFields.length, previewState]);

  return { error, state, submit };
}

function messageFrom(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : "";
}
