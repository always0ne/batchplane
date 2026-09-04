import { GitPullRequest, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { BatchChangeDraft } from "@batchplane/ui-client";

import { GovernedChangePreviewPanel } from "../../features/governed-changes/GovernedChangePreviewPanel";
import { hasNoPreviewFileChanges } from "../../features/governed-changes/governed-change-preview";
import { Button } from "../../ui/Button";

type PreviewState =
  | { type: "idle" }
  | { type: "loading" }
  | {
      preview: { files: Parameters<typeof hasNoPreviewFileChanges>[0] };
      type: "ready";
    }
  | { message: string; type: "error" };

export function BatchChangeReview({
  missingFields,
  mode,
  previewState,
  submissionState,
}: {
  missingFields: string[];
  mode: BatchChangeDraft["mode"];
  previewState: PreviewState;
  submissionState: "idle" | "submitting" | "error";
}) {
  const { t } = useTranslation("registration");
  const noChanges =
    previewState.type === "ready" &&
    hasNoPreviewFileChanges(previewState.preview.files);
  const canSubmit =
    missingFields.length === 0 &&
    previewState.type === "ready" &&
    !noChanges &&
    submissionState !== "submitting";
  const disabledReason = getDisabledReason({
    missingFields,
    noChanges,
    previewState,
    t,
  });

  return (
    <aside className="space-y-4">
      <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-bp-graphite">
          {t("review.title")}
        </h2>
        <p className="mt-2 text-sm text-bp-muted">{t(reviewCopyKey(mode))}</p>
        {missingFields.length > 0 ? (
          <p className="mt-3 text-sm font-medium text-amber-800">
            {t("errors.required", { fields: missingFields.join(", ") })}
          </p>
        ) : null}
        {previewState.type === "loading" || previewState.type === "idle" ? (
          <p className="mt-3 text-sm text-bp-muted">
            {t(previewState.type === "loading" ? "diff.loading" : "diff.idle")}
          </p>
        ) : null}
        {previewState.type === "error" ? (
          <p className="mt-3 text-sm font-medium text-rose-700" role="alert">
            {previewState.message || t("errors.previewFailed")}
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
          {submissionState === "submitting" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <GitPullRequest className="h-4 w-4" aria-hidden="true" />
          )}
          {t(actionCopyKey(mode))}
        </Button>
        {disabledReason ? (
          <p className="sr-only" id="change-submit-reason">
            {disabledReason}
          </p>
        ) : null}
      </article>
      {previewState.type === "ready" ? (
        <GovernedChangePreviewPanel
          files={previewState.preview.files}
          labels={{
            binarySummary: t("diff.binaryDigest"),
            emptyFile: t("diff.empty"),
            evidenceUnavailable: t("diff.evidenceUnavailable"),
            preview: t("diff.preview"),
            status: {
              ADDED: t("diff.status.ADDED"),
              DELETED: t("diff.status.DELETED"),
              MODIFIED: t("diff.status.MODIFIED"),
              UNCHANGED: t("diff.status.UNCHANGED"),
            },
            subtitle: t("diff.subtitle"),
            title: t("diff.title"),
          }}
        />
      ) : null}
    </aside>
  );
}

function getDisabledReason({
  missingFields,
  noChanges,
  previewState,
  t,
}: {
  missingFields: string[];
  noChanges: boolean;
  previewState: PreviewState;
  t: (key: string, options?: Record<string, unknown>) => string;
}): string | undefined {
  if (missingFields.length > 0) {
    return t("errors.required", { fields: missingFields.join(", ") });
  }
  if (noChanges) return t("errors.noChanges");
  if (previewState.type !== "ready") return t("errors.previewNotReady");
  return undefined;
}

function reviewCopyKey(mode: BatchChangeDraft["mode"]): string {
  return mode === "create"
    ? "review.subtitle"
    : mode === "delete"
      ? "review.subtitleDelete"
      : "review.subtitleChange";
}

function actionCopyKey(mode: BatchChangeDraft["mode"]): string {
  return mode === "create"
    ? "actions.createChange"
    : mode === "delete"
      ? "actions.createDeleteChange"
      : "actions.createUpdateChange";
}
