import type { BatchChangeDraft } from "@batchplane/ui-client";

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
  const artifactBlocked =
    form.isReadingArtifact || form.artifactError !== undefined;
  const preview = useBatchChangePreview({
    draft: form.draft,
    isReady: form.missingFields.length === 0 && !artifactBlocked,
  });
  const previewState = artifactBlocked ? { type: "idle" as const } : preview;
  const submission = useBatchChangeSubmission({
    artifactBlocked,
    draft: form.draft,
    missingFields: form.missingFields,
    previewState,
  });

  return {
    form,
    previewState,
    submission,
    submit: submission.submit,
  };
}
