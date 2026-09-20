import type { BatchChangeDraft } from "@batchplane/ui-client";
import { useCallback } from "react";

import { useBatchChangeForm } from "./useBatchChangeForm";
import { useBatchChangePreview } from "./useBatchChangePreview";
import { useBatchChangeSubmission } from "./useBatchChangeSubmission";

export function useBatchChangeEditor({
  initialDraft,
  mode,
  targetBatchId,
}: {
  initialDraft: BatchChangeDraft;
  mode: BatchChangeDraft["mode"];
  targetBatchId: string;
}) {
  const form = useBatchChangeForm({ initialDraft, mode, targetBatchId });
  const previewState = useBatchChangePreview({
    draft: form.draft,
    isReady: form.missingFields.length === 0,
  });
  const submission = useBatchChangeSubmission({
    draft: form.draft,
    missingFields: form.missingFields,
    previewState,
  });
  const { clearArtifactError } = form;
  const { submit: submitChange } = submission;
  const submit = useCallback(async () => {
    clearArtifactError();
    return submitChange();
  }, [clearArtifactError, submitChange]);

  return {
    ...form,
    previewState,
    submissionError: form.artifactError ?? submission.error,
    submissionState:
      form.artifactError !== undefined ? "error" : submission.state,
    submit,
  };
}
