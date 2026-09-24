import {
  WorkspaceSettingsError,
  type WorkspaceInspection,
  type WorkspaceInstallationRequest,
  type WorkspacePolicyRequest,
} from "@batchplane/ui-client";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BatchPlaneClientContext } from "../../client/batch-plane-client-context";
import type { WorkspaceConnectionEditorProps } from "../../client/workspace-connection-editor";
import { i18next } from "../../i18n/i18n";
import { deferred, inspectionTestClient } from "../../test/inspection-client";
import { WorkspacePage } from "./WorkspacePage";

const inspection: WorkspaceInspection = {
  connection: {
    label: "Operations",
    currentUser: "operator",
    defaultRevision: "revision-1",
  },
  installation: {
    installed: true,
    availableRequest: null,
    requiredEvidence: ["installation"],
    presentEvidence: ["installation"],
    missingEvidence: [],
    outdatedEvidence: [],
  },
  policy: { approval: { mode: "SELF_APPROVAL_BLOCKED" } },
};
const sourceRequest = {
  label: "Request 71",
  sourceUrl: "https://example.test/requests/71",
};
function TestConnectionEditor({
  onCheckConnection,
  onConnectionChanged,
}: WorkspaceConnectionEditorProps) {
  return (
    <div>
      <p>No active connection</p>
      <button onClick={() => void onCheckConnection()}>
        Inspect Workspace
      </button>
      <button onClick={onConnectionChanged}>Disconnect Workspace</button>
    </div>
  );
}

function Page() {
  return <WorkspacePage connectionEditor={TestConnectionEditor} />;
}

function mount(client: ReturnType<typeof inspectionTestClient>) {
  return render(
    <BatchPlaneClientContext.Provider value={client}>
      <Page />
    </BatchPlaneClientContext.Provider>,
  );
}

function inspect() {
  fireEvent.click(screen.getByRole("button", { name: "Inspect Workspace" }));
}

