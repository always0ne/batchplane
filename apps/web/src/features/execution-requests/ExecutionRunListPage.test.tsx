import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import type { BatchPlaneRuntimePorts } from "@batchplane/domain";
import {
  createGitHubLiteMockState,
  createMockGitHubLiteClient,
} from "@batchplane/github-lite";

import { createGitHubLiteRuntime } from "../../runtime/github-lite-runtime";
import type { GitHubSession } from "../lite-setup/github-session";
import "../../i18n/i18n";
import { ExecutionRunListPage } from "./ExecutionRunListPage";

const session = {
  owner: "always0ne",
  repo: "batch",
  token: "fixture-token",
};

describe("ExecutionRunListPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("lists execution runs with status filters and run detail links", async () => {
    const client = createMockGitHubLiteClient(createGitHubLiteMockState());

    renderPage({
      createRuntime: () => createGitHubLiteRuntime(session, { client }),
      readSession: () => session,
    });

    expect(
      await screen.findByRole("heading", { name: "Executions" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Execution runs")).toBeInTheDocument();
    expect(screen.getAllByText("Running").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Succeeded").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Business failed").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Gate blocked").length).toBeGreaterThan(0);
    expect(
      screen.getByText("Batch command failed after Gate allowed the run."),
    ).toBeInTheDocument();
    expect(screen.getByText("RERUN_NOT_AUTHORIZED")).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("link", { name: "Open run" })
        .map((link) => link.getAttribute("href")),
    ).toEqual(
      expect.arrayContaining([
        "/execution-runs/203",
        "/execution-runs/204",
        "/execution-runs/205",
        "/execution-runs/208",
      ]),
    );
    expect(
      screen
        .getAllByRole("link", { name: "GitHub run" })
        .map((link) => link.getAttribute("href")),
    ).toEqual(
      expect.arrayContaining([
        "https://github.com/always0ne/batch/actions/runs/205",
      ]),
    );
  });

  it("filters the list to Gate blocked runs", async () => {
    const client = createMockGitHubLiteClient(createGitHubLiteMockState());

    renderPage({
      createRuntime: () => createGitHubLiteRuntime(session, { client }),
      readSession: () => session,
    });

    expect(await screen.findByText("Execution runs")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Gate blocked" }));

    expect(screen.getAllByText("Gate blocked").length).toBeGreaterThan(0);
    expect(
      screen.queryByText("Batch command failed after Gate allowed the run."),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open run" })).toHaveAttribute(
      "href",
      "/execution-runs/208",
    );
  });

  it("shows a failure-focused follow-up view", async () => {
    const client = createMockGitHubLiteClient(createGitHubLiteMockState());

    renderPage({
      createRuntime: () => createGitHubLiteRuntime(session, { client }),
      initialPath: "/failures",
      readSession: () => session,
      view: "failures",
    });

    expect(
      await screen.findByRole("heading", { name: "Failures" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Failure follow-up")).toBeInTheDocument();
    expect(screen.getByText("Explanation needed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Active" })).toBeNull();
    expect(screen.queryByText("Running")).not.toBeInTheDocument();
    expect(
      screen
        .getAllByRole("link", { name: "Open run" })
        .map((link) => link.getAttribute("href")),
    ).toEqual(expect.arrayContaining(["/execution-runs/205?from=failures"]));
  });

  it("defaults invalid failure filters to all follow-up runs", async () => {
    const client = createMockGitHubLiteClient(createGitHubLiteMockState());

    renderPage({
      createRuntime: () => createGitHubLiteRuntime(session, { client }),
      initialPath: "/failures?type=active",
      readSession: () => session,
      view: "failures",
    });

    expect(await screen.findByText("Failure follow-up")).toBeInTheDocument();
    expect(screen.getAllByText("Business failed").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Gate blocked").length).toBeGreaterThan(0);
  });

  it("shows an empty state when no runtime session is available", async () => {
    renderPage({ readSession: () => null });

    expect(
      await screen.findByText(
        "Connect a GitHub repository before reviewing executions.",
      ),
    ).toBeInTheDocument();
  });
});

function renderPage({
  createRuntime,
  initialPath = "/runs",
  readSession,
  view = "executions",
}: {
  createRuntime?: (session: GitHubSession) => BatchPlaneRuntimePorts;
  initialPath?: string;
  readSession?: () => GitHubSession | null;
  view?: "executions" | "failures";
} = {}) {
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/runs"
          element={
            <ExecutionRunListPage
              createRuntime={createRuntime}
              readSession={readSession}
              view={view}
            />
          }
        />
        <Route
          path="/failures"
          element={
            <ExecutionRunListPage
              createRuntime={createRuntime}
              readSession={readSession}
              view={view}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}
