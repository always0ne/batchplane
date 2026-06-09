import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import type { BatchPlaneRuntimePorts } from "@batchplane/domain";
import { createMockGitHubLiteClient } from "@batchplane/github-lite";

import {
  createRuntimeFixtureMockState,
  writeRuntimeFixtureSelection,
} from "../../runtime/runtime-fixtures";
import { createGitHubLiteRuntime } from "../../runtime/github-lite-runtime";
import type { GitHubSession } from "../lite-setup/github-session";
import "../../i18n/i18n";
import { ExecutionRequestDetailPage } from "./ExecutionRequestDetailPage";

const session = {
  owner: "always0ne",
  repo: "batch",
  token: "fixture-token",
};

describe("ExecutionRequestDetailPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("shows request evidence, governance checks, and approval actions", async () => {
    writeRuntimeFixtureSelection("approval-pending");

    renderDetail();

    expect(
      await screen.findByRole("heading", { name: "Execution request detail" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Waiting for approval").length).toBeGreaterThan(
      0,
    );
    expect(screen.getByText("echo mock batch")).toBeInTheDocument();
    expect(
      screen.getByText(
        "BatchPlane Gate is mandatory before the batch command.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Approve execution" }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeEnabled();
  });

  it("loads the request by Issue number without waiting for the approvals list", async () => {
    const state = createRuntimeFixtureMockState("approval-pending");
    const client = createMockGitHubLiteClient(state);
    const runtime = createGitHubLiteRuntime(session, { client });

    renderDetail({
      createRuntime: () => ({
        ...runtime,
        approvals: {
          ...runtime.approvals,
          listExecutionRequestIssues: async () => {
            throw new Error("List lookup should not be required.");
          },
        },
      }),
      readSession: () => session,
    });

    expect(
      await screen.findByRole("heading", { name: "Execution request detail" }),
    ).toBeInTheDocument();
    expect(screen.getByText("echo mock batch")).toBeInTheDocument();
  });

  it("blocks self approval while allowing rejection with a reason", async () => {
    const state = createRuntimeFixtureMockState("approval-pending");
    state.currentUser = { login: "developer" };
    const client = createMockGitHubLiteClient(state);

    renderDetail({
      createRuntime: () => createGitHubLiteRuntime(session, { client }),
      readSession: () => session,
    });

    expect(
      await screen.findByRole("button", { name: "Approve execution" }),
    ).toBeDisabled();
    expect(
      screen.getByText("Requester and approver must be different users."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));

    expect(
      screen.getByRole("button", { name: "Confirm rejection" }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Rejection reason"), {
      target: { value: "Requested by the same operator." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm rejection" }));

    await waitFor(() => {
      expect(
        client.state.issueComments.some((comment) =>
          comment.body.includes("Reason: Requested by the same operator."),
        ),
      ).toBe(true);
    });
  });

  it("allows self approval when Workspace policy explicitly allows it", async () => {
    const state = createRuntimeFixtureMockState("approval-pending");
    state.currentUser = { login: "developer" };
    state.files = state.files.filter(
      (file) => file.path !== ".batch-governance/workspace.yml",
    );
    state.files.push({
      branch: "main",
      content: buildWorkspacePolicyYaml("SELF_APPROVAL_ALLOWED"),
      path: ".batch-governance/workspace.yml",
      sha: "workspace-policy-sha",
    });
    const client = createMockGitHubLiteClient(state);

    renderDetail({
      createRuntime: () => createGitHubLiteRuntime(session, { client }),
      readSession: () => session,
    });

    expect(
      await screen.findByText(
        "Self-approval is enabled by Workspace policy (SELF_APPROVAL_ALLOWED). This approval will still be recorded as self-approval evidence.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Approve execution" }),
    ).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Approve execution" }));

    await waitFor(() => {
      expect(
        client.state.issueComments.some(
          (comment) =>
            comment.body.includes("selfApproval=true") &&
            comment.body.includes("Self approval: ALLOWED_BY_WORKSPACE_POLICY"),
        ),
      ).toBe(true);
    });
  });

  it("shows dispatcher status from Issue comments and labels", async () => {
    const state = createRuntimeFixtureMockState("happy-path");
    const client = createMockGitHubLiteClient(state);

    renderDetail({
      createRuntime: () => createGitHubLiteRuntime(session, { client }),
      issueNumber: 104,
      readSession: () => session,
    });

    expect((await screen.findAllByText("Dispatched")).length).toBeGreaterThan(
      0,
    );
    expect(
      screen.getByRole("link", { name: "View execution history" }),
    ).toHaveAttribute(
      "href",
      "/runs?batchId=payment.daily-close&requestId=btr-20260514010400-payment.daily-close-00000004",
    );
    expect(screen.getByText(/DISPATCHED @/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Approve execution" }),
    ).not.toBeInTheDocument();
  });

  it("distinguishes workflow run lookup failure from no correlated run", async () => {
    const state = createRuntimeFixtureMockState("happy-path");
    const client = createMockGitHubLiteClient(state);
    const runtime = createGitHubLiteRuntime(session, { client });

    renderDetail({
      createRuntime: () => ({
        ...runtime,
        executions: {
          ...runtime.executions,
          listExecutionRuns: async () => {
            throw new Error("Actions API unavailable");
          },
        },
      }),
      issueNumber: 104,
      readSession: () => session,
    });

    expect(
      await screen.findByText(
        "Workflow run evidence could not be loaded. Refresh or check GitHub Actions permissions.",
      ),
    ).toBeInTheDocument();
  });
});

function renderDetail({
  createRuntime,
  issueNumber = 101,
  readSession,
}: {
  createRuntime?: (session: GitHubSession) => BatchPlaneRuntimePorts;
  issueNumber?: number;
  readSession?: () => GitHubSession | null;
} = {}) {
  render(
    <MemoryRouter initialEntries={[`/execution-requests/${issueNumber}`]}>
      <Routes>
        <Route
          path="/execution-requests/:issueNumber"
          element={
            <ExecutionRequestDetailPage
              createRuntime={createRuntime}
              readSession={readSession}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

function buildWorkspacePolicyYaml(
  mode: "SELF_APPROVAL_BLOCKED" | "SELF_APPROVAL_ALLOWED",
) {
  return [
    'apiVersion: "batchplane.io/v1"',
    'kind: "WorkspacePolicy"',
    "metadata:",
    '  id: "default"',
    "spec:",
    "  approval:",
    `    mode: "${mode}"`,
    "",
  ].join("\n");
}
