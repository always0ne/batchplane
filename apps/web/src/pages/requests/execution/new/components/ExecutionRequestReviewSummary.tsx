import type { ExecutionRequestDraft } from "@batchplane/ui-client";
import { Loader2, Send, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "../../../../../components/Button";
import type { ExecutionRequestPreviewState } from "../hooks/useExecutionRequestPreview";
import type { ExecutionRequestSubmissionState } from "../hooks/useExecutionRequestSubmission";
import { CheckItem } from "./CheckItem";
import { ReviewFact } from "./ReviewFact";

export function ExecutionRequestReviewSummary({
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
  const { t } = useTranslation("executionRequests");
  const previewRequest =
    previewState.type === "ready" ? previewState.preview.request : null;
  return (
    <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-bp-graphite">
        {t("review.title")}
      </h2>
      <div className="mt-4 flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
        {t("review.gateRequired")}
      </div>

      <dl className="mt-5 space-y-3 text-sm">
        <ReviewFact
          label={t("review.workflow")}
          value={batch.executionTarget?.targetName ?? "-"}
        />
        <ReviewFact
          label={t("review.runner")}
          value={batch.executionTarget?.executionEnvironment ?? "-"}
        />
        <ReviewFact
          label={t("review.requestId")}
          value={previewRequest?.requestId ?? t("review.pending")}
        />
        <ReviewFact
          label={t("review.expiresAt")}
          value={previewRequest?.expiresAt ?? t("review.pending")}
        />
        <ReviewFact
          label={t("review.digest")}
          value={previewRequest?.evidence.requestDigest ?? t("review.pending")}
        />
      </dl>

      <ul className="mt-5 space-y-2 text-sm">
        <CheckItem
          ready={Boolean(batch.executionTarget?.command?.trim())}
          text={t("review.commandReady")}
        />
        <CheckItem
          ready={previewRequest !== null}
          text={t("review.digestReady")}
        />
        <CheckItem ready text={t("review.noDispatch")} />
      </ul>

      <p className="mt-5 rounded-md bg-slate-50 px-3 py-2 text-xs font-semibold text-bp-muted">
        {t("review.nextStep")}
      </p>
      {workspaceApprovalMode === "AUTO_APPROVE" ? (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
          {t("review.autoApproval")}
        </p>
      ) : null}

      <Button
        className="mt-4 w-full justify-center py-3"
        disabled={!canSubmit}
        type="submit"
        variant="primary"
      >
        {submitState.type === "submitting" ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Send className="h-4 w-4" aria-hidden="true" />
        )}
        {t("actions.createRequest")}
      </Button>
    </article>
  );
}
