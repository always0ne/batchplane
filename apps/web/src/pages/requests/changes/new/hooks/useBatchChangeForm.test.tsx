import { act, renderHook } from "@testing-library/react";
import type { BatchChangeDraft } from "@batchplane/ui-client";
import { describe, expect, it, vi } from "vitest";

import { useBatchChangeForm } from "./useBatchChangeForm";

describe("useBatchChangeForm", () => {
  it("keeps defaults and independent schedule values in one draft, including exact empty and multiline strings", () => {
    const exact = " 001\n한글\n ";
    const initialDraft = draft({
      sensitiveInputsAvailable: true,
      parameters: [
        {
          name: "Report",
          required: true,
          sensitive: false,
          defaultValue: { kind: "VALUE", value: exact },
        },
        { name: "Optional", required: false, sensitive: false },
      ],
      schedules: [
        {
          scheduleId: "morning",
          name: "Morning",
          cron: "0 5 * * *",
          timezone: "UTC",
          enabled: true,
          parameters: [
            { name: "Report", source: "DEFAULT" },
            { name: "Optional", source: "OMIT" },
          ],
        },
        {
          scheduleId: "evening",
          name: "Evening",
          cron: "0 17 * * *",
          timezone: "UTC",
          enabled: true,
          parameters: [
            {
              name: "Report",
              source: "VALUE",
              value: { kind: "VALUE", value: "" },
            },
            {
              name: "Optional",
              source: "VALUE",
              value: { kind: "VALUE", value: exact },
            },
          ],
        },
      ],
    });
    const { result } = renderHook(() =>
      useBatchChangeForm({
        initialDraft,
        mode: "change",
        targetBatchId: initialDraft.batch.batchId,
      }),
    );
    expect(result.current.draft.parameters).toEqual(initialDraft.parameters);
    expect(result.current.draft.schedules).toEqual(initialDraft.schedules);
    expect(result.current.draft.sensitiveInputsAvailable).toBe(true);
    act(() => {
      result.current.parameterEditor.update("existing-0", {
        ...initialDraft.parameters![0]!,
        defaultValue: { kind: "VALUE", value: "new default" },
      });
    });
    expect(result.current.draft.schedules).toEqual(initialDraft.schedules);
    expect(result.current.missingFields).not.toContain("parameters");
  });

  it("preserves saved references without setup but clears sensitive defaults and schedule overrides when made ordinary", () => {
    const initialDraft = draft({
      sensitiveInputsAvailable: false,
      parameters: [
        {
          name: "Token",
          required: true,
          sensitive: true,
          defaultValue: { kind: "SAVED", reference: "opaque-default" },
        },
      ],
      schedules: [
        {
          scheduleId: "daily",
          name: "Daily",
          cron: "0 5 * * *",
          timezone: "UTC",
          enabled: true,
          parameters: [
            {
              name: "Token",
              source: "VALUE",
              value: { kind: "SAVED", reference: "opaque-schedule" },
            },
          ],
        },
      ],
    });
    const { result } = renderHook(() =>
      useBatchChangeForm({
        initialDraft,
        mode: "change",
        targetBatchId: initialDraft.batch.batchId,
      }),
    );
    expect(result.current.missingFields).not.toContain("parameters");
    expect(result.current.draft.parameters).toEqual(initialDraft.parameters);
    act(() => {
      result.current.parameterEditor.update("existing-0", {
        ...initialDraft.parameters![0]!,
        sensitive: false,
      });
    });
    expect(result.current.draft.parameters).toEqual([
      { name: "Token", required: true, sensitive: false },
    ]);
    expect(result.current.draft.schedules[0]!.parameters).toEqual([
      { name: "Token", source: "DEFAULT" },
    ]);
    expect(JSON.stringify(result.current.draft)).not.toContain("opaque-");
    expect(result.current.missingFields).toContain("parameters");
    act(() => {
      result.current.updateSchedule("existing-daily", {
        ...initialDraft.schedules[0]!,
        parameters: [
          {
            name: "Token",
            source: "VALUE",
            value: { kind: "VALUE", value: "" },
          },
        ],
      });
    });
    expect(result.current.missingFields).not.toContain("parameters");
  });

  it("rejects names without normalizing them and removes stale selections when a definition is removed", () => {
    const { result } = renderHook(() =>
      useBatchChangeForm({
        initialDraft: draft({
          parameters: [{ name: "Report", required: false, sensitive: false }],
          schedules: [
            {
              scheduleId: "daily",
              name: "Daily",
              cron: "0 5 * * *",
              timezone: "UTC",
              enabled: true,
              parameters: [
                {
                  name: "Report",
                  source: "VALUE",
                  value: { kind: "VALUE", value: "old" },
                },
              ],
            },
          ],
        }),
        mode: "create",
        targetBatchId: "",
      }),
    );
    act(() => {
      result.current.parameterEditor.add();
    });
    act(() => {
      result.current.parameterEditor.update("new-1", {
        name: "report",
        required: false,
        sensitive: false,
      });
    });
    expect(result.current.missingFields).toContain("parameters");
    act(() => {
      result.current.parameterEditor.update("new-1", {
        name: " spaced ",
        required: false,
        sensitive: false,
      });
    });
    expect(result.current.draft.parameters![1]!.name).toBe(" spaced ");
    expect(result.current.missingFields).toContain("parameters");
    act(() => {
      result.current.parameterEditor.remove("existing-0");
    });
    expect(result.current.draft.schedules[0]!.parameters).toEqual([
      { name: " spaced ", source: "OMIT" },
    ]);
  });

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
    expect(result.current.draft).not.toHaveProperty("parameters");
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

  it.each(["success", "error"])(
    "keeps the latest selected artifact when an older read completes with %s",
    async (outcome) => {
      const { result } = renderHook(() =>
        useBatchChangeForm({
          initialDraft: draft(),
          mode: "create",
          targetBatchId: "",
        }),
      );
      let resolve: (bytes: ArrayBuffer) => void = () => undefined;
      let reject: (error: Error) => void = () => undefined;
      const olderRead = new Promise<ArrayBuffer>((yes, no) => {
        resolve = yes;
        reject = no;
      });
      const older = new File([], "older.jar");
      Object.defineProperty(older, "arrayBuffer", { value: () => olderRead });
      const latest = new File([], "latest.jar");
      const bytes = new Uint8Array([9, 8]);
      Object.defineProperty(latest, "arrayBuffer", {
        value: async () => bytes.buffer,
      });
      let olderSelection: Promise<void>;
      act(() => {
        olderSelection = result.current.selectArtifact(older);
      });
      await act(async () => {
        await result.current.selectArtifact(latest);
      });
      await act(async () => {
        if (outcome === "success") resolve(new ArrayBuffer(1));
        else reject(new Error("Older read failed"));
        await olderSelection;
      });
      expect(result.current.draft.execution.upload).toEqual({
        bytes,
        fileName: "latest.jar",
      });
      expect(result.current.artifactError).toBeUndefined();
    },
  );

  it("gives two schedules added in one update distinct keys", () => {
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

    const keys = result.current.scheduleDrafts.map((schedule) => schedule.key);
    expect(keys).toHaveLength(2);
    expect([...new Set(keys)]).toHaveLength(2);
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
