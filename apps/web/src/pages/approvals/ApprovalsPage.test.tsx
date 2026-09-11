import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  type ApprovalRequestInventory,
  type BatchPlaneClient,
  WorkspaceNotConnectedError,
} from "@batchplane/ui-client";
import { createMockGitHubLiteClient } from "@batchplane/github-lite";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { BatchPlaneClientContext } from "../../client/batch-plane-client-context";
import { createGitHubLiteRuntime } from "../../runtime/github-lite-runtime";
import { createRuntimeBatchPlaneClient } from "../../runtime/runtime-batch-plane-client";
import { createRuntimeFixtureMockState } from "../../runtime/runtime-fixtures";
import "../../i18n/i18n";
import { ApprovalsPage } from "./ApprovalsPage";

const session = { owner: "always0ne", repo: "batch", token: "fixture-token" };

describe("ApprovalsPage", () => {
  it("shows execution judgment context for approval-actionable requests", async () => {
    renderPage(runtimeClient("approval-pending"));

    expect(await screen.findByText("Execution requests")).toBeInTheDocument();
    expect(screen.getByText("Execution context")).toBeInTheDocument();
    expect(screen.getByText("echo mock batch")).toBeInTheDocument();
    expect(screen.getByText("ubuntu-latest")).toBeInTheDocument();
    expect(
      screen.getByText(".github/workflows/payment.daily-close.yml@main"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Approve execution" }),
    ).toBeInTheDocument();
  });

  it.each(["dispatch-failed", "gate-blocked"] as const)(
    "does not show %s evidence as approval work",
    async (fixture) => {
      renderPage(runtimeClient(fixture));

      expect(
        await screen.findByText("No approvals are pending on main."),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Approve execution" }),
      ).not.toBeInTheDocument();
    },
  );

  it("keeps a self-request visible with approval disabled and rejection available", async () => {
    const state = createRuntimeFixtureMockState("approval-pending");
    state.currentUser = { login: "developer" };
    const client = createMockGitHubLiteClient(state);
    const runtime = createGitHubLiteRuntime(session, { client });

    renderPage(productClient(runtime));

    const approve = await screen.findByRole("button", {
      name: "Approve execution",
    });
    expect(approve).toBeDisabled();
    expect(
      screen.getByText("Requester and approver must be different users."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeEnabled();
  });

  it("retains the request digest and its external source link", async () => {
    const inventory = approvalInventory();
    const request = inventory.requests[0];
    if (!request || request.kind !== "EXECUTION") {
      throw new Error("Expected an execution approval request fixture.");
    }
    request.request.sourceUrl = "https://example.test/issues/101";
    renderPage({
      listApprovalRequests: async () => inventory,
    } as unknown as BatchPlaneClient);

    expect(await screen.findByText("sha256:request")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Issue" })).toHaveAttribute(
      "href",
      "https://example.test/issues/101",
    );
  });

  it("keeps approval available when only rejection is unavailable", async () => {
    const inventory = approvalInventory();
    const request = inventory.requests[0];
    if (!request || request.kind !== "EXECUTION") {
      throw new Error("Expected an execution approval request fixture.");
    }
    request.request.capability = {
      canApprove: true,
      canReject: false,
    };
    renderPage({
      listApprovalRequests: async () => inventory,
    } as unknown as BatchPlaneClient);

    expect(
      await screen.findByRole("button", { name: "Approve execution" }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeDisabled();
  });

  it("disables approval when the product capability is unavailable without a display reason", async () => {
    const inventory = approvalInventory();
    const request = inventory.requests[0];
    if (!request || request.kind !== "EXECUTION") {
      throw new Error("Expected an execution approval request fixture.");
    }
    request.request.capability = {
      approveUnavailableReason: "NOT_AWAITING_APPROVAL",
      canApprove: false,
      canReject: true,
    };
    renderPage({
      listApprovalRequests: async () => inventory,
    } as unknown as BatchPlaneClient);

    expect(
      await screen.findByRole("button", { name: "Approve execution" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeEnabled();
  });

  it("removes a resolved request immediately from the authoritative command result", async () => {
    const inventory = approvalInventory();
    const listApprovalRequests = vi.fn().mockResolvedValueOnce(inventory);
    const approveExecutionRequest = vi.fn().mockResolvedValue({
      ...inventory.requests[0]!.request,
      status: "APPROVED",
    });
    const client = {
      approveExecutionRequest,
      listApprovalRequests,
    } as unknown as BatchPlaneClient;

    renderPage(client);

    fireEvent.click(
      await screen.findByRole("button", { name: "Approve execution" }),
    );
    await waitFor(() =>
      expect(approveExecutionRequest).toHaveBeenCalledTimes(1),
    );
    expect(
      screen.getByText("No approvals are pending on main."),
    ).toBeInTheDocument();
    expect(listApprovalRequests).toHaveBeenCalledTimes(1);
  });

  it("does not submit the same execution judgment twice while it is in flight", async () => {
    const inventory = approvalInventory();
    const response = deferred<(typeof inventory.requests)[0]["request"]>();
    const approveExecutionRequest = vi.fn().mockReturnValue(response.promise);

    renderPage({
      approveExecutionRequest,
      listApprovalRequests: async () => inventory,
    } as unknown as BatchPlaneClient);

    const approve = await screen.findByRole("button", {
      name: "Approve execution",
    });
    fireEvent.click(approve);
    fireEvent.click(approve);
    expect(approveExecutionRequest).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Refresh" })).toBeDisabled();

    response.resolve({ ...inventory.requests[0]!.request, status: "APPROVED" });
    expect(
      await screen.findByText("No approvals are pending on main."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled();
  });

  it("renders a product-client inventory error", async () => {
    renderPage({
      listApprovalRequests: async () => {
        throw new Error("Approval inventory is unavailable.");
      },
    } as unknown as BatchPlaneClient);

    expect(
      await screen.findByText("Approval inventory is unavailable."),
    ).toBeInTheDocument();
  });

  it("renders the Workspace connection action when the product client is disconnected", async () => {
    renderPage({
      listApprovalRequests: async () => {
        throw new WorkspaceNotConnectedError();
      },
    } as unknown as BatchPlaneClient);

    expect(
      await screen.findByRole("link", { name: "Open Workspace" }),
    ).toHaveAttribute("href", "/lite/setup");
  });
});

function runtimeClient(
  fixture: "approval-pending" | "dispatch-failed" | "gate-blocked",
) {
  const state = createRuntimeFixtureMockState(fixture);
  return productClient(
    createGitHubLiteRuntime(session, {
      client: createMockGitHubLiteClient(state),
    }),
  );
}

function productClient(runtime: ReturnType<typeof createGitHubLiteRuntime>) {
  return createRuntimeBatchPlaneClient({
    createRuntime: () => runtime,
    readSession: () => session,
  });
}

function renderPage(client: BatchPlaneClient) {
  render(
    <BatchPlaneClientContext.Provider value={client}>
      <MemoryRouter>
        <ApprovalsPage />
      </MemoryRouter>
    </BatchPlaneClientContext.Provider>,
  );
}

function approvalInventory(): ApprovalRequestInventory {
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
          sourceLabel: "#101",
          sourceState: "OPEN",
          status: "REQUESTED",
          title: "Run batch payment.daily-close (requested)",
          triggerType: "MANUAL",
          updatedAt: "2026-06-01T00:00:00.000Z",
          workspaceLabel: "always0ne/batch",
          workflow: {
            path: ".github/workflows/payment.daily-close.yml",
            ref: "main",
          },
        },
        targetLabel: "payment.daily-close",
        title: "Run batch payment.daily-close (requested)",
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
