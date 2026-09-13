import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BatchPlaneRuntimePorts } from "@batchplane/domain";
import {
  createMockGitHubLiteClient,
  type GitHubLiteMockState,
} from "@batchplane/github-lite";

import { createGitHubLiteRuntime } from "../../runtime/github-lite-runtime";
import {
  createBatchPlaneRuntime,
  createRuntimeFixtureMockState,
  writeRuntimeFixtureSelection,
} from "../../runtime/runtime-fixtures";
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

  it.each([
    ["en", "QUEUED", "In progress"],
    ["en", "RUNNING", "In progress"],
    ["en", "UNCONFIRMED", "Unknown"],
    ["en", "BLOCKED", "Unknown"],
    ["ko", "QUEUED", "진행 중"],
    ["ko", "RUNNING", "진행 중"],
    ["ko", "UNCONFIRMED", "알 수 없음"],
    ["ko", "BLOCKED", "알 수 없음"],
  ] as const)(
    "renders absent completion for %s %s as %s",
    async (locale, status, expected) => {
      await i18next.changeLanguage(locale);
      const runtime = {
        executions: {
          getExecutionRun: async () => ({
            batchId: "payment.daily-close",
            requestId: "",
            runId: "900",
            status,
          }),
        },
      } as unknown as BatchPlaneRuntimePorts;
      renderDetail({
        createRuntime: () => runtime,
        readSession: () => session,
        runId: 900,
      });
      const label = await screen.findByText(
        locale === "en" ? "Completed at" : "완료 시각",
      );
      expect(label.parentElement?.querySelector("dd")?.textContent).toBe(
        expected,
      );
    },
  );

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

  it.each([
    {
      fixture: "native-schedule-success" as const,
      requestLetter: "a",
      scheduleId: "weekday-close",
      output: "completed successfully",
    },
    {
      fixture: "native-schedule-failure" as const,
      requestLetter: "b",
      scheduleId: "weekday-open",
      output: "failed: ledger unavailable",
    },
  ])(
    "focuses $fixture logs on the actual batch command and retains full Gate evidence",
    async ({ fixture, requestLetter, scheduleId, output }) => {
      writeRuntimeFixtureSelection(fixture);
      const runtime = createBatchPlaneRuntime(session);
      const runId = `native:btr-schedule-${requestLetter.repeat(64)}:900:1`;
      const run = await runtime.executions.getExecutionRun({ runId });
      expect(run?.jobs).toEqual([
        expect.objectContaining({
          name: `Schedule [${scheduleId}]`,
          role: "GATE",
        }),
        expect.objectContaining({
          name: `Run [${scheduleId}]`,
          role: "BUSINESS",
        }),
      ]);
      renderDetail({
        createRuntime: () => runtime,
        readSession: () => session,
        runId,
      });

      fireEvent.click(
        await screen.findByRole("button", { name: "View business logs" }),
      );
      const logText = new RegExp(`Native batch ${scheduleId} ${output}`);
      expect(await screen.findByText(logText)).toBeInTheDocument();
      expect(screen.getByText(/echo native fixture/)).toBeInTheDocument();
      expect(
        screen.getByText(/##\[group\]BatchPlane batch command/),
      ).toBeInTheDocument();
      expect(screen.getByText(/##\[endgroup\]/)).toBeInTheDocument();
      expect(
        screen.queryByText(/BATCHPLANE_GATE_RESULT/),
      ).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Full log" }));
      expect(screen.getByText(/BATCHPLANE_GATE_RESULT/)).toBeInTheDocument();
      expect(screen.getByText(logText)).toBeInTheDocument();
    },
  );

  it("reads internal job logs without an external job URL", async () => {
    const getExecutionRunJobLog = vi.fn().mockResolvedValue({
      content:
        "2026-09-11T01:01:04.000Z ##[group]Run batch\ncommand output without external URL\n##[endgroup]",
      jobId: "17",
      sizeBytes: 120,
      truncated: false,
    });
    const runtime = {
      executions: {
        getExecutionRun: async () => ({
          batchId: "payment.daily-close",
          requestId: "",
          runId: "900",
          status: "UNCONFIRMED",
          jobs: [
            {
              jobId: "17",
              name: "Native business",
              role: "BUSINESS",
              status: "SUCCEEDED",
            },
          ],
        }),
        getExecutionRunJobLog,
      },
    } as unknown as BatchPlaneRuntimePorts;
    renderDetail({
      createRuntime: () => runtime,
      readSession: () => session,
      runId: 900,
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "View business logs" }),
    );
    expect(
      await screen.findByText(/command output without external URL/),
    ).toBeInTheDocument();
    expect(getExecutionRunJobLog).toHaveBeenCalledWith({ jobId: "17" });
    expect(
      screen.queryByRole("link", {
        name: "Open GitHub Actions logs for Native business",
      }),
    ).not.toBeInTheDocument();
  });

  it.each([
    "native-schedule-success",
    "native-schedule-running",
    "business-failed",
  ] as const)(
    "bounds long %s full logs within shrinkable grid cells without changing their text",
    async (fixture) => {
      writeRuntimeFixtureSelection(fixture);
      const runtime = createBatchPlaneRuntime(session);
      const [run] = await runtime.executions.listExecutionRuns({ limit: 20 });
      const content = [
        `BATCHPLANE_GATE_RESULT ${"x".repeat(4096)}`,
        "##[group]BatchPlane batch command",
        "echo command output is intact",
        "command output is intact",
        "##[endgroup]",
      ].join("\n");
      vi.spyOn(runtime.executions, "getExecutionRunJobLog").mockImplementation(
        async ({ jobId }) => ({
          content,
          jobId,
          sizeBytes: content.length,
          truncated: false,
        }),
      );
      renderDetail({
        createRuntime: () => runtime,
        readSession: () => session,
        runId: run!.runId,
      });
      fireEvent.click(
        await screen.findByRole("button", { name: "View business logs" }),
      );
      await screen.findByText(/command output is intact/, { selector: "pre" });
      fireEvent.click(screen.getByRole("button", { name: "Full log" }));
      const pre = screen.getByText(/BATCHPLANE_GATE_RESULT/, {
        selector: "pre",
      });
      expect(pre.textContent).toBe(content);
      expect(pre).toHaveClass(
        "w-full",
        "min-w-0",
        "max-w-full",
        "overflow-auto",
      );
      expect(pre.closest("section")).toHaveClass("min-w-0", "max-w-full");
      expect(pre.closest("section")?.parentElement).toHaveClass(
        "min-w-0",
        "max-w-full",
      );
      expect(pre.closest("li")).toHaveClass("min-w-0", "grid-cols-1");
      expect(pre.closest("article")).toHaveClass("min-w-0", "max-w-full");
    },
  );

  it("opens historical source Run jobs and full logs without inventing a schedule association", async () => {
    writeRuntimeFixtureSelection("native-schedule-source-unconfirmed");
    const runtime = createBatchPlaneRuntime(session);
    const getRun = vi.spyOn(runtime.executions, "getExecutionRun");
    renderDetail({
      createRuntime: () => runtime,
      readSession: () => session,
      runId: 900,
      runAttempt: 1,
    });
    expect(
      await screen.findByRole("heading", { name: "Source run detail" }),
    ).toBeInTheDocument();
    expect(getRun).toHaveBeenCalledWith({ runId: "900", runAttempt: 1 });
    expect(screen.getAllByText("Source job")).toHaveLength(4);
    expect(screen.queryByText("Business job")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getAllByRole("button", { name: "View source logs" })[1]!,
    );
    expect(
      await screen.findByText(
        /Native batch weekday-close completed successfully/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/BATCHPLANE_GATE_RESULT/)).toBeInTheDocument();
    expect(screen.getByText(/"runAttempt":1/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Record follow-up" }),
    ).not.toBeInTheDocument();
  });

  it("keeps a denied native entry log without an executed batch command", async () => {
    writeRuntimeFixtureSelection("native-schedule-blocked");
    const runtime = createBatchPlaneRuntime(session);
    renderDetail({
      createRuntime: () => runtime,
      readSession: () => session,
      runId: `native:btr-schedule-${"a".repeat(64)}:900:2`,
    });

    fireEvent.click(
      await screen.findByRole("button", { name: "View business logs" }),
    );
    expect(
      await screen.findByText(/BATCHPLANE_GATE_RESULT/),
    ).toBeInTheDocument();
    expect(screen.getByText(/"result":"DENY"/)).toBeInTheDocument();
    expect(screen.queryByText(/echo native fixture/)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/##\[group\]BatchPlane batch command/),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Full log" }));
    expect(screen.queryByText(/echo native fixture/)).not.toBeInTheDocument();
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
      screen.getByText(
        "Gate verification is unknown because structured Gate evidence is unavailable or does not match this run.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Business execution status: Running."),
    ).toBeInTheDocument();
  });

  it("uses an unknown-verification summary badge instead of business failure", async () => {
    renderDetail({
      createRuntime: () =>
        ({
          executions: {
            getExecutionRun: async () => ({
              batchId: "payment.daily-close",
              jobs: [],
              requestId: "",
              runId: "208",
              status: "FAILED",
              workflowRunId: "208",
              workflowRunUrl:
                "https://github.com/always0ne/batch/actions/runs/208",
            }),
          },
        }) as unknown as BatchPlaneRuntimePorts,
      readSession: () => session,
      runId: 208,
    });

    expect(
      await screen.findByText("Gate verification unknown"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "The workflow failed, but Gate verification is unknown. BatchPlane cannot classify this as a business failure.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Business failed")).not.toBeInTheDocument();
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
  runAttempt,
}: {
  createRuntime?: (session: GitHubSession) => BatchPlaneRuntimePorts;
  readSession?: () => GitHubSession | null;
  runId: number | string;
  runAttempt?: number;
}) {
  render(
    <MemoryRouter
      initialEntries={[
        `/execution-runs/${encodeURIComponent(runId)}${runAttempt ? `?runAttempt=${runAttempt}` : ""}`,
      ]}
    >
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
