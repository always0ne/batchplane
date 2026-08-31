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
import { i18next } from "../../i18n/i18n";
import { ExecutionRunDetailPage } from "./ExecutionRunDetailPage";

const session = {
  owner: "always0ne",
  repo: "batch",
  token: "fixture-token",
};

describe("ExecutionRunDetailPage", () => {
  beforeEach(async () => {
    sessionStorage.clear();
    await i18next.changeLanguage("en");
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
    expect(screen.getByText("RERUN_NOT_AUTHORIZED")).toBeInTheDocument();
    expect(
      screen.getByText("GitHub Actions rerun is not authorized."),
    ).toBeInTheDocument();
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
    expect(screen.getByText("Gate job")).toBeInTheDocument();
    expect(screen.getByText("Business job")).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "Open GitHub Actions logs for BatchPlane Gate",
      }),
    ).toHaveAttribute(
      "href",
      `${sessionUrl(state)}/actions/runs/${run.id}/job/${run.id * 10 + 1}`,
    );
    expect(
      screen.getByRole("link", {
        name: "Open GitHub Actions logs for Run governed batch",
      }),
    ).toHaveAttribute(
      "href",
      `${sessionUrl(state)}/actions/runs/${run.id}/job/${run.id * 10 + 2}`,
    );

    fireEvent.click(screen.getByRole("button", { name: "View Gate logs" }));

    expect(
      await screen.findByText("BatchPlane Gate log preview"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/BatchPlane Gate evidence verified/u),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Search log")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search log"), {
      target: { value: "verified" },
    });

    expect(screen.getByText(/evidence verified/u)).toBeInTheDocument();
  });

  it("shows business failure when Gate allowed but the batch job failed", async () => {
    const state = createRuntimeFixtureMockState("business-failed");
    const run = findFirstWorkflowRun(state);
    const client = createMockGitHubLiteClient(state);
    client.state.currentUser = { login: "developer" };

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
      screen.getByText("Failure follow-up").closest("article"),
    ).toHaveAttribute("id", "failure-follow-up");
    expect(
      screen.getByText("No failure explanation has been recorded yet."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "View business logs" }));

    expect(
      await screen.findByText("Run governed batch log preview"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Running governed batch command/u),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/##\[group\]BatchPlane batch command/u),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Syncing repository/u)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Full log" }));

    expect(screen.getByText(/Syncing repository/u)).toBeInTheDocument();

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
    expect(screen.getByText("Manager review pending")).toBeInTheDocument();

    client.state.currentUser = { login: "maintainer" };
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByLabelText("Review reason");
    fireEvent.change(screen.getByLabelText("Review reason"), {
      target: { value: "Evidence and corrective action are sufficient." },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Approve explanation" }),
    );

    expect(await screen.findByText("Manager approved")).toBeInTheDocument();
    expect(
      screen.getByText("Evidence and corrective action are sufficient."),
    ).toBeInTheDocument();
  });

  it("does not offer failure review actions to a non-manager", async () => {
    const state = createRuntimeFixtureMockState("business-failed");
    const run = findFirstWorkflowRun(state);
    const client = createMockGitHubLiteClient(state);
    const runtime = createGitHubLiteRuntime(session, { client });

    client.state.currentUser = { login: "developer" };
    await runtime.executions.createFailureFollowUp({
      actionTaken: "Reprocessed after upstream correction.",
      explanation: "The upstream ledger file arrived late.",
      owner: "ops-team",
      runId: String(run.id),
      status: "RESOLVED",
    });

    renderDetail({
      createRuntime: () => runtime,
      readSession: () => session,
      runId: run.id,
    });

    expect(
      await screen.findByText(
        "Workspace manager permission is required to review this explanation.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Approve explanation" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Review reason")).not.toBeInTheDocument();
  });

  it("shows a compact self-review-blocked state instead of review actions", async () => {
    const state = createRuntimeFixtureMockState("business-failed");
    const run = findFirstWorkflowRun(state);
    const client = createMockGitHubLiteClient(state);
    const runtime = createGitHubLiteRuntime(session, { client });

    await runtime.executions.createFailureFollowUp({
      actionTaken: "Reprocessed after upstream correction.",
      explanation: "The upstream ledger file arrived late.",
      owner: "ops-team",
      runId: String(run.id),
      status: "RESOLVED",
    });

    renderDetail({
      createRuntime: () => runtime,
      readSession: () => session,
      runId: run.id,
    });

    expect(
      await screen.findByText(
        "You cannot review your own explanation under the current Workspace policy.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Approve explanation" }),
    ).not.toBeInTheDocument();
  });

  it("renders localized follow-up evidence timestamps instead of raw ISO strings", async () => {
    const state = createRuntimeFixtureMockState("business-failed");
    const run = findFirstWorkflowRun(state);
    const client = createMockGitHubLiteClient(state);
    const runtime = createGitHubLiteRuntime(session, { client });

    client.state.currentUser = { login: "developer" };
    const followUp = await runtime.executions.createFailureFollowUp({
      actionTaken: "Reprocessed after upstream correction.",
      explanation: "The upstream ledger file arrived late.",
      owner: "ops-team",
      runId: String(run.id),
      status: "RESOLVED",
    });
    client.state.currentUser = { login: "maintainer" };
    const review = await runtime.executions.reviewFailureFollowUp({
      decision: "APPROVED",
      followUpId: followUp.followUpId,
      reason: "Evidence is sufficient.",
      runId: String(run.id),
    });

    renderDetail({
      createRuntime: () => runtime,
      readSession: () => session,
      runId: run.id,
    });

    const formatTimestamp = (value: string) =>
      new Intl.DateTimeFormat(i18next.language, {
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        month: "2-digit",
        second: "2-digit",
        year: "numeric",
      }).format(new Date(value));
    const createdAt = formatTimestamp(followUp.createdAt);
    const reviewedAt = formatTimestamp(review.reviewedAt);

    expect(
      await screen.findByText(
        (_, element) =>
          element?.tagName === "SPAN" &&
          element.textContent?.includes(createdAt) === true,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "P" &&
          element.textContent?.includes(reviewedAt) === true,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(followUp.createdAt)).not.toBeInTheDocument();
    expect(screen.queryByText(review.reviewedAt)).not.toBeInTheDocument();
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

  it("shows an actionable permission message when Actions evidence is forbidden", async () => {
    renderDetail({
      createRuntime: () =>
        ({
          executions: {
            getExecutionRun: async () => {
              const error = new Error("Resource not accessible by token");
              error.name = "GitHubLiteApiError";
              Object.assign(error, {
                code: "forbidden",
                status: 403,
              });

              throw error;
            },
          },
        }) as unknown as BatchPlaneRuntimePorts,
      readSession: () => session,
      runId: 209,
    });

    expect(
      await screen.findByText(
        "GitHub Actions read permission is required to load run evidence and job log links. Check the token permissions for this private repository.",
      ),
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

function sessionUrl(state: GitHubLiteMockState) {
  return state.repository.url;
}
