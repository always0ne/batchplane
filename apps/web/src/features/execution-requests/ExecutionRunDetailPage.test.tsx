import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import type { BatchPlaneRuntimePorts } from "@batchplane/domain";
import {
  createMockGitHubLiteClient,
  type GitHubLiteMockState,
} from "@batchplane/github-lite";

import { createGitHubLiteRuntime } from "../../runtime/github-lite-runtime";
import { createRuntimeFixtureMockState } from "../../runtime/runtime-fixtures";
import type { GitHubSession } from "../lite-setup/github-session";
import "../../i18n/i18n";
import { ExecutionRunDetailPage } from "./ExecutionRunDetailPage";

const session = {
  owner: "always0ne",
  repo: "batch",
  token: "fixture-token",
};

describe("ExecutionRunDetailPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("separates Gate blocked evidence from business execution", async () => {
    const state = createRuntimeFixtureMockState("gate-blocked");
    const run = findFirstWorkflowRun(state);
    const client = createMockGitHubLiteClient(state);

    renderDetail({
      createRuntime: () => createGitHubLiteRuntime(session, { client }),
      readSession: () => session,
      runId: run.id,
    });

    expect(
      await screen.findByRole("heading", { name: "Execution run detail" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Gate blocked").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled();
    expect(screen.getByText("Business execution")).toBeInTheDocument();
    expect(
      screen.getByText(
        "The batch command did not run because Gate blocked execution.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open GitHub run" }),
    ).toHaveAttribute("href", run.url);
    expect(screen.getByText("Job conclusion summary")).toBeInTheDocument();
    expect(screen.getByText("BatchPlane Gate")).toBeInTheDocument();
  });

  it("shows business failure when Gate allowed but the batch job failed", async () => {
    const state = createRuntimeFixtureMockState("business-failed");
    const run = findFirstWorkflowRun(state);
    const client = createMockGitHubLiteClient(state);

    renderDetail({
      createRuntime: () => createGitHubLiteRuntime(session, { client }),
      readSession: () => session,
      runId: run.id,
    });

    expect(
      (await screen.findAllByText("Business failed")).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText("Gate allowed this run before the batch command."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "The batch command or business job failed after Gate allowed the run.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Failure follow-up")).toBeInTheDocument();
    expect(
      screen.getByText("No failure explanation has been recorded yet."),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Owner"), {
      target: { value: "ops-team" },
    });
    fireEvent.change(screen.getByLabelText("Explanation"), {
      target: { value: "The upstream ledger file arrived late." },
    });
    fireEvent.change(screen.getByLabelText("Action taken"), {
      target: { value: "Reprocessed after the corrected file arrived." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record follow-up" }));

    expect(
      await screen.findByText("The upstream ledger file arrived late."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Reprocessed after the corrected file arrived."),
    ).toBeInTheDocument();
  });

  it("shows unknown Gate evidence separately from allowed and blocked states", async () => {
    renderDetail({
      createRuntime: () =>
        ({
          executions: {
            getExecutionRun: async () => ({
              batchId: "payment.daily-close",
              jobs: [],
              requestId: "btr-20260514010900-payment.daily-close-00000009",
              runId: "209",
              status: "RUNNING",
              workflowRunId: "209",
              workflowRunUrl:
                "https://github.com/always0ne/batch/actions/runs/209",
            }),
          },
        }) as unknown as BatchPlaneRuntimePorts,
      readSession: () => session,
      runId: 209,
    });

    expect(
      await screen.findByRole("heading", { name: "Execution run detail" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Gate job evidence is not available yet."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Business execution status: Running."),
    ).toBeInTheDocument();
  });
});

function renderDetail({
  createRuntime,
  readSession,
  runId,
}: {
  createRuntime?: (session: GitHubSession) => BatchPlaneRuntimePorts;
  readSession?: () => GitHubSession | null;
  runId: number;
}) {
  render(
    <MemoryRouter initialEntries={[`/execution-runs/${runId}`]}>
      <Routes>
        <Route
          path="/execution-runs/:runId"
          element={
            <ExecutionRunDetailPage
              createRuntime={createRuntime}
              readSession={readSession}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

function findFirstWorkflowRun(state: GitHubLiteMockState) {
  const run = state.workflowRuns[0];

  if (!run) {
    throw new Error("Expected a workflow run fixture.");
  }

  return run;
}
