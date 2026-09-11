import { fireEvent, render, screen } from "@testing-library/react";
import type { BatchPlaneClient } from "@batchplane/ui-client";
import { WorkspaceNotConnectedError } from "@batchplane/ui-client";
import { createMockGitHubLiteClient } from "@batchplane/github-lite";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { BatchPlaneClientContext } from "../../client/batch-plane-client-context";
import "../../i18n/i18n";
import { createGitHubLiteRuntime } from "../../runtime/github-lite-runtime";
import { createRuntimeBatchPlaneClient } from "../../runtime/runtime-batch-plane-client";
import { createRuntimeFixtureMockState } from "../../runtime/runtime-fixtures";
import { WorkspaceRequestsPage } from "./WorkspaceRequestsPage";

const session = { owner: "always0ne", repo: "batch", token: "fixture-token" };

describe("WorkspaceRequestsPage", () => {
  it("lists governed change and execution requests with internal detail and source links", async () => {
    const state = createRuntimeFixtureMockState("happy-path");
    state.pullRequests.push(governedChangePullRequest());
    renderPage(productClient(state));

    expect(
      await screen.findByRole("heading", { name: "Workspace requests" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Request list")).toBeInTheDocument();
    expect(
      screen.getByText(/Change batch payment\.daily-close/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Run batch payment\.daily-close \(dispatched\)/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("#104 Run batch payment.daily-close (dispatched)"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Batch change")).toBeInTheDocument();
    expect(screen.getByText("Manual execution")).toBeInTheDocument();
    expect(screen.getAllByText("Open").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Dispatched").length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("option", { name: "Withdrawn" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Reapproval required" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("option", {
        name: "Legacy request cannot be approved here",
      }),
    ).not.toBeInTheDocument();

    const detailHrefs = screen
      .getAllByRole("link", { name: "Open request" })
      .map((link) => link.getAttribute("href"));
    expect(detailHrefs).toContain("/approvals/registration/51");
    expect(detailHrefs).toContain("/execution-requests/104");

    const sourceHrefs = screen
      .getAllByRole("link", { name: "Open source" })
      .map((link) => link.getAttribute("href"));
    expect(sourceHrefs).toContain("https://github.com/always0ne/batch/pull/51");
    expect(sourceHrefs).toContain(
      "https://github.com/always0ne/batch/issues/104",
    );
  });

  it("filters request rows by type and status", async () => {
    const state = createRuntimeFixtureMockState("happy-path");
    state.pullRequests.push(governedChangePullRequest());
    renderPage(productClient(state));

    expect(
      await screen.findByText(/Change batch payment\.daily-close/),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Type"), {
      target: { value: "execution" },
    });
    expect(
      screen.queryByText(/Change batch payment\.daily-close/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Run batch payment\.daily-close \(dispatched\)/),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "REQUESTED" },
    });
    expect(
      screen.queryByText("Run batch payment.daily-close (dispatched)"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("No Workspace requests match this filter."),
    ).toBeInTheDocument();
  });

  it("renders a disconnected product-client result without accessing a runtime session", async () => {
    renderPage({
      listWorkspaceRequests: async () => {
        throw new WorkspaceNotConnectedError();
      },
    } as unknown as BatchPlaneClient);

    expect(
      await screen.findByText("Connect a Workspace before browsing requests."),
    ).toBeInTheDocument();
  });

  it("renders a product-client inventory error", async () => {
    renderPage({
      listWorkspaceRequests: async () => {
        throw new Error("Workspace request inventory is unavailable.");
      },
    } as unknown as BatchPlaneClient);

    expect(
      await screen.findByText("Workspace request inventory is unavailable."),
    ).toBeInTheDocument();
  });
});

function renderPage(client: BatchPlaneClient) {
  render(
    <BatchPlaneClientContext.Provider value={client}>
      <MemoryRouter initialEntries={["/requests"]}>
        <Routes>
          <Route path="/requests" element={<WorkspaceRequestsPage />} />
        </Routes>
      </MemoryRouter>
    </BatchPlaneClientContext.Provider>,
  );
}

function productClient(
  state: ReturnType<typeof createRuntimeFixtureMockState>,
) {
  const runtime = createGitHubLiteRuntime(session, {
    client: createMockGitHubLiteClient(state),
  });
  return createRuntimeBatchPlaneClient({
    createRuntime: () => runtime,
    readSession: () => session,
  });
}

function governedChangePullRequest() {
  return {
    author: "developer",
    base: "main",
    body: [
      "## BatchPlane Registration",
      "",
      "- Request type: CHANGE",
      "- Batch ID: `payment.daily-close`",
      "- Name: Daily Close",
      "- Owner: ops-team",
      "- Domain: payments",
      "- Environment: PROD",
      "- Criticality: HIGH",
      "- Workflow: `.github/workflows/payment.daily-close.yml`",
      "- Runs on: ubuntu-latest",
      "- BatchPlane Gate: required",
    ].join("\n"),
    createdAt: "2026-06-09T08:00:00.000Z",
    head: "batchplane/change/payment.daily-close-20260609080000",
    merged: false,
    number: 51,
    state: "open" as const,
    title: "Change batch payment.daily-close",
    updatedAt: "2026-06-09T08:10:00.000Z",
    url: "https://github.com/always0ne/batch/pull/51",
  };
}
