import type { BatchChangeDraft } from "@batchplane/ui-client";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../../../components/Button";
import { batchChangeCopy } from "../batch-change-copy";
import type { BatchChangePreviewState } from "../hooks/useBatchChangePreview";

export function BatchChangeSubmissionReview({
  missingFields,
  mode,
  previewState,
  showSubmissionProgress,
}: {
  missingFields: string[];
  mode: BatchChangeDraft["mode"];
  previewState: BatchChangePreviewState;
  showSubmissionProgress: boolean;
}) {
  const { t } = useTranslation("registration");
  const noChanges =
    previewState.type === "ready" && !previewState.preview.hasEffectiveChanges;
  const canSubmit =
    missingFields.length === 0 &&
    previewState.type === "ready" &&
    !noChanges &&
    !showSubmissionProgress;
  const requiredFieldsMessage = t("errors.required", {
    fields: formatMissingFields(missingFields, t),
  });
  let disabledReason: string | undefined;
  if (missingFields.length > 0) {
    disabledReason = requiredFieldsMessage;
  } else if (noChanges) {
    disabledReason = t("errors.noChanges");
  } else if (previewState.type !== "ready") {
    disabledReason = t("errors.previewNotReady");
  }

  return (
    <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-bp-graphite">
        {t("review.title")}
      </h2>
      <p className="mt-2 text-sm text-bp-muted">
        {t(batchChangeCopy[mode].review)}
      </p>
      {missingFields.length > 0 ? (
        <p className="mt-3 text-sm font-medium text-amber-800">
          {requiredFieldsMessage}
        </p>
      ) : null}
      {previewState.type === "loading" || previewState.type === "idle" ? (
        <p className="mt-3 text-sm text-bp-muted">
          {t(previewState.type === "loading" ? "diff.loading" : "diff.idle")}
        </p>
      ) : null}
      {previewState.type === "error" ? (
        <p className="mt-3 text-sm font-medium text-rose-700" role="alert">
          {previewErrorMessage(previewState.message, t)}
        </p>
      ) : null}
      {noChanges ? (
        <p className="mt-3 text-sm font-medium text-amber-800">
          {t("errors.noChanges")}
        </p>
      ) : null}
      <Button
        aria-describedby={disabledReason ? "change-submit-reason" : undefined}
        className="mt-5 w-full justify-center py-3"
        disabled={!canSubmit}
        title={disabledReason}
        type="submit"
        variant="primary"
      >
        {showSubmissionProgress ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        )}
        {t(batchChangeCopy[mode].submit)}
      </Button>
      {disabledReason ? (
        <p className="sr-only" id="change-submit-reason">
          {disabledReason}
        </p>
      ) : null}
    </article>
  );
}

function previewErrorMessage(
  message: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (message.startsWith("SCHEDULE_TIMEZONE_AMBIGUOUS")) {
    return t("errors.scheduleTimezoneAmbiguous");
  }

  return message || t("errors.previewFailed");
}

function formatMissingFields(
  fields: string[],
  t: (key: string) => string,
): string {
  const labels: Record<string, string> = {
    "execution.command": t("form.runCommand"),
    "execution.ref": t("form.workflowRef"),
    "execution.runnerLabel": t("form.runnerLabel"),
  };
  return fields.map((field) => labels[field] ?? field).join(", ");
}
