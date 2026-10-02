import type { ExecutionRequestDraft } from "@batchplane/ui-client";

import type { ExecutionRequestPreviewState } from "../hooks/useExecutionRequestPreview";
import type { ExecutionRequestSubmissionState } from "../hooks/useExecutionRequestSubmission";
import { ExecutionRequestReviewSummary } from "./ExecutionRequestReviewSummary";
import { ExecutionRequestPayloadPreview } from "./ExecutionRequestPayloadPreview";

export function ExecutionRequestReview({
  batch,
  canSubmit,
  previewState,
  submitState,
  workspaceApprovalMode,
}: {
  batch: ExecutionRequestDraft["batch"];
  canSubmit: boolean;
  previewState: ExecutionRequestPreviewState;
  submitState: ExecutionRequestSubmissionState;
  workspaceApprovalMode: ExecutionRequestDraft["workspaceApprovalMode"];
}) {
  return (
    <aside className="min-w-0 space-y-4">
      <ExecutionRequestReviewSummary
        batch={batch}
        canSubmit={canSubmit}
        previewState={previewState}
        submitState={submitState}
        workspaceApprovalMode={workspaceApprovalMode}
      />
      <ExecutionRequestPayloadPreview previewState={previewState} />
    </aside>
  );
}
