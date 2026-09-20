import {
  WorkspaceNotConnectedError,
  type BatchPlaneClient,
  type ChangeRequestDetail,
} from "@batchplane/ui-client";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { BatchPlaneClientContext } from "../../../../client/batch-plane-client-context";
import "../../../../i18n/i18n";
import { ChangeRequestDetailPage } from "./ChangeRequestDetailPage";

describe("ChangeRequestDetailPage", () => {
  it("routes a disconnected Workspace to setup instead of showing a detail failure", async () => {
    renderPage(
      createClient({
        getChangeRequest: vi
          .fn()
          .mockRejectedValue(new WorkspaceNotConnectedError()),
      }),
    );

    expect(
      await screen.findByText(
        "Connect a Workspace before reviewing change requests.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open Workspace" }),
    ).toHaveAttribute("href", "/workspace");
  });

  it("requires a rejection reason and sends it through the product client", async () => {
    const rejectChangeRequest = vi
      .fn()
      .mockResolvedValue({ ...detail(), reviewState: "REJECTED" });
    renderPage(createClient({ rejectChangeRequest }));

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
      expect(rejectChangeRequest).toHaveBeenCalledWith({
        reason: "Missing operating evidence",
        requestLocator: "42",
      });
    });
  });

  it("uses internal actions for approval and withdrawal states", async () => {
    const approveChangeRequest = vi
      .fn()
      .mockResolvedValue({ ...detail(), reviewState: "MERGED" });
    const withdrawChangeRequest = vi
      .fn()
      .mockResolvedValue({ ...detail(), reviewState: "WITHDRAWN" });
    renderPage(createClient({ approveChangeRequest, withdrawChangeRequest }));

    await screen.findByRole("button", { name: "Approve and apply change" });
    fireEvent.click(
      screen.getByRole("button", { name: "Approve and apply change" }),
    );
    expect(approveChangeRequest).toHaveBeenCalledWith({
      requestLocator: "42",
    });
  });

  it("applies an already approved change without a loading refetch", async () => {
    const approveChangeRequest = vi.fn().mockResolvedValue({
      ...detail(),
      reviewState: "MERGED",
    });
    const getChangeRequest = vi.fn().mockResolvedValue({
      ...detail(),
      canApprove: false,
      canApplyApprovedChange: true,
      reviewState: "APPROVED_PENDING_MERGE",
    });
    renderPage(createClient({ approveChangeRequest, getChangeRequest }));

    const button = await screen.findByRole("button", {
      name: "Apply approved change",
    });
    fireEvent.click(button);

    await waitFor(() => expect(approveChangeRequest).toHaveBeenCalledTimes(1));
    expect(getChangeRequest).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Applied")).toBeInTheDocument();
  });

  it("shows unavailable evidence and recreation guidance without approval controls", async () => {
    renderPage(
      createClient({
        getChangeRequest: async () => ({
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
        getChangeRequest: async () => ({
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
    const { i18next } = await import("../../../../i18n/i18n");
    await i18next.changeLanguage("ko");
    renderPage(
      createClient({
        getChangeRequest: async () => ({
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

  it("keeps the latest same-request refresh result through StrictMode cleanup", async () => {
    const firstMount = deferred<ChangeRequestDetail>();
    const activeMount = deferred<ChangeRequestDetail>();
    const refresh = deferred<ChangeRequestDetail>();
    const getChangeRequest = vi
      .fn()
      .mockReturnValueOnce(firstMount.promise)
      .mockReturnValueOnce(activeMount.promise)
      .mockReturnValueOnce(refresh.promise);

    render(
      <StrictMode>
        <BatchPlaneClientContext.Provider
          value={createClient({ getChangeRequest })}
        >
          <MemoryRouter initialEntries={["/approvals/registration/42"]}>
            <Routes>
              <Route
                path="/approvals/registration/:requestLocator"
                element={<ChangeRequestDetailPage />}
              />
            </Routes>
          </MemoryRouter>
        </BatchPlaneClientContext.Provider>
      </StrictMode>,
    );

    await waitFor(() => expect(getChangeRequest).toHaveBeenCalledTimes(2));
    activeMount.resolve({ ...detail(), batchId: "active-batch" });
    expect(
      await screen.findByRole("heading", {
        name: "Change request: active-batch",
      }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(getChangeRequest).toHaveBeenCalledTimes(3));
    refresh.resolve({ ...detail(), batchId: "refreshed-batch" });
    expect(
      await screen.findByRole("heading", {
        name: "Change request: refreshed-batch",
      }),
    ).toBeInTheDocument();

    await act(async () => {
      firstMount.resolve({ ...detail(), batchId: "stale-batch" });
    });
    expect(
      screen.getByRole("heading", {
        name: "Change request: refreshed-batch",
      }),
    ).toBeInTheDocument();
  });

  it("ignores a stale detail load after navigating to another request", async () => {
    const firstRequest = deferred<ChangeRequestDetail>();
    const getChangeRequest = vi.fn(({ requestLocator }) =>
      requestLocator === "42"
        ? firstRequest.promise
        : Promise.resolve(detailFor("43")),
    );
    renderNavigablePage(createClient({ getChangeRequest }));

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
    const approval = deferred<ChangeRequestDetail>();
    const approveChangeRequest = vi.fn(() => approval.promise);
    const getChangeRequest = vi.fn(({ requestLocator }) =>
      Promise.resolve(requestLocator === "42" ? detail() : detailFor("43")),
    );
    renderNavigablePage(
      createClient({ approveChangeRequest, getChangeRequest }),
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
            element={<ChangeRequestDetailPage />}
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
            element={<NavigableChangeRequestDetailPage />}
          />
        </Routes>
      </MemoryRouter>
    </BatchPlaneClientContext.Provider>,
  );
}

function NavigableChangeRequestDetailPage() {
  const navigate = useNavigate();

  return (
    <>
      <button
        type="button"
        onClick={() => navigate("/approvals/registration/43")}
      >
        Open request 43
      </button>
      <ChangeRequestDetailPage />
    </>
  );
}

function createClient(
  overrides: Partial<BatchPlaneClient> = {},
): BatchPlaneClient {
  return {
    approveChangeRequest: async () => detail(),
    createBatchChangeRequest: async () => ({ request: detail() }),
    getBatchDetail: async ({ batchId }) => ({ batchId, type: "not-found" }),
    getChangeRequest: async () => detail(),
    getBatchChangeBlocker: async () => null,
    getBatchRemediationCapability: async () => ({
      availableKinds: [],
      canRequest: false,
    }),
    listBatches: async () => ({
      batches: [],
      sourceRevision: "main",
      type: "loaded",
    }),
    loadExecutionRequestDraft: unsupported,
    previewExecutionRequest: unsupported,
    createExecutionRequest: unsupported,
    getExecutionRequest: unsupported,
    approveExecutionRequest: unsupported,
    rejectExecutionRequest: unsupported,
    listApprovalRequests: unsupported,
    listWorkspaceRequests: unsupported,
    getMyWork: unsupported,
    listExecutionRuns: unsupported,
    inspectWorkspace: unsupported,
    requestWorkspaceInstallation: unsupported,
    requestWorkspaceUpdate: unsupported,
    requestWorkspacePolicyChange: unsupported,
    getExecutionRun: unsupported,
    getExecutionRunJobLog: unsupported,
    createFailureFollowUp: unsupported,
    reviewFailureFollowUp: unsupported,
    listAuditTimeline: unsupported,
    getDashboardSummary: unsupported,
    loadBatchChangeDraft: async () => {
      throw new Error("not used");
    },
    previewBatchChange: async () => ({
      files: [],
      hasEffectiveChanges: false,
      targetRevisionDigest: "sha256:test",
    }),
    requestBatchRemediation: async () => ({ request: detail() }),
    rejectChangeRequest: async () => detail(),
    withdrawChangeRequest: async () => detail(),
    ...overrides,
  };
}

async function unsupported(): Promise<never> {
  throw new Error("This client method is not used by the change request test.");
}

function detail(): ChangeRequestDetail {
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

function detailFor(requestLocator: string): ChangeRequestDetail {
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
