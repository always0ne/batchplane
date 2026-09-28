import type {
  WorkspaceInspection,
  WorkspaceInstallationRequest,
} from "@batchplane/ui-client";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BatchPlaneClientContext } from "../../../../client/batch-plane-client-context";
import { i18next } from "../../../../i18n/i18n";
import {
  deferred,
  inspectionTestClient,
} from "../../../../test/inspection-client";
import type { WorkspaceInspectionState } from "../../hooks/useWorkspaceInspection";
import { useWorkspaceInstallation } from "../../hooks/useWorkspaceInstallation";
import { WorkspaceInstallation } from "./WorkspaceInstallation";

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
const loaded: WorkspaceInspectionState = {
  type: "loaded",
  data: inspection,
  revision: 1,
};
const createdRequest: WorkspaceInstallationRequest = {
  request: {
    label: "Install request",
    sourceUrl: "https://example.test/requests/71",
  },
  installation: inspection.installation,
};

function mount(client: ReturnType<typeof inspectionTestClient>) {
  return render(
    <BatchPlaneClientContext.Provider value={client}>
      <WorkspaceInstallation inspection={loaded} />
    </BatchPlaneClientContext.Provider>,
  );
}

describe("Workspace installation", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
  });
  afterEach(() => cleanup());

  it("shows a rejected command instead of readiness or request success", async () => {
    mount(
      inspectionTestClient({
        requestWorkspaceInstallation: async () => {
          throw new Error("Request rejected");
        },
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Create installation request" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Request rejected",
    );
    expect(
      screen.queryByText("Installation evidence is missing."),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Request created.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("ignores the old client's pending installation result", async () => {
    const pending = deferred<WorkspaceInstallationRequest>();
    const view = mount(
      inspectionTestClient({
        requestWorkspaceInstallation: () => pending.promise,
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Create installation request" }),
    );
    expect(
      screen.getByText("Creating installation request..."),
    ).toBeInTheDocument();

    view.rerender(
      <BatchPlaneClientContext.Provider value={inspectionTestClient()}>
        <WorkspaceInstallation inspection={loaded} />
      </BatchPlaneClientContext.Provider>,
    );
    await act(async () => pending.resolve(createdRequest));
    expect(
      screen.queryByRole("link", { name: "Install request" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create installation request" }),
    ).toBeEnabled();
  });

  it("filters a completed request on the first render of a new inspection revision", async () => {
    const client = inspectionTestClient({
      requestWorkspaceInstallation: async () => createdRequest,
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <BatchPlaneClientContext.Provider value={client}>
        {children}
      </BatchPlaneClientContext.Provider>
    );
    const observedStates: string[] = [];
    const initialProps: { state: WorkspaceInspectionState } = { state: loaded };
    const { result, rerender } = renderHook(
      ({ state }: { state: WorkspaceInspectionState }) => {
        const installation = useWorkspaceInstallation(state);
        observedStates.push(installation.requestState.type);
        return installation;
      },
      { wrapper, initialProps },
    );
    await act(async () => result.current.createRequest("install"));
    expect(result.current.requestState.type).toBe("success");

    observedStates.length = 0;
    rerender({ state: { type: "checking", revision: 2 } });
    expect(observedStates[0]).toBe("idle");
    expect(result.current.requestState.type).toBe("idle");
  });
});
