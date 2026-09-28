import type { BatchChangeDraft } from "@batchplane/ui-client";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { PageHeader } from "../../../../../components/PageHeader";
import { batchChangeCopy } from "../batch-change-copy";
import { useBatchChangeEditor } from "../hooks/useBatchChangeEditor";
import { BatchChangeFields } from "./BatchChangeFields";
import { BatchChangeReview } from "./BatchChangeReview";

export function BatchChangeEditorSession({
  initialDraft,
  mode,
  targetBatchId,
}: {
  initialDraft: BatchChangeDraft;
  mode: BatchChangeDraft["mode"];
  targetBatchId: string;
}) {
  const { t } = useTranslation("registration");
  const navigate = useNavigate();
  const editor = useBatchChangeEditor({ initialDraft, mode, targetBatchId });
  const { form, submission } = editor;
  const submissionError =
    submission.state === "error" ? submission.error : undefined;
  const displayedError = form.artifactError ?? submissionError;
  // Artifact feedback retains its existing priority over submission progress.
  const showSubmissionProgress =
    form.artifactError === undefined && submission.state === "submitting";

  async function submitChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requestLocator = await editor.submit();

    if (requestLocator) {
      navigate(`/approvals/registration/${encodeURIComponent(requestLocator)}`);
    }
  }

  return (
    <section className="min-w-0">
      <PageHeader
        subtitle={t(batchChangeCopy[mode].subtitle)}
        title={t(batchChangeCopy[mode].title)}
      />
      <form
        className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]"
        onSubmit={submitChange}
      >
        <div className="min-w-0 space-y-4">
          <BatchChangeFields form={form} mode={mode} />
          {displayedError !== undefined ? (
            <p
              className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800"
              role="alert"
            >
              {displayedError || t("errors.unknown")}
            </p>
          ) : null}
        </div>
        <BatchChangeReview
          missingFields={form.missingFields}
          mode={mode}
          previewState={editor.previewState}
          showSubmissionProgress={showSubmissionProgress}
        />
      </form>
    </section>
  );
}
