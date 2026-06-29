import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import {
  createGitHubLiteMockState,
  createMockGitHubLiteClient,
} from "@batchplane/github-lite";

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

  it("shows the current requester's failed and Gate-blocked runs as follow-up work", async () => {
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
    expect(screen.getAllByText("Business failure").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Gate blocked").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Failure follow-up has not been recorded.").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(
        "Gate blocked this run before the batch command executed.",
      ).length,
    ).toBeGreaterThan(0);
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
