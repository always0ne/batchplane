import type {
  BatchDefinition,
  BatchPlaneRuntimePorts,
  DeletedBatchArchiveResult,
} from "@batchplane/domain";
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
    writeRuntimeFixtureSelection("happy-path");

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
      "Execution requests require Workspace approval evidence.",
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
    expect(screen.getByText("Scheduler cron")).toBeInTheDocument();
    expect(screen.getByText("0 20 * * *")).toBeInTheDocument();
    expect(screen.getByText("Recent execution evidence")).toBeInTheDocument();
    expect(
      screen.getByText("btr-20260514010400-payment.daily-close-00000004"),
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

  it("blocks change requests while an execution request is pending", async () => {
    writeRuntimeFixtureSelection("approval-pending");

    renderBatchDetailPage("/batches/payment.daily-close");

    expect(
      await screen.findByRole("heading", { name: "Daily Close" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Request change" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Request delete" }),
    ).toBeDisabled();
    expect(
      screen.getByText(
        "Resolve pending governed work before creating another change request.",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Execution request #101")).toHaveLength(1);
    expect(
      screen.getAllByRole("link", { name: "Open execution request" }),
    ).toHaveLength(1);
    for (const link of screen.getAllByRole("link", {
      name: "Open execution request",
    })) {
      expect(link).toHaveAttribute("href", "/execution-requests/101");
    }
  });

  it("allows change requests when the prior execution request is dispatch failed", async () => {
    writeRuntimeFixtureSelection("dispatch-failed");

    renderBatchDetailPage("/batches/payment.daily-close");

    expect(
      await screen.findByRole("heading", { name: "Daily Close" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Request change" }),
    ).toHaveAttribute("href", "/batches/new?change=payment.daily-close");
    expect(
      screen.queryByText(
        "Resolve pending governed work before creating another change request.",
      ),
    ).not.toBeInTheDocument();
  });

  it("renders an empty state when the batch is missing", async () => {
    writeRuntimeFixtureSelection("happy-path");

    renderBatchDetailPage("/batches/missing.batch");

    expect(
      await screen.findByText("Batch missing.batch was not found."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to batches" }),
    ).toHaveAttribute("href", "/batches");
  });

  it("creates a governed delete request from batch detail", async () => {
    writeRuntimeFixtureSelection("happy-path");

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
      await screen.findByText("Delete request review opened"),
    ).toBeInTheDocument();
  });

  it("shows the verified deleted batch definition from the runtime archive contract", async () => {
    const runtime = createDeletedArchiveRuntime({
      batch: createArchivedBatchDefinition(),
      sourceRequest: {
        locator: "40",
        number: 40,
        url: "https://github.com/always0ne/batch/pull/40",
      },
      status: "VERIFIED",
    });

    renderBatchDetailPage("/batches/payment.daily-close", {
      createRuntime: () => runtime,
      readSession: () => ({
        owner: "always0ne",
        repo: "batch",
        token: "fixture-token",
      }),
    });

    expect(
      await screen.findByRole("heading", { name: "Daily Close" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Deleted")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Source request #40" }),
    ).toHaveAttribute("href", "https://github.com/always0ne/batch/pull/40");
    expect(screen.getByText("ops-team")).toBeInTheDocument();
    expect(screen.getByText("payments")).toBeInTheDocument();
    expect(screen.getByText("PROD")).toBeInTheDocument();
    expect(screen.getByText("HIGH")).toBeInTheDocument();
    expect(
      screen.getByText(".github/workflows/payment.daily-close.yml"),
    ).toBeInTheDocument();
    expect(screen.getByText("ubuntu-latest")).toBeInTheDocument();
    expect(screen.getByText("echo mock batch")).toBeInTheDocument();
    expect(screen.getByText("Daily settlement window")).toBeInTheDocument();
    expect(screen.getByText("0 5 * * *")).toBeInTheDocument();
    expect(screen.getByText("Asia/Seoul")).toBeInTheDocument();
    expect(screen.getByText("Scheduler cron")).toBeInTheDocument();
    expect(screen.getByText("Recent execution evidence")).toBeInTheDocument();
  });

  it("does not show unverified deleted batch content", async () => {
    const runtime = createDeletedArchiveRuntime({
      sourceRequest: {
        locator: "41",
        number: 41,
        url: "https://github.com/always0ne/batch/pull/41",
      },
      status: "UNAVAILABLE",
      unavailableReason: "BATCH_DEFINITION_DIGEST_MISMATCH",
    });

    renderBatchDetailPage("/batches/payment.daily-close", {
      createRuntime: () => runtime,
      readSession: () => ({
        owner: "always0ne",
        repo: "batch",
        token: "fixture-token",
      }),
    });

    expect(
      await screen.findByRole("heading", {
        name: "Archive evidence unavailable",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Source request #41" }),
    ).toHaveAttribute("href", "https://github.com/always0ne/batch/pull/41");
    expect(
      screen.getByText(
        "The archived BatchDefinition does not match its recorded digest.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Daily Close")).not.toBeInTheDocument();
    expect(screen.queryByText("ops-team")).not.toBeInTheDocument();
    expect(screen.queryByText("echo mock batch")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Daily settlement window"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Recent execution evidence")).toBeInTheDocument();
  });
});

function createArchivedBatchDefinition(): BatchDefinition {
  return {
    batchId: "payment.daily-close",
    criticality: "HIGH",
    domain: "payments",
    environment: "PROD",
    execution: {
      artifactPath: ".batch-governance/batches/payment.daily-close/run.sh",
      command: "echo mock batch",
      runsOn: "ubuntu-latest",
    },
    gateRequired: true,
    name: "Daily Close",
    owner: "ops-team",
    schedules: [
      {
        cron: "0 5 * * *",
        enabled: true,
        name: "Daily settlement window",
        scheduleId: "payment.daily-close-daily",
        timezone: "Asia/Seoul",
      },
    ],
    status: "ACTIVE",
    workflow: {
      path: ".github/workflows/payment.daily-close.yml",
      ref: "main",
    },
  };
}

function createDeletedArchiveRuntime(
  archive: DeletedBatchArchiveResult,
): BatchPlaneRuntimePorts {
  const state = createGitHubLiteMockState();
  const client = createMockGitHubLiteClient({
    ...state,
    files: state.files.filter(
      (file) =>
        file.path !== ".batch-governance/batches/payment.daily-close.yml",
    ),
  });
  const baseRuntime = createGitHubLiteRuntime(
    { owner: "always0ne", repo: "batch", token: "fixture-token" },
    { client },
  );

  return {
    ...baseRuntime,
    batches: {
      ...baseRuntime.batches,
      getDeletedBatchArchive: async () => archive,
    },
  };
}

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
          path="/batches/new"
          element={<p>Delete request review opened</p>}
        />
      </Routes>
    </MemoryRouter>,
  );
}
