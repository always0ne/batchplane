import { fireEvent, render, screen } from "@testing-library/react";
import { createMockGitHubLiteClient } from "@batchplane/github-lite";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import "../../i18n/i18n";
import type { GitHubSession } from "../lite-setup/github-session";
import { createGitHubLiteRuntime } from "../../runtime/github-lite-runtime";
import { createRuntimeFixtureMockState } from "../../runtime/runtime-fixtures";
import { WorkspaceRequestsPage } from "./WorkspaceRequestsPage";

const session: GitHubSession = {
  owner: "always0ne",
  repo: "batch",
  token: "fixture-token",
};

describe("WorkspaceRequestsPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("lists governed change and execution requests with internal detail links", async () => {
    const state = createRuntimeFixtureMockState("happy-path");
    state.pullRequests.push(governedChangePullRequest());
    const client = createMockGitHubLiteClient(state);
    const runtime = createGitHubLiteRuntime(session, { client });

    renderWorkspaceRequestsPage(runtime);

    expect(
      await screen.findByRole("heading", { name: "Workspace requests" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Request list")).toBeInTheDocument();
    expect(
      screen.getByText("Change batch payment.daily-close"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Run batch payment.daily-close (dispatched)"),
    ).toBeInTheDocument();
    expect(screen.getByText("Batch change")).toBeInTheDocument();
    expect(screen.getByText("Manual execution")).toBeInTheDocument();
    expect(screen.getAllByText("Open").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Dispatched").length).toBeGreaterThan(0);
    expect(screen.getAllByText("payment.daily-close").length).toBeGreaterThan(
      0,
    );

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
    const client = createMockGitHubLiteClient(state);
    const runtime = createGitHubLiteRuntime(session, { client });

    renderWorkspaceRequestsPage(runtime);

    expect(
      await screen.findByText("Change batch payment.daily-close"),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Type"), {
      target: { value: "execution" },
    });

    expect(
      screen.queryByText("Change batch payment.daily-close"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Run batch payment.daily-close (dispatched)"),
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
});

function renderWorkspaceRequestsPage(
  runtime: ReturnType<typeof createGitHubLiteRuntime>,
) {
  render(
    <MemoryRouter initialEntries={["/requests"]}>
      <Routes>
        <Route
          path="/requests"
          element={
            <WorkspaceRequestsPage
              createRuntime={() => runtime}
              readSession={() => session}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );
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
