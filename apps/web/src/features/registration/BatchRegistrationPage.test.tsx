import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMockGitHubLiteClient } from "@batchplane/github-lite";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import "../../i18n/i18n";
import { RegistrationApprovalDetailPage } from "../approvals/RegistrationApprovalDetailPage";
import { buildWorkspacePolicyYaml } from "../lite-setup/installation-model";
import type { GitHubSession } from "../lite-setup/github-session";
import { createGitHubLiteRuntime } from "../../runtime/github-lite-runtime";
import {
  createRuntimeFixtureMockState,
  writeRuntimeFixtureSelection,
} from "../../runtime/runtime-fixtures";
import { BatchRegistrationPage } from "./BatchRegistrationPage";

const session: GitHubSession = {
  owner: "always0ne",
  repo: "batch",
  token: "fixture-token",
};

describe("BatchRegistrationPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("renders a PR review panel and YAML preview from form input", async () => {
    renderRegistrationPage();

    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Add schedule" }));
    fireEvent.change(screen.getByLabelText("Schedule ID"), {
      target: { value: "payment.daily-close-daily" },
    });
    fireEvent.change(screen.getAllByLabelText("Name")[1]!, {
      target: { value: "Daily settlement window" },
    });
    expect(screen.queryByText(/new-batch/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Batch command"), {
      target: { value: "./scripts/daily-close.sh" },
    });

    expect(screen.getByText("PR review")).toBeInTheDocument();
    expect(screen.getByText("PR diff preview")).toBeInTheDocument();
    expect(screen.getByText("Generated files")).toBeInTheDocument();
    expect(screen.getByText("Governance checklist")).toBeInTheDocument();
    expect(screen.getByText("No uploaded execution file")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Batch command will be recorded in the batch definition.",
      ),
    ).toBeInTheDocument();
    expect(
      await screen.findAllByText(/payment.daily-close.yml/),
    ).not.toHaveLength(0);
    expect(screen.getAllByText(/id: "payment.daily-close"/)).not.toHaveLength(
      0,
    );
    expect(
      screen.getByText(/path: ".github\/workflows\/payment.daily-close.yml"/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("BatchPlane Gate always runs before the batch command."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Schedules" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Expected run times")).toBeInTheDocument();
    expect(screen.getByText(/Next 1:/)).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("payment.daily-close-daily"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("Workflow YAML"));

    expect(screen.getByText(/workflow_dispatch:/)).toBeInTheDocument();
    expect(screen.getByText(/batchplane-gate:/)).toBeInTheDocument();
    expect(screen.getByText(/runs-on: "ubuntu-latest"/)).toBeInTheDocument();
    expect(screen.getAllByText(/.\/scripts\/daily-close.sh/)).not.toHaveLength(
      0,
    );
  });

  it("routes a created mock PR to the resulting approval detail", async () => {
    writeRuntimeFixtureSelection("happy-path");
    render(
      <MemoryRouter initialEntries={["/batches/new"]}>
        <Routes>
          <Route path="/batches/new" element={<BatchRegistrationPage />} />
          <Route
            path="/approvals/registration/:pullNumber"
            element={<RegistrationApprovalDetailPage />}
          />
        </Routes>
      </MemoryRouter>,
    );

    fillRequiredFields("settlement.daily-rollup");
    fireEvent.change(screen.getByLabelText("Batch command"), {
      target: { value: "./scripts/settlement-rollup.sh" },
    });

    const createButton = screen.getByRole("button", {
      name: "Create registration PR",
    });

    await waitFor(() => {
      expect(createButton).toBeEnabled();
    });

    fireEvent.click(createButton);

    expect(
      await screen.findByRole("heading", { name: "Governed change detail" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Register batch settlement.daily-rollup/),
    ).toBeInTheDocument();
    expect(
      screen
        .getByRole("link", { name: "Open source request" })
        .getAttribute("href"),
    ).toContain("https://github.com/always0ne/batch/pull/");
  });

  it("prefills the existing batch when opened in change mode", async () => {
    writeRuntimeFixtureSelection("approval-pending");

    render(
      <MemoryRouter
        initialEntries={["/batches/new?change=payment.daily-close"]}
      >
        <Routes>
          <Route path="/batches/new" element={<BatchRegistrationPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "Change request" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("payment.daily-close").length).toBeGreaterThan(
      0,
    );
    expect(screen.getByDisplayValue("Daily Close")).toBeInTheDocument();
    expect(screen.getByDisplayValue("ops-team")).toBeInTheDocument();
    expect(screen.getByDisplayValue("payments")).toBeInTheDocument();
    expect(screen.getByDisplayValue("echo mock batch")).toBeInTheDocument();
    expect(screen.getByText("payment.daily-close-daily")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("Daily settlement window"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create change PR" }),
    ).toBeInTheDocument();
  });

  it("keeps an existing schedule visible when marked for deletion", async () => {
    writeRuntimeFixtureSelection("approval-pending");

    render(
      <MemoryRouter
        initialEntries={["/batches/new?change=payment.daily-close"]}
      >
        <Routes>
          <Route path="/batches/new" element={<BatchRegistrationPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "Change request" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(screen.getByText("Pending delete")).toBeInTheDocument();
    expect(
      screen.getByText(
        "If this change request is merged, this schedule will be removed from the batch definition.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Scheduled removals")).toBeInTheDocument();
    expect(
      screen.getAllByText("payment.daily-close-daily").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Undo delete" }),
    ).toBeInTheDocument();
  });

  it("auto-approves and applies change PRs when Workspace policy enables it", async () => {
    const state = createRuntimeFixtureMockState("happy-path");
    state.files = state.files.filter(
      (file) => file.path !== ".batch-governance/workspace.yml",
    );
    state.files.push({
      branch: "main",
      content: buildWorkspacePolicyYaml("AUTO_APPROVE"),
      path: ".batch-governance/workspace.yml",
      sha: "workspace-policy-auto-approve-sha",
    });
    const client = createMockGitHubLiteClient(state);
    const runtime = createGitHubLiteRuntime(session, { client });

    render(
      <MemoryRouter
        initialEntries={["/batches/new?change=payment.daily-close"]}
      >
        <Routes>
          <Route
            path="/batches/new"
            element={
              <BatchRegistrationPage
                createRuntime={() => runtime}
                readSession={() => session}
              />
            }
          />
          <Route
            path="/approvals/registration/:pullNumber"
            element={
              <RegistrationApprovalDetailPage
                createRuntime={() => runtime}
                readSession={() => session}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "Change request" }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getAllByLabelText("Name")[0]!, {
      target: { value: "Daily Close Auto" },
    });

    const createButton = screen.getByRole("button", {
      name: "Create change PR",
    });

    await waitFor(() => {
      expect(createButton).toBeEnabled();
    });

    fireEvent.click(createButton);

    await waitFor(() => {
      expect(
        client.state.pullRequests.some(
          (pullRequest) =>
            pullRequest.title === "Change batch payment.daily-close" &&
            pullRequest.merged,
        ),
      ).toBe(true);
      expect(
        client.state.issueComments.some(
          (comment) =>
            comment.body.includes("Approval mode: AUTO_APPROVE") &&
            comment.body.includes("Approval type: WORKSPACE_AUTO_APPROVED") &&
            comment.body.includes("Approval source: WORKSPACE_POLICY"),
        ),
      ).toBe(true);
    });
  });
});

function renderRegistrationPage() {
  render(
    <MemoryRouter>
      <BatchRegistrationPage />
    </MemoryRouter>,
  );
}

function fillRequiredFields(batchId = "payment.daily-close") {
  fireEvent.change(screen.getByLabelText("Batch ID"), {
    target: { value: batchId },
  });
  fireEvent.change(screen.getByLabelText("Name"), {
    target: { value: "Daily Close" },
  });
  fireEvent.change(screen.getByLabelText("Owner"), {
    target: { value: "ops-team" },
  });
  fireEvent.change(screen.getByLabelText("Domain"), {
    target: { value: "payments" },
  });
}
