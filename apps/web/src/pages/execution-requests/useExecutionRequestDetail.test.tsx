import { act, renderHook, waitFor } from "@testing-library/react";
import type { ExecutionRequest, BatchPlaneClient } from "@batchplane/ui-client";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { BatchPlaneClientContext } from "../../client/batch-plane-client-context";
import { useExecutionRequestDetail } from "./useExecutionRequestDetail";

describe("useExecutionRequestDetail", () => {
  it("retains a created pending request while its first provider read is unavailable", async () => {
    const created = request();
    const { result } = renderHook(
      () =>
        useExecutionRequestDetail({
          initialRequest: created,
          requestLocator: "101",
        }),
      {
        wrapper: clientProvider({
          getExecutionRequest: vi.fn().mockResolvedValue(null),
        }),
      },
    );

    await waitFor(() => {
      expect(result.current.state).toMatchObject({
        readState: "pending",
        request: { requestId: "btr-payment-101", status: "REQUESTED" },
        type: "loaded",
      });
    });
  });

  it("retains matching authoritative auto-approval during a delayed read, then accepts dispatch on refresh", async () => {
    const approved = request({
      approvalDecision: {
        actor: "workspace-policy",
        decidedAt: "2026-09-11T00:01:00.000Z",
        decision: "APPROVED",
        reason: "",
        source: "WORKSPACE_POLICY",
      },
      status: "APPROVED",
    });
    const getExecutionRequest = vi
      .fn()
      .mockResolvedValueOnce(request({ status: "REQUESTED" }))
      .mockResolvedValueOnce(request({ status: "DISPATCHED" }));
    const { result } = renderHook(
      () =>
        useExecutionRequestDetail({
          initialRequest: approved,
          requestLocator: "101",
        }),
      { wrapper: clientProvider({ getExecutionRequest }) },
    );

    await waitFor(() => {
      expect(result.current.state).toMatchObject({
        readState: "pending",
        request: { status: "APPROVED" },
        type: "loaded",
      });
    });

    act(() => result.current.refresh());

    await waitFor(() => {
      expect(result.current.state).toMatchObject({
        readState: "current",
        request: { status: "DISPATCHED" },
        type: "loaded",
      });
    });
  });

  it("invalidates a stale read after approval and rejects same-tick duplicate actions", async () => {
    const initialRead = deferred<ExecutionRequest>();
    const approved = request({
      approvalDecision: {
        actor: "maintainer",
        decidedAt: "2026-09-11T00:01:00.000Z",
        decision: "APPROVED",
        reason: "",
        source: "USER",
      },
      capability: { canApprove: false, canReject: false },
      status: "APPROVED",
    });
    const getExecutionRequest = vi
      .fn()
      .mockImplementationOnce(() => initialRead.promise)
      .mockResolvedValueOnce(request({ status: "REQUESTED" }));
    const approveExecutionRequest = vi.fn().mockResolvedValue(approved);
    const initialRequest = request();
    const { result } = renderHook(
      () =>
        useExecutionRequestDetail({
          initialRequest,
          requestLocator: "101",
        }),
      {
        wrapper: clientProvider({
          approveExecutionRequest,
          getExecutionRequest,
        }),
      },
    );

    await waitFor(() => {
      expect(getExecutionRequest).toHaveBeenCalledTimes(1);
    });

    let firstAction: Promise<boolean> | undefined;
    let secondAction: Promise<boolean> | undefined;
    act(() => {
      firstAction = result.current.applyAction("approve");
      secondAction = result.current.applyAction("approve");
    });

    await act(async () => {
      await expect(firstAction).resolves.toBe(true);
    });
    await expect(secondAction).resolves.toBe(false);
    expect(approveExecutionRequest).toHaveBeenCalledTimes(1);

    await act(async () => {
      initialRead.resolve(request({ status: "REQUESTED" }));
      await initialRead.promise;
    });

    expect(result.current.state).toMatchObject({
      readState: "current",
      request: { status: "APPROVED" },
      type: "loaded",
    });

    act(() => result.current.refresh());

    await waitFor(() => {
      expect(result.current.state).toMatchObject({
        readState: "pending",
        request: { status: "APPROVED" },
        type: "loaded",
      });
    });
  });
});

function deferred<T>() {
  let resolve: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve: resolve! };
}

function clientProvider(overrides: Partial<BatchPlaneClient>) {
  const client = overrides as BatchPlaneClient;
  return function ClientProvider({ children }: { children: ReactNode }) {
    return (
      <BatchPlaneClientContext.Provider value={client}>
        {children}
      </BatchPlaneClientContext.Provider>
    );
  };
}

function request(overrides: Partial<ExecutionRequest> = {}): ExecutionRequest {
  return {
    attempts: { attempts: [], type: "loaded" },
    batch: {
      criticality: "HIGH",
      domain: "payments",
      environment: "PROD",
      name: "Daily Close",
      owner: "ops-team",
    },
    batchId: "payment.daily-close",
    capability: { canApprove: false, canReject: false },
    evidence: {
      approvedBatchRevision: {
        governedChangeId: "bgc-payment-approved",
        targetRevisionDigest: "sha256:approved",
      },
      canonicalPayload: "{}",
      requestDigest: "sha256:request-101",
    },
    expiresAt: "2026-09-11T01:00:00.000Z",
    reason: "Close payments.",
    requestId: "btr-payment-101",
    requestLocator: "101",
    requestedAt: "2026-09-11T00:00:00.000Z",
    requestedBy: "jane",
    sourceLabel: "Issue #101",
    sourceState: "OPEN",
    status: "REQUESTED",
    title: "Run batch payment.daily-close",
    triggerType: "MANUAL",
    updatedAt: "2026-09-11T00:00:00.000Z",
    workspaceLabel: "Payments Workspace",
    ...overrides,
  } as ExecutionRequest;
}
