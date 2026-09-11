import type { BatchSchedule } from "@batchplane/domain";
import type { BatchChangeDraft } from "@batchplane/ui-client";
import { useCallback, useMemo, useRef, useState } from "react";

import {
  defaultScheduleValues,
  findBatchChangeMissingFields,
  toBatchChangeDraft,
  toScheduleDrafts,
  type BatchChangeFormValues,
  type ScheduleDraft,
  type UploadedArtifact,
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
  const [uploadedArtifact, setUploadedArtifact] = useState<UploadedArtifact>();
  const [scheduleDrafts, setScheduleDrafts] = useState<ScheduleDraft[]>(() =>
    toScheduleDrafts(initialDraft.schedules),
  );
  const [artifactError, setArtifactError] = useState<string>();

  const draft = useMemo(
    () =>
      toBatchChangeDraft({
        artifact: uploadedArtifact,
        existingArtifact: initialDraft.batch.existingArtifact,
        governedChangeId: initialDraft.governedChangeId ?? "",
        mode,
        scheduleDrafts,
        targetBatchId: mode === "create" ? undefined : targetBatchId,
        values,
      }),
    [
      initialDraft.batch.existingArtifact,
      initialDraft.governedChangeId,
      mode,
      scheduleDrafts,
      targetBatchId,
      uploadedArtifact,
      values,
    ],
  );
  const missingFields = useMemo(
    () => findBatchChangeMissingFields({ mode, scheduleDrafts, values }),
    [mode, scheduleDrafts, values],
  );

  const updateValue = useCallback(
    (field: keyof BatchChangeFormValues, value: string) => {
      setValues((current) => ({ ...current, [field]: value }));
    },
    [],
  );
  const selectArtifact = useCallback(async (file?: File) => {
    if (!file) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      setUploadedArtifact({ bytes, fileName: file.name });
      setValues((current) => ({ ...current, artifactFileName: file.name }));
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
    existingArtifact: initialDraft.batch.existingArtifact,
    missingFields,
    removeSchedule,
    restoreSchedule,
    scheduleDrafts,
    selectArtifact,
    updateSchedule,
    updateValue,
    values,
  };
}

function messageFrom(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : "";
}
