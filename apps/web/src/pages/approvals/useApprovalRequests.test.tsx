import { act, renderHook, waitFor } from "@testing-library/react";
import type {
  ApprovalRequestInventory,
  BatchPlaneClient,
} from "@batchplane/ui-client";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { BatchPlaneClientContext } from "../../client/batch-plane-client-context";
import { useApprovalRequests } from "./useApprovalRequests";

describe("useApprovalRequests", () => {
  it("keeps the latest refresh result when an earlier inventory response completes late", async () => {
    const firstResponse = deferred<ApprovalRequestInventory>();
    const secondResponse = deferred<ApprovalRequestInventory>();
    const listApprovalRequests = vi
      .fn()
      .mockReturnValueOnce(firstResponse.promise)
      .mockReturnValueOnce(secondResponse.promise);
    const { result } = renderHook(() => useApprovalRequests(), {
      wrapper: clientProvider(createClient({ listApprovalRequests })),
    });

    await waitFor(() => expect(listApprovalRequests).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => expect(listApprovalRequests).toHaveBeenCalledTimes(2));

    await act(async () => {
      secondResponse.resolve(inventory("Latest request"));
    });

    await waitFor(() => {
      expect(result.current.state).toEqual({
        inventory: inventory("Latest request"),
        type: "loaded",
      });
    });

    await act(async () => {
      firstResponse.resolve(inventory("Stale request"));
    });

    expect(result.current.state).toEqual({
      inventory: inventory("Latest request"),
      type: "loaded",
    });
  });
});

function clientProvider(client: BatchPlaneClient) {
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

function createClient(
  overrides: Partial<BatchPlaneClient> = {},
): BatchPlaneClient {
  return {
    approveExecutionRequest: unsupported,
    approveGovernedChange: unsupported,
    createBatchChangeRequest: unsupported,
    createExecutionRequest: unsupported,
    getBatchChangeBlocker: unsupported,
    getBatchDetail: unsupported,
    getBatchRemediationCapability: unsupported,
    getExecutionRequest: unsupported,
    getGovernedChange: unsupported,
    getMyWork: unsupported,
    listApprovalRequests: unsupported,
    listBatches: unsupported,
    listWorkspaceRequests: unsupported,
    loadBatchChangeDraft: unsupported,
    loadExecutionRequestDraft: unsupported,
    previewBatchChange: unsupported,
    previewExecutionRequest: unsupported,
    rejectExecutionRequest: unsupported,
    rejectGovernedChange: unsupported,
    requestBatchRemediation: unsupported,
    withdrawGovernedChange: unsupported,
    ...overrides,
  };
}

async function unsupported(): Promise<never> {
  throw new Error("This operation is not used by this hook test.");
}

function inventory(title: string): ApprovalRequestInventory {
  return {
    requests: [
      {
        actor: "developer",
        kind: "EXECUTION",
        request: {
          attempts: { attempts: [], type: "loaded" },
          batch: {
            criticality: "HIGH",
            domain: "payments",
            environment: "PROD",
            name: "Daily Close",
            owner: "ops-team",
          },
          batchId: "payment.daily-close",
          capability: { canApprove: true, canReject: true },
          evidence: {
            approvedBatchRevision: null,
            canonicalPayload: null,
            requestDigest: "sha256:request",
          },
          execution: {
            command: "echo mock batch",
            gateRequired: true,
            runsOn: "ubuntu-latest",
          },
          expiresAt: "2026-06-01T01:00:00.000Z",
          reason: "Close payments.",
          requestId: "request-1",
          requestLocator: "101",
          requestedAt: "2026-06-01T00:00:00.000Z",
          requestedBy: "developer",
          sourceLabel: "Issue #101",
          sourceState: "OPEN",
          status: "REQUESTED",
          title,
          triggerType: "MANUAL",
          updatedAt: "2026-06-01T00:00:00.000Z",
          workspaceLabel: "always0ne/batch",
          workflow: {
            path: ".github/workflows/payment.daily-close.yml",
            ref: "main",
          },
        },
        targetLabel: "payment.daily-close",
        title,
        updatedAt: "2026-06-01T00:00:00.000Z",
      },
    ],
    workspaceDefaultBranch: "main",
  };
}

function deferred<Value>() {
  let resolve: (value: Value) => void = () => undefined;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
