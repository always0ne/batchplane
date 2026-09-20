import type { BatchChangeDraft } from "@batchplane/ui-client";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { PageHeader } from "../../../components/PageHeader";
import {
  BatchChangeFormRegions,
  BatchScheduleEditor,
} from "./BatchChangeFormRegions";
import { GitHubBatchExecutionInput } from "./GitHubBatchExecutionInput";
import { BatchChangeReview } from "./BatchChangeReview";
import { useBatchChangeEditor } from "./useBatchChangeEditor";

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
        subtitle={t(pageCopyKey(mode, "subtitle"))}
        title={t(pageCopyKey(mode, "title"))}
      />
      <form
        className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]"
        onSubmit={submitChange}
      >
        <div className="min-w-0 space-y-4">
          {mode === "delete" ? (
            <DeleteChangeSummary
              batchId={editor.values.batchId}
              name={editor.values.name}
              scheduleCount={editor.draft.schedules.length}
            />
          ) : (
            <>
              <BatchChangeFormRegions
                batchIdReadOnly={mode === "change"}
                onOwnerBlur={editor.resolveOwnerDefault}
                onValueChange={editor.updateValue}
                values={editor.values}
              />
              <GitHubBatchExecutionInput
                onChange={editor.setExecution}
                onFileChange={editor.selectArtifact}
                value={editor.execution}
              />
              <BatchScheduleEditor
                drafts={editor.scheduleDrafts}
                onAdd={editor.addSchedule}
                onRemove={editor.removeSchedule}
                onRestore={editor.restoreSchedule}
                onUpdate={editor.updateSchedule}
              />
            </>
          )}
          {editor.submissionState === "error" ? (
            <p
              className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800"
              role="alert"
            >
              {editor.submissionError || t("errors.unknown")}
            </p>
          ) : null}
        </div>
        <BatchChangeReview
          missingFields={editor.missingFields}
          mode={mode}
          previewState={editor.previewState}
          submissionState={editor.submissionState}
        />
      </form>
    </section>
  );
}

function DeleteChangeSummary({
  batchId,
  name,
  scheduleCount,
}: {
  batchId: string;
  name: string;
  scheduleCount: number;
}) {
  const { t } = useTranslation("registration");

  return (
    <article className="rounded-lg border border-rose-200 bg-rose-50 p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-bp-graphite">
        {t("delete.summaryTitle")}
      </h2>
      <p className="mt-2 text-sm text-bp-muted">{t("delete.summaryBody")}</p>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <SummaryValue label={t("form.batchId")} value={batchId} />
        <SummaryValue label={t("form.name")} value={name} />
        <SummaryValue
          label={t("form.schedules.title")}
          value={String(scheduleCount)}
        />
      </dl>
    </article>
  );
}

function SummaryValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-white px-3 py-2">
      <dt className="text-xs font-semibold uppercase text-bp-muted">{label}</dt>
      <dd className="mt-1 break-all font-mono text-xs text-bp-graphite">
        {value}
      </dd>
    </div>
  );
}

function pageCopyKey(
  mode: BatchChangeDraft["mode"],
  field: "title" | "subtitle",
): string {
  if (mode === "create") return field;
  return mode === "delete" ? `${field}Delete` : `${field}Change`;
}
