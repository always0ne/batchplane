import type { FailureFollowUpReviewDecisionValue } from "@batchplane/ui-client";
import { CheckCircle2, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatInspectionError } from "../../../client/inspection-errors";

export function FailureFollowUpReviewForm({
  canReview,
  error,
  onReasonChange,
  onSubmit,
  reason,
  submitDecision,
}: {
  canReview: boolean;
  error: unknown;
  onReasonChange: (reason: string) => void;
  onSubmit: (decision: FailureFollowUpReviewDecisionValue) => void;
  reason: string;
  submitDecision: FailureFollowUpReviewDecisionValue | null;
}) {
  const { t } = useTranslation("executionRequests");
  const submitDisabled = !canReview || submitDecision !== null;

  return (
    <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      <label className="block text-sm font-semibold text-bp-graphite">
        {t("runDetail.followUp.review.reason")}
        <textarea
          className="mt-1 min-h-20 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          onChange={(event) => onReasonChange(event.target.value)}
          placeholder={t("runDetail.followUp.review.reasonPlaceholder")}
          value={reason}
        />
      </label>
      {error ? (
        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
          {formatInspectionError(error, t, "runDetail.followUp.error")}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="inline-flex items-center gap-2 rounded-md bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          disabled={submitDisabled}
          onClick={() => onSubmit("APPROVED")}
          type="button"
        >
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          {submitDecision === "APPROVED"
            ? t("runDetail.followUp.review.saving")
            : t("runDetail.followUp.review.approve")}
        </button>
        <button
          className="inline-flex items-center gap-2 rounded-md border border-orange-300 bg-white px-3 py-2 text-sm font-semibold text-orange-800 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
          disabled={submitDisabled}
          onClick={() => onSubmit("CHANGES_REQUESTED")}
          type="button"
        >
          {submitDecision === "CHANGES_REQUESTED"
            ? t("runDetail.followUp.review.saving")
            : t("runDetail.followUp.review.requestChanges")}
        </button>
        <button
          className="inline-flex items-center gap-2 rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-800 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
          disabled={submitDisabled}
          onClick={() => onSubmit("REJECTED")}
          type="button"
        >
          <XCircle className="h-4 w-4" aria-hidden="true" />
          {submitDecision === "REJECTED"
            ? t("runDetail.followUp.review.saving")
            : t("runDetail.followUp.review.reject")}
        </button>
      </div>
    </div>
  );
}
