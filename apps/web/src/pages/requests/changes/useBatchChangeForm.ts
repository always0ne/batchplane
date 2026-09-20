import type { BatchSchedule } from "@batchplane/domain";
import type {
  BatchChangeDraft,
  GitHubActionsExecutionSettings,
} from "@batchplane/ui-client";
import { useCallback, useMemo, useRef, useState } from "react";

import {
  defaultScheduleValues,
  findBatchChangeMissingFields,
  toBatchChangeDraft,
  toScheduleDrafts,
  type BatchChangeFormValues,
  type ScheduleDraft,
} from "./batch-change-form";

export function useBatchChangeForm({
  initialDraft,
  mode,
  targetBatchId,
}: {
  initialDraft: BatchChangeDraft;
  mode: BatchChangeDraft["mode"];
  targetBatchId: string;
}) {
  const scheduleSequence = useRef(0);
  const [values, setValues] = useState<BatchChangeFormValues>(() => ({
    ...initialDraft.batch,
  }));
  const [execution, setExecution] = useState<GitHubActionsExecutionSettings>(
    () => ({ ...initialDraft.execution }),
  );
  const [scheduleDrafts, setScheduleDrafts] = useState<ScheduleDraft[]>(() =>
    toScheduleDrafts(initialDraft.schedules),
  );
  const [artifactError, setArtifactError] = useState<string>();

  const resolvedValues = useMemo(
    () => ({
      ...values,
      owner: values.owner.trim() || initialDraft.defaultOwner || "",
    }),
    [initialDraft.defaultOwner, values],
  );
  const draft = useMemo(
    () =>
      toBatchChangeDraft({
        execution,
        governedChangeId: initialDraft.governedChangeId ?? "",
        mode,
        scheduleDrafts,
        targetBatchId: mode === "create" ? undefined : targetBatchId,
        values: resolvedValues,
      }),
    [
      initialDraft.governedChangeId,
      mode,
      scheduleDrafts,
      targetBatchId,
      execution,
      resolvedValues,
    ],
  );
  const missingFields = useMemo(
    () =>
      findBatchChangeMissingFields({
        mode,
        execution,
        scheduleDrafts,
        values: resolvedValues,
      }),
    [execution, mode, resolvedValues, scheduleDrafts],
  );

  const updateValue = useCallback(
    (field: keyof BatchChangeFormValues, value: string) => {
      setValues((current) => ({ ...current, [field]: value }));
    },
    [],
  );
  const resolveOwnerDefault = useCallback(() => {
    const defaultOwner = initialDraft.defaultOwner?.trim();
    if (!defaultOwner) return;
    setValues((current) =>
      current.owner.trim() ? current : { ...current, owner: defaultOwner },
    );
  }, [initialDraft.defaultOwner]);
  const selectArtifact = useCallback(async (file?: File) => {
    if (!file) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      setExecution((current) => ({
        ...current,
        upload: { bytes, fileName: file.name },
      }));
    } catch (error) {
      setArtifactError(messageFrom(error));
    }
  }, []);
  const clearArtifactError = useCallback(() => setArtifactError(undefined), []);
  const addSchedule = useCallback(() => {
    scheduleSequence.current += 1;
    const key = `new-${scheduleSequence.current}`;
    setScheduleDrafts((current) => [
      ...current,
      {
        key,
        source: "new",
        status: "active",
        values: { ...defaultScheduleValues },
      },
    ]);
  }, []);
  const updateSchedule = useCallback((key: string, values: BatchSchedule) => {
    setScheduleDrafts((current) =>
      current.map((schedule) =>
        schedule.key === key ? { ...schedule, values } : schedule,
      ),
    );
  }, []);
  const removeSchedule = useCallback((key: string) => {
    setScheduleDrafts((current) =>
      current.flatMap((schedule) => {
        if (schedule.key !== key) return [schedule];
        return schedule.source === "new"
          ? []
          : [{ ...schedule, status: "deleted" }];
      }),
    );
  }, []);
  const restoreSchedule = useCallback((key: string) => {
    setScheduleDrafts((current) =>
      current.map((schedule) =>
        schedule.key === key ? { ...schedule, status: "active" } : schedule,
      ),
    );
  }, []);

  return {
    addSchedule,
    artifactError,
    clearArtifactError,
    draft,
    execution,
    missingFields,
    removeSchedule,
    resolveOwnerDefault,
    restoreSchedule,
    scheduleDrafts,
    selectArtifact,
    updateSchedule,
    setExecution,
    updateValue,
    values,
  };
}

function messageFrom(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : "";
}
