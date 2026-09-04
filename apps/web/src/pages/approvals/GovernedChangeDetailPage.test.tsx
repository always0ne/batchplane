import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  WorkspaceNotConnectedError,
  type BatchPlaneClient,
  type GovernedChangeDetail,
} from "@batchplane/ui-client";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { BatchPlaneClientContext } from "../../client/batch-plane-client-context";
import "../../i18n/i18n";
import { GovernedChangeDetailPage } from "./GovernedChangeDetailPage";

describe("GovernedChangeDetailPage", () => {
  it("routes a disconnected Workspace to setup instead of showing a detail failure", async () => {
    renderPage(
      createClient({
        getGovernedChange: vi
          .fn()
          .mockRejectedValue(new WorkspaceNotConnectedError()),
      }),
    );

    expect(
      await screen.findByText(
        "Connect a Workspace before reviewing governed changes.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open Workspace" }),
    ).toHaveAttribute("href", "/lite/setup");
  });

  it("requires a rejection reason and sends it through the product client", async () => {
    const rejectGovernedChange = vi
      .fn()
      .mockResolvedValue({ ...detail(), reviewState: "REJECTED" });
    renderPage(createClient({ rejectGovernedChange }));

    await screen.findByRole("heading", {
      name: "Change request: payment.daily-close",
    });
    expect(screen.getByRole("button", { name: "Reject" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reject" })).toHaveAttribute(
      "title",
      "Enter a rejection reason before rejecting.",
    );

    fireEvent.change(screen.getByLabelText("Rejection reason"), {
      target: { value: "Missing operating evidence" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));

    await waitFor(() => {
      expect(rejectGovernedChange).toHaveBeenCalledWith({
        reason: "Missing operating evidence",
        requestLocator: "42",
      });
    });
  });

  it("uses internal actions for approval and withdrawal states", async () => {
    const approveGovernedChange = vi
      .fn()
      .mockResolvedValue({ ...detail(), reviewState: "MERGED" });
    const withdrawGovernedChange = vi
      .fn()
      .mockResolvedValue({ ...detail(), reviewState: "WITHDRAWN" });
    renderPage(createClient({ approveGovernedChange, withdrawGovernedChange }));

    await screen.findByRole("button", { name: "Approve and apply change" });
    fireEvent.click(
      screen.getByRole("button", { name: "Approve and apply change" }),
    );
    expect(approveGovernedChange).toHaveBeenCalledWith({
      requestLocator: "42",
    });
  });

  it("applies an already approved change without a loading refetch", async () => {
    const approveGovernedChange = vi.fn().mockResolvedValue({
      ...detail(),
      reviewState: "MERGED",
    });
    const getGovernedChange = vi.fn().mockResolvedValue({
      ...detail(),
      canApprove: false,
      canApplyApprovedChange: true,
      reviewState: "APPROVED_PENDING_MERGE",
    });
    renderPage(createClient({ approveGovernedChange, getGovernedChange }));

    const button = await screen.findByRole("button", {
      name: "Apply approved change",
    });
    fireEvent.click(button);

    await waitFor(() => expect(approveGovernedChange).toHaveBeenCalledTimes(1));
    expect(getGovernedChange).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Applied")).toBeInTheDocument();
  });

  it("shows unavailable evidence and recreation guidance without approval controls", async () => {
    renderPage(
      createClient({
        getGovernedChange: async () => ({
          ...detail(),
          canApprove: false,
          canReject: false,
          canWithdraw: true,
          evidence: { kind: "REAPPROVAL_REQUIRED", reason: "STALE_HEAD" },
          files: [
            {
              evidenceUnavailable: true,
              nextContent: "forged: text",
              path: "batch.yml",
              status: "MODIFIED",
            },
          ],
          reviewState: "REAPPROVAL_REQUIRED",
        }),
      }),
    );

    expect(
      await screen.findByText(
        "This request cannot be approved. Withdraw it and create a new change request from the current Batch definition.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Authoritative file evidence is unavailable for this request. Only the file path metadata can be shown.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("forged: text")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Approve and apply change" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Withdraw request" }),
    ).toBeInTheDocument();
  });

  it("shows the permitted rejection action for an open legacy request", async () => {
    renderPage(
      createClient({
        getGovernedChange: async () => ({
          ...detail(),
          canApprove: false,
          canReject: true,
          canWithdraw: false,
          evidence: { kind: "LEGACY_UNAPPROVABLE" },
          reviewState: "LEGACY_UNAPPROVABLE",
        }),
      }),
    );

    expect(
      await screen.findByRole("button", { name: "Reject" }),
    ).toBeInTheDocument();
  });

  it("renders Korean product titles and localizes the decision source", async () => {
    const { i18next } = await import("../../i18n/i18n");
    await i18next.changeLanguage("ko");
    renderPage(
      createClient({
        getGovernedChange: async () => ({
          ...detail(),
          decision: {
            decidedAt: "2026-06-01T00:00:00Z",
            decision: "APPROVED",
            source: "WORKSPACE_POLICY",
          },
          reviewState: "MERGED",
        }),
      }),
    );

    expect(
      await screen.findByRole("heading", {
        name: "payment.daily-close 변경 요청",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Workspace 정책")).toBeInTheDocument();
    await i18next.changeLanguage("en");
  });

  it("ignores a stale detail load after navigating to another request", async () => {
    const firstRequest = deferred<GovernedChangeDetail>();
    const getGovernedChange = vi.fn(({ requestLocator }) =>
      requestLocator === "42"
        ? firstRequest.promise
        : Promise.resolve(detailFor("43")),
    );
    renderNavigablePage(createClient({ getGovernedChange }));

    fireEvent.click(screen.getByRole("button", { name: "Open request 43" }));
    expect(
      await screen.findByRole("heading", {
        name: "Change request: payment.daily-close-43",
      }),
    ).toBeInTheDocument();

    firstRequest.resolve(detail());

    await waitFor(() => {
      expect(
        screen.getByRole("heading", {
          name: "Change request: payment.daily-close-43",
        }),
      ).toBeInTheDocument();
    });
  });

  it("ignores a stale action result after navigating to another request", async () => {
    const approval = deferred<GovernedChangeDetail>();
    const approveGovernedChange = vi.fn(() => approval.promise);
    const getGovernedChange = vi.fn(({ requestLocator }) =>
      Promise.resolve(requestLocator === "42" ? detail() : detailFor("43")),
    );
    renderNavigablePage(
      createClient({ approveGovernedChange, getGovernedChange }),
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Approve and apply change" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Open request 43" }));
    expect(
      await screen.findByRole("heading", {
        name: "Change request: payment.daily-close-43",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Approve and apply change" }),
    ).not.toBeDisabled();

    approval.resolve({ ...detail(), reviewState: "MERGED" });

    await waitFor(() => {
      expect(
        screen.getByRole("heading", {
          name: "Change request: payment.daily-close-43",
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Approve and apply change" }),
      ).not.toBeDisabled();
    });
  });
});

function renderPage(client: BatchPlaneClient) {
  render(
    <BatchPlaneClientContext.Provider value={client}>
      <MemoryRouter initialEntries={["/approvals/registration/42"]}>
        <Routes>
          <Route
            path="/approvals/registration/:requestLocator"
            element={<GovernedChangeDetailPage />}
          />
        </Routes>
      </MemoryRouter>
    </BatchPlaneClientContext.Provider>,
  );
}

function renderNavigablePage(client: BatchPlaneClient) {
  render(
    <BatchPlaneClientContext.Provider value={client}>
      <MemoryRouter initialEntries={["/approvals/registration/42"]}>
        <Routes>
          <Route
            path="/approvals/registration/:requestLocator"
            element={<NavigableGovernedChangeDetailPage />}
          />
        </Routes>
      </MemoryRouter>
    </BatchPlaneClientContext.Provider>,
  );
}

function NavigableGovernedChangeDetailPage() {
  const navigate = useNavigate();

  return (
    <>
      <button
        type="button"
        onClick={() => navigate("/approvals/registration/43")}
      >
        Open request 43
      </button>
      <GovernedChangeDetailPage />
    </>
  );
}

function createClient(
  overrides: Partial<BatchPlaneClient> = {},
): BatchPlaneClient {
  return {
    approveGovernedChange: async () => detail(),
    createBatchChangeRequest: async () => ({ request: detail() }),
    getGovernedChange: async () => detail(),
    getBatchChangeBlocker: async () => null,
    listBatches: async () => ({
      batches: [],
      sourceRevision: "main",
      type: "loaded",
    }),
    loadBatchChangeDraft: async () => {
      throw new Error("not used");
    },
    previewBatchChange: async () => ({
      files: [],
      hasEffectiveChanges: false,
      targetRevisionDigest: "sha256:test",
    }),
    rejectGovernedChange: async () => detail(),
    withdrawGovernedChange: async () => detail(),
    ...overrides,
  };
}

function detail(): GovernedChangeDetail {
  return {
    batchId: "payment.daily-close",
    canApprove: true,
    canApplyApprovedChange: false,
    canReject: true,
    canWithdraw: true,
    files: [
      {
        baseContent: "old",
        nextContent: "new",
        path: ".batch-governance/batches/payment.daily-close.yml",
        status: "MODIFIED",
      },
    ],
    mode: "CHANGE",
    evidence: {
      governedChangeId: "bgc-42",
      kind: "VERIFIED_V2",
      requestDigest: "sha256:request",
      targetRevisionDigest: "sha256:target",
    },
    requestLocator: "42",
    requester: "developer",
    reviewState: "OPEN",
    sourceLabel: "#42",
    title: "Change batch payment.daily-close",
  };
}

function detailFor(requestLocator: string): GovernedChangeDetail {
  return {
    ...detail(),
    batchId: `payment.daily-close-${requestLocator}`,
    requestLocator,
    sourceLabel: `#${requestLocator}`,
  };
}

function deferred<Value>() {
  let resolve: (value: Value) => void = () => undefined;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}
