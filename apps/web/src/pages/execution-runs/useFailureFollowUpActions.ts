import type {
  BatchPlaneClient,
  ExecutionRunPresentation,
} from "@batchplane/ui-client";
import { useCallback, useEffect, useRef } from "react";

export function useFailureFollowUpActions(
  client: BatchPlaneClient,
  runId: string,
  acceptRunUpdate: (
    update: (run: ExecutionRunPresentation) => ExecutionRunPresentation,
  ) => void,
) {
  const lifetime = useRef({ active: true, pending: new Set<string>() });
  useEffect(() => {
    const current = { active: true, pending: new Set<string>() };
    lifetime.current = current;
    return () => {
      current.active = false;
    };
  }, [client, runId, acceptRunUpdate]);
  const record = useCallback(
    async (
      input: Omit<
        Parameters<BatchPlaneClient["createFailureFollowUp"]>[0],
        "runId"
      >,
    ) => {
      const current = lifetime.current;
      if (!current.active || current.pending.has("record")) return;
      current.pending.add("record");
      try {
        const followUp = await client.createFailureFollowUp({
          ...input,
          runId,
        });
        if (current.active)
          acceptRunUpdate((run) => ({
            ...run,
            failureFollowUps: [
              ...(run.failureFollowUps ?? []).filter(
                (item) => item.followUpId !== followUp.followUpId,
              ),
              followUp,
            ],
          }));
      } finally {
        current.pending.delete("record");
      }
    },
    [client, runId, acceptRunUpdate],
  );
  const review = useCallback(
    async (
      input: Omit<
        Parameters<BatchPlaneClient["reviewFailureFollowUp"]>[0],
        "runId"
      >,
    ) => {
      const current = lifetime.current;
      if (!current.active || current.pending.has(input.followUpId)) return;
      current.pending.add(input.followUpId);
      try {
        const decision = await client.reviewFailureFollowUp({
          ...input,
          runId,
        });
        if (current.active)
          acceptRunUpdate((run) => ({
            ...run,
            failureFollowUps: (run.failureFollowUps ?? []).map((item) =>
              item.followUpId === decision.followUpId
                ? {
                    ...item,
                    reviewStatus: decision.decision,
                    reviews: [
                      ...item.reviews.filter(
                        (review) => review.reviewId !== decision.reviewId,
                      ),
                      decision,
                    ],
                  }
                : item,
            ),
          }));
      } finally {
        current.pending.delete(input.followUpId);
      }
    },
    [client, runId, acceptRunUpdate],
  );
  return { record, review };
}
