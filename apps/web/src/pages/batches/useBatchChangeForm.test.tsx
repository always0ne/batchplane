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
});

function draft(): BatchChangeDraft {
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
  };
}
