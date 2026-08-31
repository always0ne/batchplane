import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import {
  createGitHubLiteMockState,
  createMockGitHubLiteClient,
} from "@batchplane/github-lite";
import type { BatchPlaneRuntimePorts } from "@batchplane/domain";

import { createGitHubLiteRuntime } from "../../runtime/github-lite-runtime";
import "../../i18n/i18n";
import { MyWorkPage } from "./MyWorkPage";

const session = {
  owner: "always0ne",
  repo: "batch",
  token: "fixture-token",
};

describe("MyWorkPage", () => {
  it("aggregates approval work for the current maintainer", async () => {
    const client = createMockGitHubLiteClient(createGitHubLiteMockState());

    render(
      <MemoryRouter>
        <MyWorkPage
          createRuntime={() => createGitHubLiteRuntime(session, { client })}
          readSession={() => session}
        />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "My Work" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Current user: @maintainer")).toBeInTheDocument();
    expect(
      screen.getByText("Registration approval is waiting for review."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Execution approval is waiting for a maintainer."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Business failure")).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "Review" }).length,
    ).toBeGreaterThan(0);
  });

  it("routes a current requester's runs without follow-up evidence to write follow-up", async () => {
    const client = createMockGitHubLiteClient(
      createGitHubLiteMockState({ currentUser: { login: "developer" } }),
    );

    render(
      <MemoryRouter>
        <MyWorkPage
          createRuntime={() => createGitHubLiteRuntime(session, { client })}
          readSession={() => session}
        />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "My Work" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Current user: @developer"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Failure follow-up").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Failure follow-up has not been recorded.").length,
    ).toBeGreaterThan(0);
  });

  it("keeps a no-follow-up Gate block as evidence review work", async () => {
    const state = createGitHubLiteMockState({
      currentUser: { login: "developer" },
    });
    const client = createMockGitHubLiteClient(state);
    const runtime = createGitHubLiteRuntime(session, { client });
    const gateBlockedRun = (
      await runtime.executions.listExecutionRuns({ limit: 100 })
    ).find((run) => run.status === "BLOCKED");

    if (!gateBlockedRun) {
      throw new Error("Expected a Gate-blocked execution run fixture.");
    }

    render(
      <MemoryRouter>
        <MyWorkPage
          createRuntime={() =>
            runtimeForRun(runtime, Number(gateBlockedRun.runId))
          }
          readSession={() => session}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Gate blocked")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Review evidence" }),
    ).toHaveAttribute("href", `/execution-runs/${gateBlockedRun.runId}`);
    expect(
      screen.queryByText("Failure follow-up has not been recorded."),
    ).not.toBeInTheDocument();
  });

  it("surfaces submitted failure follow-ups for Workspace manager review", async () => {
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
    client.state.currentUser = { login: "maintainer" };

    render(
      <MemoryRouter>
        <MyWorkPage createRuntime={() => runtime} readSession={() => session} />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(
        "Failure explanation is waiting for Workspace manager review.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Failure review")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Review follow-up" }),
    ).toHaveAttribute("href", `/execution-runs/${run.id}#failure-follow-up`);
  });

  it("does not create actionable failure-review work for a non-manager", async () => {
    const state = createGitHubLiteMockState();
    const client = createMockGitHubLiteClient(state);
    const runtime = createGitHubLiteRuntime(session, { client });
    const run = state.workflowRuns.find(
      (candidate) => candidate.conclusion === "failure",
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

    render(
      <MemoryRouter>
        <MyWorkPage createRuntime={() => runtime} readSession={() => session} />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "My Work" });
    expect(
      screen.queryByRole("link", { name: "Review follow-up" }),
    ).not.toBeInTheDocument();
  });

  it("does not show missing follow-up work to a requester after awaiting review is submitted", async () => {
    const state = createGitHubLiteMockState();
    const client = createMockGitHubLiteClient(state);
    const runtime = createGitHubLiteRuntime(session, { client });
    const run = state.workflowRuns.find(
      (candidate) => candidate.conclusion === "failure",
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

    render(
      <MemoryRouter>
        <MyWorkPage
          createRuntime={() => runtimeForRun(runtime, run.id)}
          readSession={() => session}
        />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "My Work" });
    expect(
      screen.queryByText("Failure follow-up has not been recorded."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Write follow-up" }),
    ).not.toBeInTheDocument();
  });

  it("clears requester follow-up work after a resolved follow-up is approved", async () => {
    const state = createGitHubLiteMockState();
    const client = createMockGitHubLiteClient(state);
    const runtime = createGitHubLiteRuntime(session, { client });
    const run = state.workflowRuns.find(
      (candidate) => candidate.conclusion === "failure",
    );

    if (!run) {
      throw new Error("Expected a business failed workflow run fixture.");
    }

    client.state.currentUser = { login: "developer" };
    const followUp = await runtime.executions.createFailureFollowUp({
      actionTaken: "Reprocessed after upstream correction.",
      explanation: "The upstream ledger file arrived late.",
      owner: "ops-team",
      runId: String(run.id),
      status: "RESOLVED",
    });
    client.state.currentUser = { login: "maintainer" };
    await runtime.executions.reviewFailureFollowUp({
      decision: "APPROVED",
      followUpId: followUp.followUpId,
      reason: "Evidence is sufficient.",
      runId: String(run.id),
    });
    client.state.currentUser = { login: "developer" };

    render(
      <MemoryRouter>
        <MyWorkPage
          createRuntime={() => runtimeForRun(runtime, run.id)}
          readSession={() => session}
        />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "My Work" });
    expect(screen.queryByRole("link", { name: "Write follow-up" })).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Submit follow-up update" }),
    ).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Continue follow-up" }),
    ).toBeNull();
  });

  it("routes changes-requested and rejected follow-ups to an update action", async () => {
    const state = createGitHubLiteMockState();
    const client = createMockGitHubLiteClient(state);
    const runtime = createGitHubLiteRuntime(session, { client });
    const run = state.workflowRuns.find(
      (candidate) => candidate.conclusion === "failure",
    );

    if (!run) {
      throw new Error("Expected a business failed workflow run fixture.");
    }

    client.state.currentUser = { login: "developer" };
    const followUps = await Promise.all([
      runtime.executions.createFailureFollowUp({
        actionTaken: "First corrective action.",
        explanation: "First explanation.",
        owner: "ops-team",
        runId: String(run.id),
        status: "RESOLVED",
      }),
      runtime.executions.createFailureFollowUp({
        actionTaken: "Second corrective action.",
        explanation: "Second explanation.",
        owner: "ops-team",
        runId: String(run.id),
        status: "RESOLVED",
      }),
    ]);
    client.state.currentUser = { login: "maintainer" };
    await runtime.executions.reviewFailureFollowUp({
      decision: "CHANGES_REQUESTED",
      followUpId: followUps[0].followUpId,
      reason: "Please add the validation evidence.",
      runId: String(run.id),
    });
    await runtime.executions.reviewFailureFollowUp({
      decision: "REJECTED",
      followUpId: followUps[1].followUpId,
      reason: "The corrective action is not sufficient.",
      runId: String(run.id),
    });
    client.state.currentUser = { login: "developer" };

    render(
      <MemoryRouter>
        <MyWorkPage
          createRuntime={() => runtimeForRun(runtime, run.id)}
          readSession={() => session}
        />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(
        "A Workspace manager requested changes. Submit an updated follow-up.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "A Workspace manager rejected this follow-up. Submit an updated follow-up.",
      ),
    ).toBeInTheDocument();
    const updateActions = screen.getAllByRole("link", {
      name: "Submit follow-up update",
    });
    expect(updateActions).toHaveLength(2);
    expect(updateActions[0]).toHaveAttribute(
      "href",
      `/execution-runs/${run.id}#failure-follow-up`,
    );
  });

  it("renders an empty state when no runtime session is available", async () => {
    render(
      <MemoryRouter>
        <MyWorkPage readSession={() => null} />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText("Connect a Workspace to view your work."),
    ).toBeInTheDocument();
  });
});

function runtimeForRun(
  runtime: BatchPlaneRuntimePorts,
  runId: number,
): BatchPlaneRuntimePorts {
  const listExecutionRuns = runtime.executions.listExecutionRuns.bind(
    runtime.executions,
  );

  return {
    ...runtime,
    executions: {
      ...runtime.executions,
      async listExecutionRuns(params) {
        return (await listExecutionRuns(params)).filter(
          (run) => run.workflowRunId === String(runId),
        );
      },
    },
  };
}
