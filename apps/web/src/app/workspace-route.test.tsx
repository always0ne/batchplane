import type { ReactElement } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkspaceInspection } from "@batchplane/ui-client";
import { WorkspacePage } from "../pages/workspace/WorkspacePage";
import { LiteGitHubConnectionEditor } from "../runtime/GitHubConnectionForm";
import {
  githubSessionStorageKey,
  writeGitHubSession,
} from "../runtime/github-session";
import { deferred, inspectionTestClient } from "../test/inspection-client";
import { BatchPlaneClientContext } from "../client/batch-plane-client-context";
import "../i18n/i18n";
import { appRoutes } from "./router";

const inspection: WorkspaceInspection = {
  connection: {
    label: "Operations",
    currentUser: "operator",
    defaultRevision: "main",
  },
  installation: {
    installed: false,
    availableRequest: "INSTALL",
    requiredEvidence: ["installation"],
    presentEvidence: [],
    missingEvidence: ["installation"],
    outdatedEvidence: [],
  },
  policy: { approval: { mode: "SELF_APPROVAL_BLOCKED" } },
};

function mount(client: ReturnType<typeof inspectionTestClient>) {
  return render(
    <BatchPlaneClientContext.Provider value={client}>
      <WorkspacePage connectionEditor={LiteGitHubConnectionEditor} />
    </BatchPlaneClientContext.Provider>,
  );
}

function checkConnection() {
  fireEvent.click(screen.getByRole("button", { name: "Check connection" }));
}

describe("Lite Workspace route composition", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    writeGitHubSession({
      owner: "always0ne",
      repo: "batch",
      token: "github_pat_original",
    });
  });

  it("routes directly to the shared page with the concrete Lite editor", () => {
    const root = appRoutes[0]!;
    const route = root.children?.find((entry) => entry.id === "workspace");
    const element = route?.element as ReactElement<{
      connectionEditor: typeof LiteGitHubConnectionEditor;
    }>;

    expect(element.type).toBe(WorkspacePage);
    expect(element.props.connectionEditor).toBe(LiteGitHubConnectionEditor);
  });

  it("requires a successful connection confirmation before product commands", async () => {
    const inspectWorkspace = vi
      .fn()
      .mockResolvedValueOnce(inspection)
      .mockRejectedValueOnce(new Error("connection failed"));
    const requestWorkspaceInstallation = vi.fn();
    const requestWorkspacePolicyChange = vi.fn();
    mount(
      inspectionTestClient({
        inspectWorkspace,
        requestWorkspaceInstallation,
        requestWorkspacePolicyChange,
      }),
    );

    expect(
      screen.getByRole("button", { name: "Create installation request" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Create policy request" }),
    ).toBeDisabled();

    checkConnection();
    await screen.findByText("Operations");
    fireEvent.change(screen.getByLabelText("GitHub repository owner"), {
      target: { value: "replacement" },
    });

    expect(
      screen.getByRole("button", { name: "Create installation request" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Create policy request" }),
    ).toBeDisabled();
    expect(requestWorkspaceInstallation).not.toHaveBeenCalled();
    expect(requestWorkspacePolicyChange).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(githubSessionStorageKey)).toContain(
      "github_pat_original",
    );

    fireEvent.click(screen.getByRole("button", { name: "Save session" }));
    expect(sessionStorage.getItem(githubSessionStorageKey)).toContain(
      "replacement",
    );
    expect(requestWorkspaceInstallation).not.toHaveBeenCalled();
    expect(requestWorkspacePolicyChange).not.toHaveBeenCalled();

    checkConnection();
    await screen.findAllByRole("alert");
    expect(
      screen.getByRole("button", { name: "Create installation request" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Create policy request" }),
    ).toBeDisabled();
    expect(requestWorkspaceInstallation).not.toHaveBeenCalled();
    expect(requestWorkspacePolicyChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Clear session" }));
    expect(sessionStorage.getItem(githubSessionStorageKey)).toBeNull();
    expect(requestWorkspaceInstallation).not.toHaveBeenCalled();
    expect(requestWorkspacePolicyChange).not.toHaveBeenCalled();
  });

  it("allows verified installation and policy commands without saving a draft", async () => {
    const requestWorkspaceInstallation = vi.fn(async () => ({
      request: {
        label: "Install request",
        sourceUrl: "https://example.test/1",
      },
      installation: inspection.installation,
    }));
    const requestWorkspacePolicyChange = vi.fn(async ({ policy }) => ({
      request: { label: "Policy request", sourceUrl: "https://example.test/2" },
      currentPolicy: inspection.policy,
      requestedPolicy: policy,
    }));
    mount(
      inspectionTestClient({
        inspectWorkspace: async () => inspection,
        requestWorkspaceInstallation,
        requestWorkspacePolicyChange,
      }),
    );

    checkConnection();
    await screen.findByText("Operations");
    expect(screen.getByText("operator")).toBeInTheDocument();
    expect(screen.getByText("main")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Create installation request" }),
    );
    await screen.findByRole("link", { name: "Install request" });
    expect(requestWorkspaceInstallation).toHaveBeenCalledTimes(1);

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
  });

  it("discards an inspection that completes after an editor change", async () => {
    const pending = deferred<WorkspaceInspection>();
    mount(inspectionTestClient({ inspectWorkspace: () => pending.promise }));

    checkConnection();
    fireEvent.change(screen.getByLabelText("GitHub repository name"), {
      target: { value: "other-batch" },
    });
    await act(async () => {
      pending.resolve(inspection);
    });

    expect(screen.queryByText("Operations")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create policy request" }),
    ).toBeDisabled();
  });
});
