import type {
  BatchChangeDraft,
  GovernedChangePreview,
} from "@batchplane/ui-client";
import { useEffect, useState } from "react";

import { useBatchPlaneClient } from "../../client/batch-plane-client-context";

export type BatchChangePreviewState =
  | { type: "idle" }
  | { type: "loading" }
  | { preview: GovernedChangePreview; type: "ready" }
  | { message: string; type: "error" };

export function useBatchChangePreview({
  draft,
  isReady,
}: {
  draft: BatchChangeDraft;
  isReady: boolean;
}) {
  const client = useBatchPlaneClient();
  const [state, setState] = useState<BatchChangePreviewState>({
    type: "idle",
  });

  useEffect(() => {
    if (!isReady) {
      setState({ type: "idle" });
      return;
    }

    let isCurrent = true;
    setState({ type: "loading" });
    void client
      .previewBatchChange(draft)
      .then((preview) => {
        if (isCurrent) setState({ preview, type: "ready" });
      })
      .catch((error) => {
        if (isCurrent) setState({ message: messageFrom(error), type: "error" });
      });

    return () => {
      isCurrent = false;
    };
  }, [client, draft, isReady]);

  return state;
}

function messageFrom(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : "";
}
