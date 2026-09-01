import { act, renderHook, waitFor } from "@testing-library/react";
import type { BatchListResult, BatchPlaneClient } from "@batchplane/ui-client";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { BatchPlaneClientContext } from "../../client/batch-plane-client-context";
import { useBatchList } from "./useBatchList";

describe("useBatchList", () => {
  it("keeps the latest refresh result when an earlier request completes late", async () => {
    const firstResponse = createDeferred<BatchListResult>();
    const secondResponse = createDeferred<BatchListResult>();
    const listBatches = vi
      .fn()
      .mockReturnValueOnce(firstResponse.promise)
      .mockReturnValueOnce(secondResponse.promise);
    const client: BatchPlaneClient = { listBatches };
    const { result } = renderHook(
      () => useBatchList("Unable to load batches."),
      {
        wrapper: createClientProvider(client),
      },
    );

    await waitFor(() => expect(listBatches).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => expect(listBatches).toHaveBeenCalledTimes(2));

    await act(async () => {
      secondResponse.resolve(createLoadedResult("Latest Daily Close"));
    });

    await waitFor(() => {
      expect(result.current.state).toEqual(
        createLoadedResult("Latest Daily Close"),
      );
    });

    await act(async () => {
      firstResponse.resolve(createLoadedResult("Stale Daily Close"));
    });

    expect(result.current.state).toEqual(
      createLoadedResult("Latest Daily Close"),
    );
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

function createLoadedResult(name: string): BatchListResult {
  return {
    batches: [
      {
        batchId: "payment.daily-close",
        criticality: "HIGH",
        environment: "PROD",
        gateRequired: true,
        hasExecutableCommand: true,
        name,
        owner: "ops-team",
        status: "ACTIVE",
      },
    ],
    sourceRevision: "main",
    type: "loaded",
  };
}

function createDeferred<Value>() {
  let resolve: (value: Value) => void = () => undefined;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}
