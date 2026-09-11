import { act, renderHook, waitFor } from "@testing-library/react";
import type { BatchChangeDraft, BatchPlaneClient } from "@batchplane/ui-client";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { BatchPlaneClientContext } from "../../client/batch-plane-client-context";
import { useBatchChangePreview } from "./useBatchChangePreview";

describe("useBatchChangePreview", () => {
  it("keeps the newest preview when the previous draft completes late", async () => {
    const firstPreview = deferred();
    const secondPreview = deferred();
    const previewBatchChange = vi
      .fn()
      .mockReturnValueOnce(firstPreview.promise)
      .mockReturnValueOnce(secondPreview.promise);
    const client = { previewBatchChange } as unknown as BatchPlaneClient;
    const { result, rerender } = renderHook(
      ({ draft }) => useBatchChangePreview({ draft, isReady: true }),
      {
        initialProps: { draft: draft("first") },
        wrapper: createClientProvider(client),
      },
    );

    await waitFor(() => expect(previewBatchChange).toHaveBeenCalledTimes(1));
    rerender({ draft: draft("second") });
    await waitFor(() => expect(previewBatchChange).toHaveBeenCalledTimes(2));

    await act(async () => {
      secondPreview.resolve(preview("sha256:second"));
    });
    expect(result.current).toEqual({
      preview: preview("sha256:second"),
      type: "ready",
    });

    await act(async () => {
      firstPreview.resolve(preview("sha256:first"));
    });
    expect(result.current).toEqual({
      preview: preview("sha256:second"),
      type: "ready",
    });
  });
});

function createClientProvider(client: BatchPlaneClient) {
  return function BatchPlaneClientTestProvider({
    children,
  }: {
    children: ReactNode;
  }) {
    return (
      <BatchPlaneClientContext.Provider value={client}>
        {children}
      </BatchPlaneClientContext.Provider>
    );
  };
}

function draft(batchId: string): BatchChangeDraft {
  return {
    batch: {
      batchId,
      criticality: "MEDIUM",
      domain: "payments",
      environment: "PROD",
      name: "Daily close",
      owner: "ops-team",
      runCommand: "echo close",
      runnerLabel: "ubuntu-latest",
      status: "ACTIVE",
      workflowRef: "main",
    },
    mode: "create",
    schedules: [],
  };
}

function preview(targetRevisionDigest: string) {
  return {
    files: [],
    hasEffectiveChanges: true,
    targetRevisionDigest,
  };
}

function deferred() {
  let resolve: (value: ReturnType<typeof preview>) => void = () => undefined;
  const promise = new Promise<ReturnType<typeof preview>>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}
