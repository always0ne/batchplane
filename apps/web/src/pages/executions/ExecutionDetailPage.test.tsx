import { inspectionTestClient } from "../../test/inspection-client";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RuntimeClientTestProvider } from "../../test/RuntimeClientTestProvider";

import {
  ExecutionInspectionError,
  type BatchPlaneClient,
} from "@batchplane/ui-client";
import {
  createMockGitHubLiteClient,
  type GitHubLiteMockState,
} from "@batchplane/github-lite";

import type { GitHubSession } from "../../runtime/github-session";
import { i18next } from "../../i18n/i18n";
import { createGitHubLiteBatchPlaneClient } from "@batchplane/github-lite";
import {
  createSelectedBatchPlaneClient,
  createRuntimeFixtureMockState,
  writeRuntimeFixtureSelection,
} from "../../runtime/runtime-fixtures";
import { ExecutionDetailPage } from "./ExecutionDetailPage";

const session = {
  owner: "always0ne",
  repo: "batch",
  token: "fixture-token",
};

describe("ExecutionDetailPage", () => {
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
      const runtime = inspectionTestClient({
        getExecutionRun: async () => ({
          batchId: "payment.daily-close",
          requestId: "",
          runId: "900",
          status,
        }),
      });
      renderDetail({
        createClient: () => runtime,
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
      createClient: () =>
        createGitHubLiteBatchPlaneClient({ client, repositoryRef: session }),
      readSession: () => session,
      runId: run.id,
    });

    expect(
      await screen.findByRole("heading", { name: "Execution detail" }),
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
      screen.getByRole("link", { name: "Open source execution" }),
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
      createClient: () =>
        createGitHubLiteBatchPlaneClient({ client, repositoryRef: session }),
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
      const runtime = createSelectedBatchPlaneClient(session);
      const runId = `native:btr-schedule-${requestLetter.repeat(64)}:900:1`;
      const run = await runtime.getExecutionRun({ runId });
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
        createClient: () => runtime,
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
      businessSection: {
        content: "command output without external URL",
        focused: true,
      },
      sizeBytes: 120,
      truncated: false,
    });
    const runtime = inspectionTestClient({
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
    });
    renderDetail({
      createClient: () => runtime,
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
      const runtime = createSelectedBatchPlaneClient(session);
      const [run] = await runtime.listExecutionRuns({ limit: 20 });
      const content = [
        `BATCHPLANE_GATE_RESULT ${"x".repeat(4096)}`,
        "##[group]BatchPlane batch command",
        "echo command output is intact",
        "command output is intact",
        "##[endgroup]",
      ].join("\n");
      vi.spyOn(runtime, "getExecutionRunJobLog").mockImplementation(
        async ({ jobId }) => ({
          content,
          jobId,
          businessSection: {
            content: "echo command output is intact\ncommand output is intact",
            focused: true,
          },
          sizeBytes: content.length,
          truncated: false,
        }),
      );
      renderDetail({
        createClient: () => runtime,
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
    const runtime = createSelectedBatchPlaneClient(session);
    const getRun = vi.spyOn(runtime, "getExecutionRun");
    renderDetail({
      createClient: () => runtime,
      readSession: () => session,
      runId: 900,
      runAttempt: 1,
    });
    expect(
      await screen.findByRole("heading", { name: "Source execution detail" }),
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
    const runtime = createSelectedBatchPlaneClient(session);
    renderDetail({
      createClient: () => runtime,
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
    const runtime = createGitHubLiteBatchPlaneClient({
      client,
      repositoryRef: session,
    });

    client.state.currentUser = { login: "developer" };
    await runtime.createFailureFollowUp({
      actionTaken: "Reprocessed after upstream correction.",
      explanation: "The upstream ledger file arrived late.",
      owner: "ops-team",
      runId: String(run.id),
      status: "RESOLVED",
    });

    renderDetail({
      createClient: () => runtime,
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
    const runtime = createGitHubLiteBatchPlaneClient({
      client,
      repositoryRef: session,
    });

    await runtime.createFailureFollowUp({
      actionTaken: "Reprocessed after upstream correction.",
      explanation: "The upstream ledger file arrived late.",
      owner: "ops-team",
      runId: String(run.id),
      status: "RESOLVED",
    });

    renderDetail({
      createClient: () => runtime,
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
    const runtime = createGitHubLiteBatchPlaneClient({
      client,
      repositoryRef: session,
    });

    client.state.currentUser = { login: "developer" };
    const followUp = await runtime.createFailureFollowUp({
      actionTaken: "Reprocessed after upstream correction.",
      explanation: "The upstream ledger file arrived late.",
      owner: "ops-team",
      runId: String(run.id),
      status: "RESOLVED",
    });
    client.state.currentUser = { login: "maintainer" };
    const review = await runtime.reviewFailureFollowUp({
      decision: "APPROVED",
      followUpId: followUp.followUpId,
      reason: "Evidence is sufficient.",
      runId: String(run.id),
    });

    renderDetail({
      createClient: () => runtime,
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
      createClient: () =>
        inspectionTestClient({
          getExecutionRun: async () => ({
            batchId: "payment.daily-close",
            jobs: [],
            requestId: "btr-20260514010900-payment.daily-close-00000009",
            runId: "209",
            status: "RUNNING",
            sourceUrl: "https://github.com/always0ne/batch/actions/runs/209",
          }),
        }),
      readSession: () => session,
      runId: 209,
    });

    expect(
      await screen.findByRole("heading", { name: "Execution detail" }),
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
      createClient: () =>
        inspectionTestClient({
          getExecutionRun: async () => ({
            batchId: "payment.daily-close",
            jobs: [],
            requestId: "",
            runId: "208",
            status: "FAILED",
            sourceUrl: "https://github.com/always0ne/batch/actions/runs/208",
          }),
        }),
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
      createClient: () =>
        inspectionTestClient({
          getExecutionRun: async () => {
            throw new ExecutionInspectionError({ type: "access-denied" });
          },
        }),
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
  createClient,
  readSession,
  runId,
  runAttempt,
}: {
  createClient?: (session: GitHubSession) => BatchPlaneClient;
  readSession?: () => GitHubSession | null;
  runId: number | string;
  runAttempt?: number;
}) {
  render(
    <MemoryRouter
      initialEntries={[
        `/executions/${encodeURIComponent(runId)}${runAttempt ? `?runAttempt=${runAttempt}` : ""}`,
      ]}
    >
      <Routes>
        <Route
          path="/executions/:executionId"
          element={
            <RuntimeClientTestProvider
              createClient={createClient}
              readSession={readSession}
            >
              <ExecutionDetailPage />
            </RuntimeClientTestProvider>
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
