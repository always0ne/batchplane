import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { BatchPlaneRuntimePorts } from "@batchplane/domain";
import { createMockGitHubLiteClient } from "@batchplane/github-lite";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import "../../i18n/i18n";
import { i18next } from "../../i18n/i18n";
import {
  createRuntimeFixtureMockState,
  writeRuntimeFixtureSelection,
} from "../../runtime/runtime-fixtures";
import { createGitHubLiteRuntime } from "../../runtime/github-lite-runtime";
import { buildWorkspacePolicyYaml } from "../lite-setup/installation-model";
import type { GitHubSession } from "../lite-setup/github-session";
import { ExecutionRequestDetailPage } from "./ExecutionRequestDetailPage";
import { ExecutionRequestPage } from "./ExecutionRequestPage";

const session: GitHubSession = {
  owner: "always0ne",
  repo: "batch",
  token: "fixture-token",
};

describe("ExecutionRequestPage", () => {
  beforeEach(async () => {
    sessionStorage.clear();
    await i18next.changeLanguage("en");
  });

  it("previews an execution request without persisting sensitive values", async () => {
    writeRuntimeFixtureSelection("happy-path");

    renderExecutionRequestPage();

    expect(
      await screen.findByRole("heading", { name: "Execution request" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Request review")).toBeInTheDocument();
    expect(screen.getByText("Canonical payload")).toBeInTheDocument();
    expect(
      screen.getByText(
        "BatchPlane Gate is mandatory before the batch command.",
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add parameter" }));
    fireEvent.change(await screen.findByLabelText("Name"), {
      target: { value: "apiToken" },
    });
    fireEvent.change(screen.getByLabelText("Value"), {
      target: { value: "super-secret-token" },
    });
    fireEvent.click(screen.getByLabelText("Sensitive"));

    await waitFor(() => {
      expect(document.body.textContent).toContain("valueDigest");
    });
    expect(document.body.textContent).toContain("apiToken");
    expect(document.body.textContent).not.toContain("super-secret-token");
    expect(screen.getAllByText(/sha256:/).length).toBeGreaterThan(0);
  });

  it("creates a mock Issue and routes the request to its detail page", async () => {
    writeRuntimeFixtureSelection("happy-path");

    renderExecutionRequestPage();

    expect(
      await screen.findByRole("heading", { name: "Execution request" }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Close payments after upstream reconciliation." },
    });
    const createButton = await screen.findByRole("button", {
      name: "Create execution request",
    });
    await waitFor(() => {
      expect(createButton).toBeEnabled();
    });
    fireEvent.click(createButton);

    expect(
      await screen.findByRole("heading", { name: "Execution request detail" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Run batch payment.daily-close/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Issue" })).toHaveAttribute(
      "href",
      expect.stringContaining("https://github.com/always0ne/batch/issues/"),
    );
  });

  it("auto-approves execution requests when Workspace policy enables it", async () => {
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

    renderExecutionRequestPage({
      createRuntime: () => ({
        ...runtime,
        approvals: {
          ...runtime.approvals,
          listExecutionRequestComments: async () => [],
        },
      }),
      readSession: () => session,
    });

    expect(
      await screen.findByText(
        "Workspace policy auto-approves this request after Issue creation. BatchPlane records approval evidence only; the dispatcher still performs workflow_dispatch.",
      ),
    ).toBeInTheDocument();

    const createButton = await screen.findByRole("button", {
      name: "Create execution request",
    });
    await waitFor(() => {
      expect(createButton).toBeEnabled();
    });
    fireEvent.click(createButton);

    expect(
      await screen.findByRole("heading", { name: "Execution request detail" }),
    ).toBeInTheDocument();
    expect(
      (await screen.findAllByText("Approval recorded")).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", { name: "Approve execution" }),
    ).not.toBeInTheDocument();
    await waitFor(() => {
      expect(
        client.state.issueComments.some(
          (comment) =>
            comment.body.includes("approvalMode=AUTO_APPROVE") &&
            comment.body.includes("approvalType=WORKSPACE_AUTO_APPROVED") &&
            comment.body.includes("approvalSource=WORKSPACE_POLICY"),
        ),
      ).toBe(true);
    });
  });

  it("does not navigate when Workspace auto-approval evidence is missing", async () => {
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

    renderExecutionRequestPage({
      createRuntime: () => ({
        ...runtime,
        approvals: {
          ...runtime.approvals,
          approveExecution: async ({ issueNumber }) => ({
            author: "always0ne",
            body: "not an approval evidence comment",
            createdAt: new Date(0).toISOString(),
            id: 999,
            issueNumber,
          }),
        },
      }),
      readSession: () => session,
    });

    const createButton = await screen.findByRole("button", {
      name: "Create execution request",
    });
    await waitFor(() => {
      expect(createButton).toBeEnabled();
    });
    fireEvent.click(createButton);

    expect(
      await screen.findByText(
        "Auto-approval evidence was not recorded for this execution request.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Execution request detail" }),
    ).not.toBeInTheDocument();
  });

  it.each([
    { label: "Reason", locale: "en", message: "Reason is required." },
    { label: "사유", locale: "ko", message: "사유는 필수입니다." },
  ])(
    "renders validation errors in $locale",
    async ({ label, locale, message }) => {
      await i18next.changeLanguage(locale);
      writeRuntimeFixtureSelection("happy-path");

      renderExecutionRequestPage();

      await screen.findByLabelText(label);
      fireEvent.change(screen.getByLabelText(label), {
        target: { value: "" },
      });

      expect(await screen.findByText(message)).toBeInTheDocument();
    },
  );
});

function renderExecutionRequestPage({
  createRuntime,
  readSession,
}: {
  createRuntime?: (session: GitHubSession) => BatchPlaneRuntimePorts;
  readSession?: () => GitHubSession | null;
} = {}) {
  render(
    <MemoryRouter
      initialEntries={["/batches/payment.daily-close/execution-requests/new"]}
    >
      <Routes>
        <Route
          path="/batches/:batchId/execution-requests/new"
          element={
            <ExecutionRequestPage
              createRuntime={createRuntime}
              readSession={readSession}
            />
          }
        />
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
