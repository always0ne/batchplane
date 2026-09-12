import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import type { BatchPlaneRuntimePorts } from "@batchplane/domain";
import {
  createGitHubLiteMockState,
  createMockGitHubLiteClient,
} from "@batchplane/github-lite";

import { createGitHubLiteRuntime } from "../../runtime/github-lite-runtime";
import {
  createBatchPlaneRuntime,
  writeRuntimeFixtureSelection,
} from "../../runtime/runtime-fixtures";
import type { GitHubSession } from "../lite-setup/github-session";
import "../../i18n/i18n";
import { i18next } from "../../i18n/i18n";
import { ExecutionRunListPage } from "./ExecutionRunListPage";

const session = {
  owner: "always0ne",
  repo: "batch",
  token: "fixture-token",
};

describe("ExecutionRunListPage", () => {
  beforeEach(async () => {
    sessionStorage.clear();
    await i18next.changeLanguage("en");
  });

  it.each(["en", "ko"])(
    "distinguishes unknown completion from active execution in %s",
    async (locale) => {
      await i18next.changeLanguage(locale);
      const statuses = ["QUEUED", "RUNNING", "UNCONFIRMED", "BLOCKED"] as const;
      const runtime = {
        executions: {
          listExecutionRuns: async () =>
            statuses.map((status, index) => ({
              batchId: "payment.daily-close",
              requestId: "",
              runId: String(900 + index),
              status,
            })),
        },
      } as unknown as BatchPlaneRuntimePorts;
      renderPage({ createRuntime: () => runtime, readSession: () => session });
      const labels = await screen.findAllByText(
        locale === "en" ? "Completed" : "완료",
      );
      expect(
        labels.map(
          (label) => label.parentElement?.querySelector("dd")?.textContent,
        ),
      ).toEqual(
        locale === "en"
          ? ["In progress", "In progress", "Unknown", "Unknown"]
          : ["진행 중", "진행 중", "알 수 없음", "알 수 없음"],
      );
    },
  );

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
    expect(
      screen.getByText(
        "RERUN_NOT_AUTHORIZED - GitHub Actions rerun is not authorized.",
      ),
    ).toBeInTheDocument();
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

  it("renders Gate reason messages in Korean while preserving reasonCode", async () => {
    await i18next.changeLanguage("ko");
    const client = createMockGitHubLiteClient(createGitHubLiteMockState());

    renderPage({
      createRuntime: () => createGitHubLiteRuntime(session, { client }),
      readSession: () => session,
    });

    expect(await screen.findByText("실행 Run")).toBeInTheDocument();
    expect(
      screen.getByText(
        "RERUN_NOT_AUTHORIZED - GitHub Actions rerun은 허용되지 않습니다.",
      ),
    ).toBeInTheDocument();
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
    expect(
      screen.getByRole("link", { name: "Record follow-up" }),
    ).toHaveAttribute(
      "href",
      "/execution-runs/205?from=failures#failure-follow-up",
    );
    expect(screen.queryByRole("button", { name: "Active" })).toBeNull();
    expect(screen.queryByText("Running")).not.toBeInTheDocument();
    expect(
      screen
        .getAllByRole("link", { name: "Open run" })
        .map((link) => link.getAttribute("href")),
    ).toEqual(expect.arrayContaining(["/execution-runs/205?from=failures"]));
  });

  it.each(["en", "ko"])(
    "localizes native failure outcomes and exact attempt links in %s",
    async (locale) => {
      await i18next.changeLanguage(locale);
      writeRuntimeFixtureSelection("native-schedule-mixed");
      const runtime = createBatchPlaneRuntime(session);
      renderPage({
        createRuntime: () => runtime,
        readSession: () => session,
        initialPath: "/failures",
        view: "failures",
      });

      const links = await screen.findAllByRole("link", {
        name: locale === "en" ? "Open run" : "Run 열기",
      });
      expect(links.map((link) => link.getAttribute("href")).sort()).toEqual(
        [
          `/execution-runs/${encodeURIComponent(`native:btr-schedule-${"a".repeat(64)}:900:2`)}?from=failures`,
          `/execution-runs/${encodeURIComponent(`native:btr-schedule-${"b".repeat(64)}:900:1`)}?from=failures`,
        ].sort(),
      );
      expect(
        screen.getAllByText(locale === "en" ? "Business failed" : "업무 실패")
          .length,
      ).toBeGreaterThan(0);
      expect(
        screen.getAllByText(locale === "en" ? "Gate blocked" : "Gate 차단")
          .length,
      ).toBeGreaterThan(0);
      expect(screen.queryByText(/nativeObservation\./)).not.toBeInTheDocument();
      expect(
        screen.queryByText(
          locale === "en" ? "Evidence unconfirmed" : "증적 확인 불가",
        ),
      ).not.toBeInTheDocument();
    },
  );

  it("distinguishes submitted failure follow-up review state", async () => {
    const state = createGitHubLiteMockState();
    const client = createMockGitHubLiteClient(state);
    const runtime = createGitHubLiteRuntime(session, { client });
    const run = state.workflowRuns.find(
      (candidate) =>
        candidate.batchId === "payment.daily-close" &&
        candidate.conclusion === "failure",
    );

    if (!run) {
      throw new Error("Expected a business failed workflow run fixture.");
    }

    client.state.currentUser = { login: "developer" };
    await runtime.executions.createFailureFollowUp({
      actionTaken: "Reprocessed after upstream correction.",
      explanation: "The upstream ledger file arrived late.",
      owner: "ops-team",
      runId: String(run.id),
      status: "RESOLVED",
    });

    renderPage({
      createRuntime: () => runtime,
      initialPath: "/failures",
      readSession: () => session,
      view: "failures",
    });

    expect(await screen.findByText("Review pending")).toBeInTheDocument();
    expect(screen.queryByText("Explanation needed")).not.toBeInTheDocument();
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

  it("keeps unknown Gate verification out of business-failure follow-up filters", async () => {
    renderPage({
      createRuntime: () =>
        ({
          executions: {
            listExecutionRuns: async () => [
              {
                batchId: "payment.daily-close",
                requestId: "",
                runId: "209",
                status: "FAILED",
                workflowRunId: "209",
                workflowRunUrl:
                  "https://github.com/always0ne/batch/actions/runs/209",
              },
            ],
          },
        }) as unknown as BatchPlaneRuntimePorts,
      initialPath: "/failures",
      readSession: () => session,
      view: "failures",
    });

    expect(
      await screen.findByText(
        "No failed or Gate-blocked workflow runs match this filter.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open run" })).toBeNull();
  });

  it("uses a compact unknown-verification badge with one explanatory outcome", async () => {
    renderPage({
      createRuntime: () =>
        ({
          executions: {
            listExecutionRuns: async () => [
              {
                batchId: "payment.daily-close",
                requestId: "",
                runId: "208",
                status: "FAILED",
                workflowRunId: "208",
              },
            ],
          },
        }) as unknown as BatchPlaneRuntimePorts,
      readSession: () => session,
    });

    expect(
      await screen.findByText("Gate verification unknown"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("The run failed, but Gate verification is unknown."),
    ).toHaveLength(1);
  });

  it("shows an empty state when no runtime session is available", async () => {
    renderPage({ readSession: () => null });

    expect(
      await screen.findByText(
        "Connect a Workspace before reviewing executions.",
      ),
    ).toBeInTheDocument();
  });

  it("links each uncorrelated source attempt to its numeric Run detail without a false outcome", async () => {
    writeRuntimeFixtureSelection("native-schedule-source-unconfirmed");
    const runtime = createBatchPlaneRuntime(session);
    renderPage({ createRuntime: () => runtime, readSession: () => session });
    const links = await screen.findAllByRole("link", { name: "Open run" });
    expect(links.map((link) => link.getAttribute("href")).sort()).toEqual([
      "/execution-runs/900?runAttempt=1",
      "/execution-runs/900?runAttempt=2",
    ]);
    expect(screen.getAllByText("Source run")).toHaveLength(2);
    expect(
      screen.queryByText("Batch command failed after Gate allowed the run."),
    ).not.toBeInTheDocument();
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
