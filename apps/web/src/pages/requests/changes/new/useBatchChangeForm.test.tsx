import { act, renderHook } from "@testing-library/react";
import type { BatchChangeDraft } from "@batchplane/ui-client";
import { describe, expect, it, vi } from "vitest";

import { useBatchChangeForm } from "./useBatchChangeForm";

describe("useBatchChangeForm", () => {
  it("keeps execution settings and upload bytes in the same draft without changing business metadata or the command", async () => {
    const initialDraft = draft({
      changeRequestId: "bgc-existing",
      mode: "change",
      execution: {
        command: " ./scripts/close.sh ",
        existingFile: {
          fileName: "close.sh",
          locator: "scripts/close.sh",
        },
        platform: "GITHUB_ACTIONS",
        ref: " release/approved ",
        runnerLabel: " self-hosted, linux, payments ",
      },
    });
    const { result } = renderHook(() =>
      useBatchChangeForm({
        initialDraft,
        mode: "change",
        targetBatchId: "payment.daily-close",
      }),
    );
    const bytes = new Uint8Array([0, 1, 255]);
    const file = new File([bytes], "replacement.jar");
    Object.defineProperty(file, "arrayBuffer", {
      value: vi.fn().mockResolvedValue(bytes.buffer),
    });

    await act(async () => {
      await result.current.selectArtifact(file);
    });

    expect(result.current.draft).toMatchObject({
      batch: initialDraft.batch,
      execution: {
        command: "./scripts/close.sh",
        existingFile: initialDraft.execution.existingFile,
        platform: "GITHUB_ACTIONS",
        ref: "release/approved",
        runnerLabel: "self-hosted, linux, payments",
        upload: { bytes, fileName: "replacement.jar" },
      },
      changeRequestId: "bgc-existing",
      mode: "change",
      targetBatchId: "payment.daily-close",
    });
    expect(initialDraft.execution.upload).toBeUndefined();
    expect(result.current.execution.command).toBe(" ./scripts/close.sh ");
  });

  it("requires an explicit command after an upload", async () => {
    const initialDraft = draft();
    initialDraft.execution.command = "";
    const { result } = renderHook(() =>
      useBatchChangeForm({
        initialDraft,
        mode: "create",
        targetBatchId: "",
      }),
    );
    const file = new File(["binary"], "batch.jar");
    Object.defineProperty(file, "arrayBuffer", {
      value: vi.fn().mockResolvedValue(new ArrayBuffer(1)),
    });

    await act(async () => {
      await result.current.selectArtifact(file);
    });

    expect(result.current.draft.execution.command).toBe("");
    expect(result.current.missingFields).toContain("execution.command");
  });

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
      status: "ACTIVE",
    },
    execution: {
      command: "echo close",
      platform: "GITHUB_ACTIONS",
      ref: "main",
      runnerLabel: "ubuntu-latest",
    },
    mode: "create",
    schedules: [],
    ...overrides,
  };
}
