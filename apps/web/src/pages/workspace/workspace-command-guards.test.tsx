import type { ReactNode } from "react";
import type { WorkspaceInspection } from "@batchplane/ui-client";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BatchPlaneClientContext } from "../../client/batch-plane-client-context";
import { inspectionTestClient } from "../../test/inspection-client";
import type { WorkspaceInspectionState } from "./useWorkspaceInspection";
import { useWorkspaceInstallation } from "./useWorkspaceInstallation";
import { useWorkspacePolicy } from "./useWorkspacePolicy";

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

const unverifiedInspections: WorkspaceInspectionState[] = [
  { type: "idle", revision: 1 },
  { type: "checking", revision: 2 },
  { type: "error", error: new Error("connection failed"), revision: 3 },
];

describe("Workspace command guards", () => {
  it.each(unverifiedInspections)(
    "does not call product commands for a %s inspection",
    async (inspectionState) => {
      const requestWorkspaceInstallation = vi.fn();
      const requestWorkspacePolicyChange = vi.fn();
      const client = inspectionTestClient({
        requestWorkspaceInstallation,
        requestWorkspacePolicyChange,
      });
      const wrapper = ({ children }: { children: ReactNode }) => (
        <BatchPlaneClientContext.Provider value={client}>
          {children}
        </BatchPlaneClientContext.Provider>
      );
      const { result } = renderHook(
        () => ({
          installation: useWorkspaceInstallation(inspectionState),
          policy: useWorkspacePolicy(inspectionState),
        }),
        { wrapper },
      );

      await act(async () => {
        await result.current.installation.request("install");
        await result.current.policy.request();
      });

      expect(requestWorkspaceInstallation).not.toHaveBeenCalled();
      expect(requestWorkspacePolicyChange).not.toHaveBeenCalled();
    },
  );

  it("does not call product commands after a verified inspection is invalidated", async () => {
    const requestWorkspaceInstallation = vi.fn();
    const requestWorkspacePolicyChange = vi.fn();
    const client = inspectionTestClient({
      requestWorkspaceInstallation,
      requestWorkspacePolicyChange,
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <BatchPlaneClientContext.Provider value={client}>
        {children}
      </BatchPlaneClientContext.Provider>
    );
    const { result, rerender } = renderHook(
      ({ inspectionState }: { inspectionState: WorkspaceInspectionState }) => ({
        installation: useWorkspaceInstallation(inspectionState),
        policy: useWorkspacePolicy(inspectionState),
      }),
      {
        initialProps: {
          inspectionState: { type: "loaded", data: inspection, revision: 1 },
        },
        wrapper,
      },
    );

    rerender({ inspectionState: { type: "idle", revision: 2 } });
    await act(async () => {
      await result.current.installation.request("install");
      await result.current.policy.request();
    });

    expect(requestWorkspaceInstallation).not.toHaveBeenCalled();
    expect(requestWorkspacePolicyChange).not.toHaveBeenCalled();
  });
});
