import type { FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { PageHeader } from "../../ui/PageHeader";
import { ErrorState, LoadingState } from "../../ui/PageState";
import { BatchChangeFormRegions } from "./BatchChangeFormRegions";
import { BatchChangeReview } from "./BatchChangeReview";
import { useBatchChangeEditor } from "./useBatchChangeEditor";

export function BatchRegistrationPage() {
  const { t } = useTranslation("registration");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const changeBatchId = searchParams.get("change")?.trim() ?? "";
  const deleteBatchId = searchParams.get("delete")?.trim() ?? "";
  const mode = deleteBatchId ? "delete" : changeBatchId ? "change" : "create";
  const targetBatchId = deleteBatchId || changeBatchId;
  const editor = useBatchChangeEditor({ mode, targetBatchId });

  async function submitChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requestLocator = await editor.submit();

    if (requestLocator) {
      navigate(`/approvals/registration/${encodeURIComponent(requestLocator)}`);
    }
  }

  if (editor.loadState === "loading") {
    return <LoadingState message={t("states.changeLoading")} />;
  }

  if (editor.loadState === "error") {
    return (
      <ErrorState message={editor.loadError || t("states.changeLoadError")} />
    );
  }

  return (
    <section>
      <PageHeader
        subtitle={t(pageCopyKey(mode, "subtitle"))}
        title={t(pageCopyKey(mode, "title"))}
      />
      <form
        className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]"
        onSubmit={submitChange}
      >
        <div className="space-y-4">
          {mode === "delete" ? (
            <DeleteChangeSummary
              batchId={editor.values.batchId}
              name={editor.values.name}
              scheduleCount={editor.draft.schedules.length}
            />
          ) : (
            <BatchChangeFormRegions
              existingArtifact={editor.existingArtifact}
              onAddSchedule={editor.addSchedule}
              onArtifactChange={editor.selectArtifact}
              onRemoveSchedule={editor.removeSchedule}
              onRestoreSchedule={editor.restoreSchedule}
              onScheduleChange={editor.updateSchedule}
              onValueChange={editor.updateValue}
              scheduleDrafts={editor.scheduleDrafts}
              values={editor.values}
            />
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
  mode: "create" | "change" | "delete",
  field: "title" | "subtitle",
): string {
  if (mode === "create") return field;
  return mode === "delete" ? `${field}Delete` : `${field}Change`;
}
