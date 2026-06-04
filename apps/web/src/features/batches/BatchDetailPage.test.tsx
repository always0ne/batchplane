import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createGitHubLiteMockState,
  createMockGitHubLiteClient,
} from "@batchplane/github-lite";

import { createGitHubLiteRuntime } from "../../runtime/github-lite-runtime";
import { writeRuntimeFixtureSelection } from "../../runtime/runtime-fixtures";
import { BatchDetailPage } from "./BatchDetailPage";
import "../../i18n/i18n";

describe("BatchDetailPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("renders batch detail from mock runtime data", async () => {
    writeRuntimeFixtureSelection("approval-pending");

    renderBatchDetailPage("/batches/payment.daily-close");

    expect(
      await screen.findByRole("heading", { name: "Daily Close" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("payment.daily-close")).toHaveLength(2);
    expect(screen.getByText("Workflow target")).toBeInTheDocument();
    expect(screen.getByText("Execution spec")).toBeInTheDocument();
    expect(
      screen.getByText("GitHub Actions / BatchPlane Lite"),
    ).toBeInTheDocument();
    expect(screen.getByText("echo mock batch")).toBeInTheDocument();
    expect(screen.getByText("Requests")).toBeInTheDocument();
    expect(screen.getByText("Gate required")).toHaveAttribute(
      "title",
      "Mandatory: BatchPlane Gate always runs before the batch command.",
    );
    expect(screen.getByText("Approval required")).toHaveAttribute(
      "title",
      "Execution requests require repository maintainer approval evidence.",
    );
    expect(screen.getByText("Execution request")).toBeInTheDocument();
    expect(screen.getByText("Change request")).toBeInTheDocument();
    expect(
      screen.queryByText(
        "Mandatory: BatchPlane Gate always runs before the batch command.",
      ),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Schedules")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Add, change, and delete schedules only within a batch change request.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Daily settlement window")).toBeInTheDocument();
    expect(
      screen.getAllByText("payment.daily-close-daily").length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("Recent execution evidence")).toBeInTheDocument();
    expect(
      screen.getByText("btr-20260514010100-payment.daily-close-00000001"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Request run" })).toHaveAttribute(
      "href",
      "/batches/payment.daily-close/execution-requests/new",
    );
    expect(
      screen.getByRole("link", { name: "Request change" }),
    ).toHaveAttribute("href", "/batches/new?change=payment.daily-close");
    expect(
      screen.getByRole("button", { name: "Request delete" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Register schedule" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Change schedule" }),
    ).not.toBeInTheDocument();
  });

  it("renders an empty state when the batch is missing", async () => {
    writeRuntimeFixtureSelection("approval-pending");

    renderBatchDetailPage("/batches/missing.batch");

    expect(
      await screen.findByText("Batch missing.batch was not found."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to batches" }),
    ).toHaveAttribute("href", "/batches");
  });

  it("creates a governed delete request from batch detail", async () => {
    writeRuntimeFixtureSelection("approval-pending");

    renderBatchDetailPage("/batches/payment.daily-close");

    fireEvent.click(
      await screen.findByRole("button", { name: "Request delete" }),
    );
    fireEvent.change(screen.getByLabelText("Type Batch ID to confirm"), {
      target: { value: "payment.daily-close" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create delete request" }),
    );

    expect(
      await screen.findByText("Delete request detail opened"),
    ).toBeInTheDocument();
  });

  it("shows deleted batch archive evidence when the active definition is gone", async () => {
    const state = createGitHubLiteMockState();
    const deletePullRequest = {
      author: "maintainer",
      base: "main",
      body: [
        "## BatchPlane Deletion",
        "",
        "- Request type: DELETE",
        "- Batch ID: `payment.daily-close`",
        "- Name: Daily Close",
        "- Owner: ops-team",
        "- Domain: payments",
        "- Environment: PROD",
        "- Criticality: HIGH",
        "- Workflow: `.github/workflows/payment.daily-close.yml`",
        "- Runtime: GitHub Actions / BatchPlane Lite",
        "- Runs on: ubuntu-latest",
        "- BatchPlane Gate: required",
        "- Schedule count: 1",
        "- Schedule deletion count: 1",
        "",
        "### Batch command",
        "",
        "```sh",
        "echo mock batch",
        "```",
        "",
        "### Schedule deletions",
        "",
        "#### Deleted schedule 1",
        "- Batch ID: `payment.daily-close`",
        "- Schedule ID: `payment.daily-close-daily`",
        "- Name: Daily settlement window",
        "- Batch definition: `.batch-governance/batches/payment.daily-close.yml`",
        "- Cron: `0 5 * * *`",
        "- Timezone: `Asia/Seoul`",
        "- Enabled: true",
      ].join("\n"),
      head: "batchplane/delete/payment.daily-close-20260514010203",
      merged: true,
      number: 40,
      state: "closed" as const,
      title: "Delete batch payment.daily-close",
      url: "https://github.com/always0ne/batch/pull/40",
    };
    const client = createMockGitHubLiteClient({
      ...state,
      files: state.files.filter(
        (file) =>
          file.path !== ".batch-governance/batches/payment.daily-close.yml",
      ),
      pullRequests: [deletePullRequest],
    });
    const runtime = createGitHubLiteRuntime(
      { owner: "always0ne", repo: "batch", token: "fixture-token" },
      { client },
    );

    renderBatchDetailPage("/batches/payment.daily-close", {
      createRuntime: () => runtime,
      readSession: () => ({
        owner: "always0ne",
        repo: "batch",
        token: "fixture-token",
      }),
    });

    expect(await screen.findByText("Deleted")).toBeInTheDocument();
    expect(screen.getByText("Source request #40")).toBeInTheDocument();
    expect(screen.getByText("echo mock batch")).toBeInTheDocument();
    expect(screen.getByText("Daily settlement window")).toBeInTheDocument();
    expect(screen.getByText("Recent execution evidence")).toBeInTheDocument();
  });
});

function renderBatchDetailPage(
  path: string,
  props?: Parameters<typeof BatchDetailPage>[0],
) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/batches/:batchId"
          element={<BatchDetailPage {...props} />}
        />
        <Route
          path="/approvals/registration/:pullNumber"
          element={<p>Delete request detail opened</p>}
        />
      </Routes>
    </MemoryRouter>,
  );
}
