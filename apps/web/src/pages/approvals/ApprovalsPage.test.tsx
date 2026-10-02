import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  type ApprovalRequestInventory,
  type BatchPlaneClient,
  WorkspaceNotConnectedError,
} from "@batchplane/ui-client";
import { createMockGitHubLiteClient } from "@batchplane/github-lite";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BatchPlaneClientContext } from "../../client/batch-plane-client-context";
import { createGitHubLiteBatchPlaneClient } from "@batchplane/github-lite";
import { createRuntimeBatchPlaneClient } from "../../runtime/runtime-batch-plane-client";
import { createRuntimeFixtureMockState } from "../../runtime/runtime-fixtures";
import "../../i18n/i18n";
import { i18next } from "../../i18n/i18n";
import { ApprovalsPage } from "./ApprovalsPage";

const session = { owner: "always0ne", repo: "batch", token: "fixture-token" };

describe("ApprovalsPage", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
  });
  it.each([false, undefined])(
    "does not infer Gate evidence from an execution target when gateRequired is %s",
    async (gateRequired) => {
      const inventory = approvalInventory();
      const item = inventory.requests[0];
      if (!item || item.kind !== "EXECUTION") {
        throw new Error("Expected an execution approval request fixture.");
      }
      item.request.batch.gateRequired = gateRequired;
      renderPage({
        ...runtimeClient("approval-pending"),
        listApprovalRequests: async () => inventory,
      });

      expect(await screen.findByText("Non-compliant")).toBeInTheDocument();
      expect(
        screen.getByText(".github/workflows/payment.daily-close.yml@main"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Required before batch command"),
      ).not.toBeInTheDocument();
    },
  );

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
    const runtime = createGitHubLiteBatchPlaneClient({
      client,
      repositoryRef: session,
    });

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

  it.each([
    { language: "en", reason: "NOT_AWAITING_APPROVAL", tooltip: undefined },
    {
      language: "en",
      reason: "REQUESTER_IDENTITY_UNVERIFIED",
      tooltip: "The request's requester identity could not be verified.",
    },
    {
      language: "ko",
      reason: "REQUESTER_IDENTITY_UNVERIFIED",
      tooltip: "이 요청의 요청자 신원을 확인할 수 없습니다.",
    },
  ] as const)(
    "disables approval but leaves rejection enabled for $reason in $language",
    async ({ language, reason, tooltip }) => {
      await i18next.changeLanguage(language);
      const inventory = approvalInventory();
      const request = inventory.requests[0];
      if (!request || request.kind !== "EXECUTION") {
        throw new Error("Expected an execution approval request fixture.");
      }
      request.request.capability = {
        approveUnavailableReason: reason,
        canApprove: false,
        canReject: true,
      };
      renderPage({
        listApprovalRequests: async () => inventory,
      } as unknown as BatchPlaneClient);

      expect(
        await screen.findByRole("button", {
          name: language === "en" ? "Approve execution" : "실행 승인",
        }),
      ).toBeDisabled();
      expect(
        screen.getByRole("button", {
          name: language === "en" ? "Reject" : "반려",
        }),
      ).toBeEnabled();
      if (tooltip) {
        expect(screen.getByTitle(tooltip)).toBeDisabled();
        expect(screen.getByText(tooltip)).toBeInTheDocument();
      }
    },
  );

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
    ).toHaveAttribute("href", "/workspace");
  });
});

function runtimeClient(
  fixture: "approval-pending" | "dispatch-failed" | "gate-blocked",
) {
  const state = createRuntimeFixtureMockState(fixture);
  return productClient(
    createGitHubLiteBatchPlaneClient({
      client: createMockGitHubLiteClient(state),
      repositoryRef: session,
    }),
  );
}

function productClient(
  runtime: ReturnType<typeof createGitHubLiteBatchPlaneClient>,
) {
  return createRuntimeBatchPlaneClient({
    createClient: () => runtime,
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
            gateRequired: true,
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
          executionTarget: {
            command: "echo mock batch",
            executionEnvironment: "ubuntu-latest",
            platformName: "GitHub Actions",
            targetName: ".github/workflows/payment.daily-close.yml",
            targetRevision: "main",
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
