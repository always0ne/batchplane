import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
import { RegistrationApprovalDetailPage } from "./RegistrationApprovalDetailPage";

const session = {
  owner: "always0ne",
  repo: "batch",
  token: "fixture-token",
};

describe("RegistrationApprovalDetailPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("shows registration metadata, checklist, and yaml diff summary", async () => {
    const runtime = createRuntimeWithRegistrationFixture();

    renderDetail({
      createRuntime: () => runtime,
      readSession: () => session,
    });

    expect(
      await screen.findByRole("heading", {
        name: "Registration approval detail",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Governance checklist")).toBeInTheDocument();
    expect(screen.getByText("YAML diff summary")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Approve and merge PR" }),
    ).toBeInTheDocument();
  });

  it("approves and merges registration pull request", async () => {
    const state = createGitHubLiteMockState();
    const pullRequest = state.pullRequests[0];

    if (!pullRequest) {
      throw new Error("Expected a registration pull request fixture.");
    }

    const client = createMockGitHubLiteClient(
      withRegistrationEvidence(state, pullRequest.head),
    );

    renderDetail({
      createRuntime: () => createGitHubLiteRuntime(session, { client }),
      readSession: () => session,
    });

    fireEvent.click(
      await screen.findByRole("button", { name: "Approve and merge PR" }),
    );

    await waitFor(() => {
      expect(
        client.state.pullRequests.find((pr) => pr.number === 12)?.merged,
      ).toBe(true);
      expect(
        client.state.issueComments.some((comment) =>
          comment.body.includes("Decision: APPROVED"),
        ),
      ).toBe(true);
    });
  });
});

function renderDetail({
  createRuntime,
  pullNumber = 12,
  readSession,
}: {
  createRuntime?: (session: GitHubSession) => BatchPlaneRuntimePorts;
  pullNumber?: number;
  readSession?: () => GitHubSession | null;
} = {}) {
  render(
    <MemoryRouter initialEntries={[`/approvals/registration/${pullNumber}`]}>
      <Routes>
        <Route
          element={
            <RegistrationApprovalDetailPage
              createRuntime={createRuntime}
              readSession={readSession}
            />
          }
          path="/approvals/registration/:pullNumber"
        />
      </Routes>
    </MemoryRouter>,
  );
}

function createRuntimeWithRegistrationFixture() {
  const state = createGitHubLiteMockState();
  const pullRequest = state.pullRequests[0];

  if (!pullRequest) {
    throw new Error("Expected a registration pull request fixture.");
  }

  const client = createMockGitHubLiteClient(
    withRegistrationEvidence(state, pullRequest.head),
  );

  return createGitHubLiteRuntime(session, { client });
}

function withRegistrationEvidence(
  state: ReturnType<typeof createGitHubLiteMockState>,
  headBranch: string,
): ReturnType<typeof createGitHubLiteMockState> {
  const pullRequest = state.pullRequests[0];
  const headSha = state.branches.main || "mock-registration-head-sha";

  if (!pullRequest) {
    throw new Error("Expected a registration pull request fixture.");
  }

  return {
    ...state,
    branches: {
      ...state.branches,
      [headBranch]: headSha,
    },
    files: [
      ...state.files,
      {
        branch: headBranch,
        content: [
          'apiVersion: "batchtrail.io/v1"',
          'kind: "BatchDefinition"',
          "metadata:",
          '  id: "payment.daily-close"',
          '  name: "Daily Close"',
          "spec:",
          "  gateRequired: true",
          "",
        ].join("\n"),
        path: ".batch-governance/batches/payment.daily-close.yml",
        sha: "mock-head-batch-sha",
      },
      {
        branch: headBranch,
        content: [
          'name: "BatchPlane - Daily Close"',
          "on:",
          "  workflow_dispatch:",
          "jobs:",
          "  batchplane-gate:",
          "    runs-on: ubuntu-latest",
          "",
        ].join("\n"),
        path: ".github/workflows/payment.daily-close.yml",
        sha: "mock-head-workflow-sha",
      },
    ],
    pullRequests: [
      {
        ...pullRequest,
        body: [
          "## BatchPlane Registration",
          "",
          "- Batch ID: `payment.daily-close`",
          "- Name: Daily Close",
          "- Environment: PROD",
          "- Criticality: HIGH",
          "- Workflow: `.github/workflows/payment.daily-close.yml`",
          "- Runtime: GitHub Actions / BatchPlane Lite",
          "- Runs on: ubuntu-latest",
          "- BatchPlane Gate: required",
          "",
          "### Batch command",
          "",
          "```sh",
          "echo close payments",
          "```",
        ].join("\n"),
      },
    ],
  };
}
