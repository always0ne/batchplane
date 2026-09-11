import { act, renderHook } from "@testing-library/react";
import type {
  BatchPlaneClient,
  ExecutionRequestInput,
} from "@batchplane/ui-client";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { BatchPlaneClientContext } from "../../client/batch-plane-client-context";
import { useExecutionRequestSubmission } from "./useExecutionRequestSubmission";

describe("useExecutionRequestSubmission", () => {
  it("submits once and ignores a result after the component unmounts", async () => {
    let resolveCreate:
      | ((
          value: Awaited<
            ReturnType<BatchPlaneClient["createExecutionRequest"]>
          >,
        ) => void)
      | undefined;
    const createExecutionRequest = vi.fn(
      () =>
        new Promise<
          Awaited<ReturnType<BatchPlaneClient["createExecutionRequest"]>>
        >((resolve) => {
          resolveCreate = resolve;
        }),
    );
    const { result, unmount } = renderHook(
      () => useExecutionRequestSubmission("btr-payment-101"),
      { wrapper: clientProvider({ createExecutionRequest }) },
    );

    let firstSubmit: Promise<unknown>;
    let secondSubmit: Promise<unknown>;
    act(() => {
      firstSubmit = result.current.submit(input());
      secondSubmit = result.current.submit(input());
    });

    expect(createExecutionRequest).toHaveBeenCalledTimes(1);
    await expect(secondSubmit!).resolves.toBeNull();

    unmount();
    resolveCreate?.({ request: request() });

    await expect(firstSubmit!).resolves.toBeNull();
  });
});

function clientProvider(overrides: Partial<BatchPlaneClient>) {
  return function ClientProvider({ children }: { children: ReactNode }) {
    return (
      <BatchPlaneClientContext.Provider value={overrides as BatchPlaneClient}>
        {children}
      </BatchPlaneClientContext.Provider>
    );
  };
}

function input(): ExecutionRequestInput {
  return {
    draft: {
      approvedBatchRevision: {
        governedChangeId: "bgc-payment-approved",
        targetRevisionDigest: "sha256:approved",
      },
      batch: {
        batchId: "payment.daily-close",
        criticality: "HIGH",
        domain: "payments",
        environment: "PROD",
        execution: { command: "echo mock batch", runsOn: "ubuntu-latest" },
        gateRequired: true,
        name: "Daily Close",
        owner: "ops-team",
        status: "ACTIVE",
        workflowPath: ".github/workflows/daily-close.yml",
        workflowRef: "main",
      },
      creationCapability: { canCreate: true, unavailableReasons: [] },
      requestId: "btr-payment-101",
      requestedAt: "2026-09-11T00:00:00.000Z",
      requestedBy: "jane",
      workspaceApprovalMode: "SELF_APPROVAL_BLOCKED",
      workspaceLabel: "Payments Workspace",
    },
    expiresAt: "2026-09-11T01:00:00.000Z",
    parameters: [],
    reason: "Close payments.",
    workflowRef: "main",
  };
}

function request() {
  return {
    attempts: { attempts: [], type: "loaded" as const },
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
      canonicalPayload: "{}",
      requestDigest: "sha256:request-101",
    },
    expiresAt: "2026-09-11T01:00:00.000Z",
    reason: "Close payments.",
    requestId: "btr-payment-101",
    requestLocator: "101",
    requestedAt: "2026-09-11T00:00:00.000Z",
    requestedBy: "jane",
    sourceLabel: "Source request #101",
    sourceState: "OPEN" as const,
    status: "REQUESTED" as const,
    title: "#101 Run batch payment.daily-close",
    triggerType: "MANUAL" as const,
    updatedAt: "2026-09-11T00:00:00.000Z",
    workspaceLabel: "Payments Workspace",
  };
}
