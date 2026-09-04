import type { BatchSchedule } from "@batchplane/domain";
import type {
  BatchChangeDraft,
  GovernedChangePreview,
} from "@batchplane/ui-client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useBatchPlaneClient } from "../../client/batch-plane-client-context";
import {
  defaultBatchChangeFormValues,
  defaultScheduleValues,
  findBatchChangeMissingFields,
  toBatchChangeDraft,
  toScheduleDrafts,
  type BatchChangeFormValues,
  type ScheduleDraft,
  type UploadedArtifact,
} from "./batch-change-form";

type LoadState = "loading" | "ready" | "error";
type PreviewState =
  | { type: "idle" }
  | { type: "loading" }
  | { preview: GovernedChangePreview; type: "ready" }
  | { message: string; type: "error" };
type SubmissionState = "idle" | "submitting" | "error";

export function useBatchChangeEditor({
  mode,
  targetBatchId,
}: {
  mode: BatchChangeDraft["mode"];
  targetBatchId: string;
}) {
  const client = useBatchPlaneClient();
  const scheduleSequence = useRef(0);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState("");
  const [values, setValues] = useState<BatchChangeFormValues>(
    defaultBatchChangeFormValues,
  );
  const [governedChangeId, setGovernedChangeId] = useState("");
  const [existingArtifact, setExistingArtifact] =
    useState<BatchChangeDraft["batch"]["existingArtifact"]>();
  const [uploadedArtifact, setUploadedArtifact] = useState<UploadedArtifact>();
  const [scheduleDrafts, setScheduleDrafts] = useState<ScheduleDraft[]>([]);
  const [previewState, setPreviewState] = useState<PreviewState>({
    type: "idle",
  });
  const [submissionState, setSubmissionState] =
    useState<SubmissionState>("idle");
  const [submissionError, setSubmissionError] = useState("");

  const draft = useMemo(
    () =>
      toBatchChangeDraft({
        artifact: uploadedArtifact,
        existingArtifact,
        governedChangeId,
        mode,
        scheduleDrafts,
        values,
      }),
    [
      existingArtifact,
      governedChangeId,
      mode,
      scheduleDrafts,
      uploadedArtifact,
      values,
    ],
  );
  const missingFields = useMemo(
    () => findBatchChangeMissingFields({ mode, scheduleDrafts, values }),
    [mode, scheduleDrafts, values],
  );

  useEffect(() => {
    let isCurrent = true;

    async function loadDraft() {
      setLoadState("loading");
      setPreviewState({ type: "idle" });
      setSubmissionState("idle");
      setSubmissionError("");

      try {
        const loadedDraft = await client.loadBatchChangeDraft({
          ...(targetBatchId ? { batchId: targetBatchId } : {}),
          mode,
        });
        if (!isCurrent) return;

        setValues({ ...loadedDraft.batch });
        setGovernedChangeId(loadedDraft.governedChangeId ?? "");
        setExistingArtifact(loadedDraft.batch.existingArtifact);
        setUploadedArtifact(undefined);
        setScheduleDrafts(toScheduleDrafts(loadedDraft.schedules));
        setLoadState("ready");
      } catch (error) {
        if (!isCurrent) return;
        setLoadError(messageFrom(error));
        setLoadState("error");
      }
    }

    void loadDraft();
    return () => {
      isCurrent = false;
    };
  }, [client, mode, targetBatchId]);

  useEffect(() => {
    let isCurrent = true;
    if (loadState !== "ready" || missingFields.length > 0) {
      setPreviewState({ type: "idle" });
      return () => {
        isCurrent = false;
      };
    }

    async function loadPreview() {
      setPreviewState({ type: "loading" });
      try {
        const preview = await client.previewBatchChange(draft);
        if (isCurrent) setPreviewState({ preview, type: "ready" });
      } catch (error) {
        if (isCurrent)
          setPreviewState({ message: messageFrom(error), type: "error" });
      }
    }

    void loadPreview();
    return () => {
      isCurrent = false;
    };
  }, [client, draft, loadState, missingFields.length]);

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
      setSubmissionError(messageFrom(error));
      setSubmissionState("error");
    }
  }, []);
  const addSchedule = useCallback(() => {
    scheduleSequence.current += 1;
    setScheduleDrafts((current) => [
      ...current,
      {
        key: `new-${scheduleSequence.current}`,
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
  const submit = useCallback(async () => {
    if (missingFields.length > 0 || previewState.type !== "ready") return null;
    if (previewState.preview.files.every((file) => file.status === "UNCHANGED"))
      return null;

    setSubmissionState("submitting");
    setSubmissionError("");
    try {
      const result = await client.createBatchChangeRequest(draft);
      setSubmissionState("idle");
      return result.request.requestLocator;
    } catch (error) {
      setSubmissionError(messageFrom(error));
      setSubmissionState("error");
      return null;
    }
  }, [client, draft, missingFields.length, previewState]);

  return {
    addSchedule,
    draft,
    existingArtifact,
    loadError,
    loadState,
    missingFields,
    previewState,
    removeSchedule,
    restoreSchedule,
    scheduleDrafts,
    selectArtifact,
    submissionError,
    submissionState,
    submit,
    updateSchedule,
    updateValue,
    values,
  };
}

function messageFrom(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : "";
}