describe("shared Workspace page", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
  });
  afterEach(async () => {
    cleanup();
    await i18next.changeLanguage("en");
  });

  it("does not load or expose product actions until the connection is checked", () => {
    const inspectWorkspace = vi.fn(async () => inspection);
    mount(inspectionTestClient({ inspectWorkspace }));
    expect(screen.getByText("No active connection")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create policy request" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Create policy request" })
        .parentElement,
    ).toHaveAttribute(
      "title",
      i18next.t("settings:workspacePolicy.checkFirst"),
    );
    expect(
      screen.getByRole("button", { name: "Create installation request" }),
    ).toBeDisabled();
    expect(inspectWorkspace).not.toHaveBeenCalled();
  });

  it.each([
    [
      false,
      [],
      ["configuration", "installation"],
      "INSTALL",
      "Create installation request",
    ],
    [
      false,
      ["configuration"],
      ["installation"],
      "INSTALL",
      "Create installation request",
    ],
    [true, ["configuration", "installation"], [], null, null],
    [
      true,
      ["configuration", "installation"],
      [],
      "UPDATE",
      "Create update request",
    ],
  ] as const)(
    "renders the adapter readiness and capability: installed %s, present %j",
    async (installed, present, missing, available, action) => {
      mount(
        inspectionTestClient({
          inspectWorkspace: async () => ({
            ...inspection,
            installation: {
              ...inspection.installation,
              installed,
              availableRequest: available,
              presentEvidence: [...present],
              missingEvidence: [...missing],
              outdatedEvidence: available === "UPDATE" ? ["installation"] : [],
            },
          }),
        }),
      );
      inspect();
      await screen.findByText("Operations");
      if (action)
        expect(screen.getByRole("button", { name: action })).toBeEnabled();
      else
        expect(
          screen.getByText("BatchPlane is installed."),
        ).toBeInTheDocument();
      for (const label of missing)
        expect(screen.getByText(label)).toBeInTheDocument();
    },
  );

  it.each([
    ["INSTALL", "Create installation request", "requestWorkspaceInstallation"],
    ["UPDATE", "Create update request", "requestWorkspaceUpdate"],
  ] as const)(
    "shows the returned %s request without an applied installation claim",
    async (availableRequest, action, method) => {
      const before: WorkspaceInspection = {
        ...inspection,
        installation: {
          ...inspection.installation,
          installed: availableRequest === "UPDATE",
          availableRequest,
          missingEvidence:
            availableRequest === "INSTALL" ? ["installation"] : [],
          outdatedEvidence:
            availableRequest === "UPDATE" ? ["installation"] : [],
        },
      };
      const request = vi.fn(async () => ({
        request: sourceRequest,
        installation: before.installation,
      }));
      mount(
        inspectionTestClient({
          inspectWorkspace: async () => before,
          [method]: request,
        }),
      );
      inspect();
      fireEvent.click(await screen.findByRole("button", { name: action }));
      expect(
        await screen.findByRole("link", { name: sourceRequest.label }),
      ).toHaveAttribute("href", sourceRequest.sourceUrl);
      expect(
        screen.getByText(/Installation remains unchanged until applied/),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("BatchPlane is installed."),
      ).not.toBeInTheDocument();
      expect(request).toHaveBeenCalledWith();
    },
  );

  it("keeps the effective policy separate from the returned request", async () => {
    const requestedPolicy = { approval: { mode: "AUTO_APPROVE" as const } };
    const requestWorkspacePolicyChange = vi.fn(async () => ({
      request: sourceRequest,
      currentPolicy: inspection.policy,
      requestedPolicy,
    }));
    mount(
      inspectionTestClient({
        inspectWorkspace: async () => inspection,
        requestWorkspacePolicyChange,
      }),
    );
    inspect();
    await screen.findByText("Operations");
    fireEvent.change(screen.getByLabelText("Approval mode"), {
      target: { value: "AUTO_APPROVE" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create policy request" }),
    );
    await screen.findByRole("link", { name: sourceRequest.label });
    expect(
      within(screen.getByText("Current mode").parentElement!).getByText(
        "Self-approval blocked",
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByText("Requested mode").parentElement!).getByText(
        "Auto-approve",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create policy request" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Create policy request" })
        .parentElement,
    ).toHaveAttribute(
      "title",
      i18next.t("settings:workspacePolicy.pendingRequest"),
    );
    expect(requestWorkspacePolicyChange).toHaveBeenCalledWith({
      policy: requestedPolicy,
    });
  });

  it.each([
    [
      "en",
      "authentication-required",
      "Authentication failed. Check the connection credentials.",
    ],
    [
      "ko",
      "authentication-required",
      "인증에 실패했습니다. 연결 자격 증명을 확인하세요.",
    ],
    [
      "en",
      "access-denied",
      "This connection does not have permission to perform that operation.",
    ],
    ["ko", "access-denied", "이 연결에는 해당 작업을 수행할 권한이 없습니다."],
  ] as const)(
    "renders neutral %s %s errors",
    async (language, type, message) => {
      await i18next.changeLanguage(language);
      mount(
        inspectionTestClient({
          inspectWorkspace: async () => {
            throw new WorkspaceSettingsError({ type });
          },
        }),
      );
      inspect();
      expect(await screen.findAllByText(message)).toHaveLength(3);
      expect(screen.queryByText("Operations")).not.toBeInTheDocument();
    },
  );

  it("preserves the selected policy across language changes without another query", async () => {
    const inspectWorkspace = vi.fn(async () => inspection);
    mount(inspectionTestClient({ inspectWorkspace }));
    inspect();
    await screen.findByText("Operations");
    fireEvent.change(screen.getByLabelText("Approval mode"), {
      target: { value: "AUTO_APPROVE" },
    });
    await act(async () => {
      await i18next.changeLanguage("ko");
    });
    expect(screen.getByLabelText("승인 모드")).toHaveValue("AUTO_APPROVE");
    expect(inspectWorkspace).toHaveBeenCalledTimes(1);
  });

  it("ignores the old connection read after disconnect and reconnect", async () => {
    const old = deferred<WorkspaceInspection>();
    const inspectWorkspace = vi
      .fn()
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce({
        ...inspection,
        connection: { ...inspection.connection, label: "Reconnected" },
      });
    mount(inspectionTestClient({ inspectWorkspace }));
    inspect();
    fireEvent.click(
      screen.getByRole("button", { name: "Disconnect Workspace" }),
    );
    expect(screen.getByText("No active connection")).toBeInTheDocument();
    inspect();
    await screen.findByText("Reconnected");
    await act(async () => {
      old.resolve(inspection);
    });
    expect(screen.getByText("Reconnected")).toBeInTheDocument();
    expect(screen.queryByText("Operations")).not.toBeInTheDocument();
  });

  it("ignores a previous client read and performs a fresh check for the replacement", async () => {
    const old = deferred<WorkspaceInspection>();
    const view = mount(
      inspectionTestClient({ inspectWorkspace: () => old.promise }),
    );
    inspect();
    const replacement = inspectionTestClient({
      inspectWorkspace: async () => ({
        ...inspection,
        connection: { ...inspection.connection, label: "Replacement" },
      }),
    });
    view.rerender(
      <BatchPlaneClientContext.Provider value={replacement}>
        <Page />
      </BatchPlaneClientContext.Provider>,
    );
    inspect();
    await screen.findByText("Replacement");
    await act(async () => {
      old.resolve(inspection);
    });
    expect(screen.queryByText("Operations")).not.toBeInTheDocument();
  });

  it.each(["installation", "policy"] as const)(
    "ignores a pending %s request after disconnect",
    async (kind) => {
      const installationRequest = deferred<WorkspaceInstallationRequest>();
      const policyRequest = deferred<WorkspacePolicyRequest>();
      mount(
        inspectionTestClient({
          inspectWorkspace: async () => ({
            ...inspection,
            installation: {
              ...inspection.installation,
              installed: false,
              availableRequest: "INSTALL",
              missingEvidence: ["installation"],
            },
          }),
          requestWorkspaceInstallation: () => installationRequest.promise,
          requestWorkspacePolicyChange: () => policyRequest.promise,
        }),
      );
      inspect();
      await screen.findByText("Operations");
      if (kind === "policy")
        fireEvent.change(screen.getByLabelText("Approval mode"), {
          target: { value: "SELF_APPROVAL_ALLOWED" },
        });
      fireEvent.click(
        screen.getByRole("button", {
          name:
            kind === "policy"
              ? "Create policy request"
              : "Create installation request",
        }),
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Disconnect Workspace" }),
      );
      await act(async () => {
        installationRequest.resolve({
          request: sourceRequest,
          installation: inspection.installation,
        });
        policyRequest.resolve({
          request: sourceRequest,
          currentPolicy: inspection.policy,
          requestedPolicy: inspection.policy,
        });
      });
      expect(
        screen.queryByRole("link", { name: sourceRequest.label }),
      ).not.toBeInTheDocument();
      expect(screen.getByText("No active connection")).toBeInTheDocument();
    },
  );

  it("does not show request success after a rejected write", async () => {
    mount(
      inspectionTestClient({
        inspectWorkspace: async () => inspection,
        requestWorkspacePolicyChange: async () => {
          throw new WorkspaceSettingsError({ type: "access-denied" });
        },
      }),
    );
    inspect();
    await screen.findByText("Operations");
    fireEvent.change(screen.getByLabelText("Approval mode"), {
      target: { value: "AUTO_APPROVE" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create policy request" }),
    );
    await screen.findByRole("alert");
    expect(
      screen.queryByText("Workspace policy request created."),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByText("Current mode").parentElement!).getByText(
        "Self-approval blocked",
      ),
    ).toBeInTheDocument();
  });

  it("ignores an unmounted inspection when the same client is used by a new page", async () => {
    const old = deferred<WorkspaceInspection>();
    const client = inspectionTestClient({
      inspectWorkspace: vi
        .fn()
        .mockReturnValueOnce(old.promise)
        .mockResolvedValueOnce({
          ...inspection,
          connection: { ...inspection.connection, label: "Fresh connection" },
        }),
    });
    const first = mount(client);
    inspect();
    first.unmount();
    mount(client);
    inspect();
    await screen.findByText("Fresh connection");
    await act(async () => {
      old.resolve(inspection);
    });
    expect(screen.queryByText("Operations")).not.toBeInTheDocument();
    expect(screen.getByText("Fresh connection")).toBeInTheDocument();
  });

  it("retranslates a recorded error without repeating the connection check", async () => {
    const inspectWorkspace = vi.fn(async () => {
      throw new WorkspaceSettingsError({ type: "access-denied" });
    });
    mount(inspectionTestClient({ inspectWorkspace }));
    inspect();
    await screen.findAllByText(
      "This connection does not have permission to perform that operation.",
    );
    await act(async () => {
      await i18next.changeLanguage("ko");
    });
    expect(
      screen.getAllByText("이 연결에는 해당 작업을 수행할 권한이 없습니다."),
    ).toHaveLength(3);
    expect(inspectWorkspace).toHaveBeenCalledTimes(1);
  });
});
