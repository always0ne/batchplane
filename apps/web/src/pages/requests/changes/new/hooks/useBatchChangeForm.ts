import type { BatchSchedule } from "@batchplane/domain";
import type {
  BatchChangeDraft,
  GitHubActionsExecutionSettings,
} from "@batchplane/ui-client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  defaultScheduleValues,
  findBatchChangeMissingFields,
  toBatchChangeDraft,
  toScheduleDrafts,
  type BatchChangeFormValues,
  type ScheduleDraft,
} from "../batch-change-form";
import { useBatchParameterDefinitions } from "./useBatchParameterDefinitions";
import {
  parameterDefinitionProblems,
  reconcileScheduleParameters,
} from "../batch-parameter-definitions";
import {
  initialParameterSelection,
  parameterSelectionProblems,
} from "../../../parameters/parameter-selections";

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
  const parameterEditor = useBatchParameterDefinitions(
    initialDraft.parameters ?? [],
    (previous, next) => {
      setScheduleDrafts((current) =>
        current.map((schedule) => {
          const values = { ...schedule.values };
          if (next.length === 0) delete values.parameters;
          else
            values.parameters = reconcileScheduleParameters(
              previous,
              next,
              schedule.values.parameters,
            );
          return { ...schedule, values };
        }),
      );
    },
  );
  const sensitiveInputsAvailable =
    initialDraft.sensitiveInputsAvailable === true;
  const [artifactError, setArtifactError] = useState<string>();
  const [isReadingArtifact, setIsReadingArtifact] = useState(false);
  const artifactReadSequence = useRef(0);
  useEffect(
    () => () => {
      artifactReadSequence.current += 1;
    },
    [],
  );

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
        changeRequestId: initialDraft.changeRequestId ?? "",
        mode,
        scheduleDrafts,
        targetBatchId: mode === "create" ? undefined : targetBatchId,
        values: resolvedValues,
        parameters:
          initialDraft.parameters !== undefined ||
          parameterEditor.definitions.length > 0
            ? parameterEditor.definitions
            : undefined,
        sensitiveInputsAvailable: initialDraft.sensitiveInputsAvailable,
        sensitiveInputsUnavailableReason:
          initialDraft.sensitiveInputsUnavailableReason,
      }),
    [
      initialDraft.changeRequestId,
      mode,
      scheduleDrafts,
      targetBatchId,
      execution,
      resolvedValues,
      parameterEditor.definitions,
      initialDraft.sensitiveInputsAvailable,
      initialDraft.sensitiveInputsUnavailableReason,
      initialDraft.parameters,
    ],
  );
  const missingFields = useMemo(() => {
    const fields = findBatchChangeMissingFields({
      mode,
      execution,
      scheduleDrafts,
      values: resolvedValues,
    });
    const parameterProblems = parameterDefinitionProblems(
      parameterEditor.definitions,
      sensitiveInputsAvailable,
    );
    const scheduleProblems = scheduleDrafts
      .filter((schedule) => schedule.status === "active")
      .some(
        (schedule) =>
          parameterSelectionProblems(
            parameterEditor.definitions,
            schedule.values.parameters ?? [],
            sensitiveInputsAvailable,
          ).length > 0,
      );
    if (mode !== "delete" && (parameterProblems.length > 0 || scheduleProblems))
      fields.push("parameters");
    return fields;
  }, [
    execution,
    mode,
    resolvedValues,
    scheduleDrafts,
    parameterEditor.definitions,
    sensitiveInputsAvailable,
  ]);

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
    const sequence = ++artifactReadSequence.current;
    setIsReadingArtifact(true);
    setExecution((current) => ({ ...current, upload: undefined }));
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (sequence !== artifactReadSequence.current) return;
      setExecution((current) => ({
        ...current,
        upload: { bytes, fileName: file.name },
      }));
      setArtifactError(undefined);
    } catch (error) {
      if (sequence !== artifactReadSequence.current) return;
      setArtifactError(messageFrom(error));
    } finally {
      if (sequence === artifactReadSequence.current)
        setIsReadingArtifact(false);
    }
  }, []);
  const addSchedule = useCallback(() => {
    scheduleSequence.current += 1;
    const key = `new-${scheduleSequence.current}`;
    setScheduleDrafts((current) => [
      ...current,
      {
        key,
        source: "new",
        status: "active",
        values: {
          ...defaultScheduleValues,
          ...(parameterEditor.definitions.length > 0
            ? {
                parameters: parameterEditor.definitions.map(
                  initialParameterSelection,
                ),
              }
            : {}),
        },
      },
    ]);
  }, [parameterEditor.definitions]);
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
    parameterEditor,
    sensitiveInputsAvailable,
    addSchedule,
    sensitiveInputsUnavailableReason:
      initialDraft.sensitiveInputsUnavailableReason,
    artifactError,
    isReadingArtifact,
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
