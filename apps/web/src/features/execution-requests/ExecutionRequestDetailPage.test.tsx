import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import type { BatchTrailRuntimePorts } from "@batchtrail/domain";
import { createMockGitHubLiteClient } from "@batchtrail/github-lite";

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
        "BatchTrail Gate is mandatory before the batch command.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Approve execution" }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeEnabled();
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
    expect(screen.getByText(/DISPATCHED @/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Approve execution" }),
    ).not.toBeInTheDocument();
  });
});

function renderDetail({
  createRuntime,
  issueNumber = 101,
  readSession,
}: {
  createRuntime?: (session: GitHubSession) => BatchTrailRuntimePorts;
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
