import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "../i18n/i18n";
import { writeRuntimeFixtureSelection } from "../runtime/runtime-fixtures";
import { LiteWorkspaceRoute } from "./LiteWorkspaceRoute";
import { BatchPlaneClientContext } from "../client/batch-plane-client-context";
import { createRuntimeBatchPlaneClient } from "../runtime/runtime-batch-plane-client";
import {
  githubSessionStorageKey,
  readGitHubSession,
  writeGitHubSession,
} from "../runtime/github-session";
import { inspectionTestClient } from "../test/inspection-client";

describe("LiteWorkspaceRoute", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it("prepares edited credentials locally before a product request without passing them to the product operation", async () => {
    writeGitHubSession({
      owner: "original",
      repo: "workspace",
      token: "old-secret",
    });
    const currentPolicy = {
      approval: { mode: "SELF_APPROVAL_BLOCKED" as const },
    };
    const requestWorkspacePolicyChange = vi.fn(async ({ policy }) => {
      expect(readGitHubSession()).toEqual({
        owner: "replacement",
        repo: "workspace",
        token: "new-secret",
      });
      return {
        currentPolicy,
        requestedPolicy: policy,
        request: {
          label: "Policy request",
          sourceUrl: "https://example.test/policy/71",
        },
      };
    });
    const client = inspectionTestClient({
      inspectWorkspace: async () => ({
        connection: {
          label: "Workspace",
          currentUser: "operator",
          defaultRevision: "main",
        },
        installation: {
          installed: true,
          availableRequest: null,
          requiredEvidence: [],
          presentEvidence: [],
          missingEvidence: [],
          outdatedEvidence: [],
        },
        policy: currentPolicy,
      }),
      requestWorkspacePolicyChange,
    });
    render(
      <BatchPlaneClientContext.Provider value={client}>
        <LiteWorkspaceRoute />
      </BatchPlaneClientContext.Provider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Check connection" }));
    await screen.findByText("Self-approval blocked");
    fireEvent.change(screen.getByLabelText("GitHub repository owner"), {
      target: { value: " replacement " },
    });
    fireEvent.change(screen.getByLabelText("GitHub token"), {
      target: { value: " new-secret " },
    });
    fireEvent.change(screen.getByLabelText("Approval mode"), {
      target: { value: "AUTO_APPROVE" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create policy request" }),
    );
    await screen.findByRole("link", { name: "Policy request" });
    expect(requestWorkspacePolicyChange).toHaveBeenCalledWith({
      policy: { approval: { mode: "AUTO_APPROVE" } },
    });
    expect(localStorage.getItem(githubSessionStorageKey)).toBeNull();
  });

  it("saves the GitHub token for the current browser session only", () => {
    render(
      <BatchPlaneClientContext.Provider value={createRuntimeBatchPlaneClient()}>
        <LiteWorkspaceRoute />
      </BatchPlaneClientContext.Provider>,
    );

    fireEvent.change(screen.getByLabelText("GitHub repository owner"), {
      target: { value: "always0ne" },
    });
    fireEvent.change(screen.getByLabelText("GitHub repository name"), {
      target: { value: "batch" },
    });
    fireEvent.change(screen.getByLabelText("GitHub token"), {
      target: { value: "github_pat_testtoken" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save session" }));

    expect(
      JSON.parse(sessionStorage.getItem(githubSessionStorageKey) ?? "{}"),
    ).toEqual({
      owner: "always0ne",
      repo: "batch",
      token: "github_pat_testtoken",
    });
    expect(localStorage.getItem(githubSessionStorageKey)).toBeNull();
    expect(
      screen.getByText("Saved for this browser session"),
    ).toBeInTheDocument();
  });

  it("clears the stored GitHub token", () => {
    sessionStorage.setItem(
      githubSessionStorageKey,
      JSON.stringify({
        owner: "always0ne",
        repo: "batch",
        token: "github_pat_testtoken",
      }),
    );

    render(
      <BatchPlaneClientContext.Provider value={createRuntimeBatchPlaneClient()}>
        <LiteWorkspaceRoute />
      </BatchPlaneClientContext.Provider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear session" }));

    expect(sessionStorage.getItem(githubSessionStorageKey)).toBeNull();
    expect(screen.getByLabelText("GitHub token")).toHaveValue("");
  });

  it("creates a Workspace policy PR for self-approval mode", async () => {
    writeRuntimeFixtureSelection("happy-path");

    render(
      <BatchPlaneClientContext.Provider value={createRuntimeBatchPlaneClient()}>
        <LiteWorkspaceRoute />
      </BatchPlaneClientContext.Provider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Check connection" }));

    expect(
      await screen.findByText("Self-approval blocked"),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Approval mode"), {
      target: { value: "SELF_APPROVAL_ALLOWED" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create policy request" }),
    );

    expect(
      await screen.findByText("Workspace policy request created."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: /^#\d+ Update BatchPlane Workspace policy$/,
      }),
    ).toHaveAttribute(
      "href",
      expect.stringMatching(
        /^https:\/\/github\.com\/always0ne\/batch\/pull\/\d+$/,
      ),
    );
  });

  it("creates a Workspace policy PR for auto-approval mode", async () => {
    writeRuntimeFixtureSelection("happy-path");

    render(
      <BatchPlaneClientContext.Provider value={createRuntimeBatchPlaneClient()}>
        <LiteWorkspaceRoute />
      </BatchPlaneClientContext.Provider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Check connection" }));

    expect(
      await screen.findByText("Self-approval blocked"),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Approval mode"), {
      target: { value: "AUTO_APPROVE" },
    });
    expect(
      await screen.findByText(
        "After this policy change is applied, Workspace policy automatically approves execution requests and permits self-approval. Explicit approval evidence is recorded; execution remains controlled by the connected platform.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Create policy request" }),
    );

    expect(
      await screen.findByText("Workspace policy request created."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: /^#\d+ Update BatchPlane Workspace policy$/,
      }),
    ).toHaveAttribute(
      "href",
      expect.stringMatching(
        /^https:\/\/github\.com\/always0ne\/batch\/pull\/\d+$/,
      ),
    );
  });

  it("creates a Workspace workflow update PR when installed workflows are outdated", async () => {
    writeRuntimeFixtureSelection("happy-path");

    render(
      <BatchPlaneClientContext.Provider value={createRuntimeBatchPlaneClient()}>
        <LiteWorkspaceRoute />
      </BatchPlaneClientContext.Provider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Check connection" }));

    expect(
      await screen.findByText("Workspace installation needs an update."),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Create update request" }),
    );

    expect(await screen.findByText("Request created.")).toBeInTheDocument();
    expect(
      await screen.findByText(
        "Update request is ready for maintainer review. Installation remains unchanged until applied.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: /^#\d+ Update BatchPlane Workspace workflows$/,
      }),
    ).toHaveAttribute(
      "href",
      expect.stringMatching(
        /^https:\/\/github\.com\/always0ne\/batch\/pull\/\d+$/,
      ),
    );
  });
});
