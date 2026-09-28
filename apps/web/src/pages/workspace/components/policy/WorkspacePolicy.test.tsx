import {
  WorkspaceSettingsError,
  type WorkspaceInspection,
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
import { BatchPlaneClientContext } from "../../../../client/batch-plane-client-context";
import { i18next } from "../../../../i18n/i18n";
import {
  deferred,
  inspectionTestClient,
} from "../../../../test/inspection-client";
import type { WorkspaceInspectionState } from "../../hooks/useWorkspaceInspection";
import { WorkspacePolicy } from "./WorkspacePolicy";

const inspection: WorkspaceInspection = {
  connection: {
    label: "Operations",
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
  policy: { approval: { mode: "SELF_APPROVAL_BLOCKED" } },
};

const loaded: WorkspaceInspectionState = {
  type: "loaded",
  data: inspection,
  revision: 1,
};

function policyResult(): WorkspacePolicyRequest {
  return {
    request: {
      label: "Request 71",
      sourceUrl: "https://example.test/requests/71",
    },
    currentPolicy: { approval: { mode: "SELF_APPROVAL_ALLOWED" } },
    requestedPolicy: { approval: { mode: "AUTO_APPROVE" } },
  };
}

function mount(
  client: ReturnType<typeof inspectionTestClient>,
  state: WorkspaceInspectionState = loaded,
) {
  return render(
    <BatchPlaneClientContext.Provider value={client}>
      <WorkspacePolicy inspection={state} />
    </BatchPlaneClientContext.Provider>,
  );
}

function selectMode(mode: string) {
  fireEvent.change(screen.getByLabelText("Approval mode"), {
    target: { value: mode },
  });
}

function createRequest() {
  fireEvent.click(
    screen.getByRole("button", { name: "Create policy request" }),
  );
}

describe("Workspace policy", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
  });

  afterEach(async () => {
    cleanup();
    await i18next.changeLanguage("en");
  });

  it("keeps selected, applied, and requested modes distinct after creation", async () => {
    const requestWorkspacePolicyChange = vi.fn(async () => policyResult());
    mount(inspectionTestClient({ requestWorkspacePolicyChange }));
    expect(
      screen.getByRole("button", { name: "Create policy request" })
        .parentElement,
    ).toHaveAttribute(
      "title",
      i18next.t("settings:workspacePolicy.chooseDifferentMode"),
    );
    selectMode("AUTO_APPROVE");
    createRequest();

    const link = await screen.findByRole("link", { name: "Request 71" });
    expect(link).toHaveAttribute("href", policyResult().request.sourceUrl);
    expect(screen.getByLabelText("Approval mode")).toHaveValue("AUTO_APPROVE");
    expect(
      within(screen.getByText("Current mode").parentElement!).getByText(
        "Self-approval allowed",
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByText("Requested mode").parentElement!).getByText(
        "Auto-approve",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Workspace policy request created."),
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
      policy: { approval: { mode: "AUTO_APPROVE" } },
    });
  });

  it("keeps one selection input across pending, success, and locale changes", async () => {
    const pending = deferred<WorkspacePolicyRequest>();
    mount(
      inspectionTestClient({
        requestWorkspacePolicyChange: () => pending.promise,
      }),
    );
    const select = screen.getByLabelText("Approval mode");
    selectMode("AUTO_APPROVE");
    createRequest();
    expect(
      screen.getByText("Creating Workspace policy request..."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Approval mode")).toBe(select);
    expect(
      screen.getByRole("button", { name: "Create policy request" }),
    ).toBeDisabled();

    selectMode("SELF_APPROVAL_ALLOWED");
    select.focus();
    expect(select).toHaveValue("SELF_APPROVAL_ALLOWED");
    await act(async () => {
      pending.resolve(policyResult());
    });
    expect(screen.getByLabelText("Approval mode")).toBe(select);
    expect(select).toHaveFocus();
    expect(select).toHaveValue("SELF_APPROVAL_ALLOWED");
    expect(
      screen.getByRole("link", { name: "Request 71" }),
    ).toBeInTheDocument();
    selectMode("SELF_APPROVAL_BLOCKED");
    expect(screen.getByLabelText("Approval mode")).toBe(select);

    await act(async () => {
      await i18next.changeLanguage("ko");
    });
    expect(screen.getByLabelText("승인 모드")).toBe(select);
    expect(select).toHaveFocus();
    expect(select).toHaveValue("SELF_APPROVAL_BLOCKED");
  });

  it("shows request errors without a success result and re-translates them", async () => {
    const requestWorkspacePolicyChange = vi.fn(async () => {
      throw new WorkspaceSettingsError({ type: "access-denied" });
    });
    mount(inspectionTestClient({ requestWorkspacePolicyChange }));
    selectMode("AUTO_APPROVE");
    createRequest();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This connection does not have permission to perform that operation.",
    );
    expect(screen.queryByText("Requested mode")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Request 71" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create policy request" }),
    ).toBeEnabled();

    await act(async () => {
      await i18next.changeLanguage("ko");
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "이 연결에는 해당 작업을 수행할 권한이 없습니다.",
    );
    expect(requestWorkspacePolicyChange).toHaveBeenCalledTimes(1);
  });

  it("resets the selection on a new inspection and ignores the old request", async () => {
    const pending = deferred<WorkspacePolicyRequest>();
    const client = inspectionTestClient({
      requestWorkspacePolicyChange: () => pending.promise,
    });
    const view = mount(client);
    selectMode("AUTO_APPROVE");
    createRequest();

    view.rerender(
      <BatchPlaneClientContext.Provider value={client}>
        <WorkspacePolicy inspection={{ type: "idle", revision: 2 }} />
      </BatchPlaneClientContext.Provider>,
    );
    expect(screen.getByLabelText("Approval mode")).toHaveValue(
      "SELF_APPROVAL_BLOCKED",
    );
    expect(screen.getByLabelText("Approval mode")).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Create policy request" }),
    ).toBeDisabled();
    await act(async () => {
      pending.resolve(policyResult());
    });
    expect(
      screen.queryByRole("link", { name: "Request 71" }),
    ).not.toBeInTheDocument();
  });

  it("ignores a pending request from a replaced client", async () => {
    const pending = deferred<WorkspacePolicyRequest>();
    const original = inspectionTestClient({
      requestWorkspacePolicyChange: () => pending.promise,
    });
    const view = mount(original);
    selectMode("AUTO_APPROVE");
    createRequest();

    const replacement = inspectionTestClient();
    view.rerender(
      <BatchPlaneClientContext.Provider value={replacement}>
        <WorkspacePolicy inspection={loaded} />
      </BatchPlaneClientContext.Provider>,
    );
    expect(screen.getByLabelText("Approval mode")).toHaveValue(
      "SELF_APPROVAL_BLOCKED",
    );
    await act(async () => {
      pending.resolve(policyResult());
    });
    expect(
      screen.queryByRole("link", { name: "Request 71" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create policy request" }),
    ).toBeDisabled();
  });
});
