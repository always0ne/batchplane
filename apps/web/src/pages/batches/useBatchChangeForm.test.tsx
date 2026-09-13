import { act, renderHook } from "@testing-library/react";
import type { BatchChangeDraft } from "@batchplane/ui-client";
import { describe, expect, it } from "vitest";

import { useBatchChangeForm } from "./useBatchChangeForm";

describe("useBatchChangeForm", () => {
  it("assigns schedule keys before the state update", () => {
    const { result } = renderHook(() =>
      useBatchChangeForm({
        initialDraft: draft(),
        mode: "create",
        targetBatchId: "",
      }),
    );

    act(() => {
      result.current.addSchedule();
      result.current.addSchedule();
    });

    expect(
      result.current.scheduleDrafts.map((schedule) => schedule.key),
    ).toEqual(["new-1", "new-2"]);
  });

  it("retains an artifact read failure even when the Error message is empty", async () => {
    const { result } = renderHook(() =>
      useBatchChangeForm({
        initialDraft: draft(),
        mode: "create",
        targetBatchId: "",
      }),
    );
    const file = {
      arrayBuffer: async () => Promise.reject(new Error("")),
    } as File;

    await act(async () => {
      await result.current.selectArtifact(file);
    });

    expect(result.current.artifactError).toBe("");
  });

  it("lets an explicit owner be cleared and replaced without restoring the old owner", () => {
    const { result } = renderHook(() =>
      useBatchChangeForm({
        initialDraft: draft({ defaultOwner: "developer" }),
        mode: "create",
        targetBatchId: "",
      }),
    );

    act(() => {
      result.current.updateValue("owner", "");
      result.current.updateValue("owner", "release-manager");
    });

    expect(result.current.values.owner).toBe("release-manager");
    expect(result.current.draft.batch.owner).toBe("release-manager");
  });

  it("uses the authenticated default only at the preview and blur boundary", () => {
    const { result } = renderHook(() =>
      useBatchChangeForm({
        initialDraft: draft({ defaultOwner: "developer" }),
        mode: "change",
        targetBatchId: "payment.daily-close",
      }),
    );

    act(() => {
      result.current.updateValue("owner", "   ");
    });
    expect(result.current.values.owner).toBe("   ");
    expect(result.current.draft.batch.owner).toBe("developer");
    expect(result.current.missingFields).not.toContain("owner");

    act(() => {
      result.current.resolveOwnerDefault();
    });
    expect(result.current.values.owner).toBe("developer");
  });
});

function draft(overrides: Partial<BatchChangeDraft> = {}): BatchChangeDraft {
  return {
    batch: {
      batchId: "payment.daily-close",
      criticality: "MEDIUM",
      domain: "payments",
      environment: "PROD",
      name: "Daily close",
      owner: "ops-team",
      runCommand: "echo close",
      runnerLabel: "ubuntu-latest",
      status: "ACTIVE",
      workflowRef: "main",
    },
    mode: "create",
    schedules: [],
    ...overrides,
  };
}
