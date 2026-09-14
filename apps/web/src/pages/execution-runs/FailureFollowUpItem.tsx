import type {
  FailureFollowUp,
  FailureFollowUpReviewDecision,
  FailureFollowUpReviewDecisionValue,
} from "@batchplane/ui-client";
import { CheckCircle2, XCircle } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatInspectionError } from "../../client/inspection-errors";

export function FailureFollowUpItem({
  followUp,
  onReview,
}: {
  followUp: FailureFollowUp;
  onReview: (params: {
    decision: FailureFollowUpReviewDecisionValue;
    followUpId: string;
    reason: string;
  }) => Promise<void>;
}) {
  const { i18n, t } = useTranslation("executionRequests");
  const [error, setError] = useState<unknown>(null);
  const [reason, setReason] = useState("");
  const [submitDecision, setSubmitDecision] =
    useState<FailureFollowUpReviewDecisionValue | null>(null);
  const latestReview = latestFailureFollowUpReview(followUp);
  const reviewCapability = followUp.reviewCapability ?? {
    canReview: false,
    unavailableReason: "PERMISSION_UNAVAILABLE" as const,
  };
  const canReview =
    reviewCapability.canReview &&
    followUp.reviewStatus === "AWAITING_REVIEW" &&
    reason.trim() !== "";

  async function submitReview(decision: FailureFollowUpReviewDecisionValue) {
    if (!canReview || submitDecision) {
      return;
    }

    setError(null);
    setSubmitDecision(decision);

    try {
      await onReview({
        decision,
        followUpId: followUp.followUpId,
        reason: reason.trim(),
      });
      setReason("");
    } catch (error) {
      setError(error);
    } finally {
      setSubmitDecision(null);
    }
  }

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-red-50 px-2 py-1 text-xs font-bold text-red-800">
          {t(`runDetail.followUp.statusValues.${followUp.status}`)}
        </span>
        <span className={reviewStatusClassName(followUp.reviewStatus)}>
          {t(`runDetail.followUp.review.statusValues.${followUp.reviewStatus}`)}
        </span>
        <span className="text-xs font-semibold text-bp-muted">
          @{followUp.author} -{" "}
          {formatFollowUpTimestamp(
            followUp.createdAt,
            i18n.language,
            t("runDetail.values.unknown"),
          )}
        </span>
      </div>
      <p className="mt-2 text-sm font-semibold text-bp-graphite [overflow-wrap:anywhere]">
        {followUp.explanation}
      </p>
      <p className="mt-1 text-sm font-semibold text-bp-muted [overflow-wrap:anywhere]">
        {followUp.actionTaken}
      </p>
      <p className="mt-2 text-xs font-semibold text-bp-muted [overflow-wrap:anywhere]">
        {t("runDetail.followUp.owner")}: {followUp.owner}
      </p>
      {latestReview ? (
        <div className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm">
          <p className="font-bold text-bp-graphite">
            {t("runDetail.followUp.review.latest", {
              reviewer: latestReview.reviewer,
              reviewedAt: formatFollowUpTimestamp(
                latestReview.reviewedAt,
                i18n.language,
                t("runDetail.values.unknown"),
              ),
            })}
          </p>
          <p className="mt-1 font-semibold text-bp-muted [overflow-wrap:anywhere]">
            {latestReview.reason}
          </p>
        </div>
      ) : null}
      {followUp.reviewStatus === "AWAITING_REVIEW" &&
      reviewCapability.canReview ? (
        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <label className="block text-sm font-semibold text-bp-graphite">
            {t("runDetail.followUp.review.reason")}
            <textarea
              className="mt-1 min-h-20 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              onChange={(event) => setReason(event.target.value)}
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
              disabled={!canReview || submitDecision !== null}
              onClick={() => void submitReview("APPROVED")}
              type="button"
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              {submitDecision === "APPROVED"
                ? t("runDetail.followUp.review.saving")
                : t("runDetail.followUp.review.approve")}
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-md border border-orange-300 bg-white px-3 py-2 text-sm font-semibold text-orange-800 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
              disabled={!canReview || submitDecision !== null}
              onClick={() => void submitReview("CHANGES_REQUESTED")}
              type="button"
            >
              {submitDecision === "CHANGES_REQUESTED"
                ? t("runDetail.followUp.review.saving")
                : t("runDetail.followUp.review.requestChanges")}
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-800 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
              disabled={!canReview || submitDecision !== null}
              onClick={() => void submitReview("REJECTED")}
              type="button"
            >
              <XCircle className="h-4 w-4" aria-hidden="true" />
              {submitDecision === "REJECTED"
                ? t("runDetail.followUp.review.saving")
                : t("runDetail.followUp.review.reject")}
            </button>
          </div>
        </div>
      ) : followUp.reviewStatus === "AWAITING_REVIEW" ? (
        <p
          className="mt-3 text-xs font-semibold text-bp-muted"
          title={t(
            `runDetail.followUp.review.unavailableReasons.${reviewCapability.unavailableReason}`,
          )}
        >
          {t(
            `runDetail.followUp.review.unavailableReasons.${reviewCapability.unavailableReason}`,
          )}
        </p>
      ) : null}
    </li>
  );
}

function latestFailureFollowUpReview(
  followUp: FailureFollowUp,
): FailureFollowUpReviewDecision | null {
  return followUp.reviews[followUp.reviews.length - 1] ?? null;
}

function reviewStatusClassName(status: FailureFollowUp["reviewStatus"]) {
  if (status === "APPROVED") {
    return "rounded-md bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-800";
  }

  if (status === "REJECTED") {
    return "rounded-md bg-red-50 px-2 py-1 text-xs font-bold text-red-800";
  }

  if (status === "CHANGES_REQUESTED") {
    return "rounded-md bg-orange-50 px-2 py-1 text-xs font-bold text-orange-800";
  }

  return "rounded-md bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800";
}

function formatFollowUpTimestamp(
  value: string | undefined,
  locale: string,
  fallback: string,
): string {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    year: "numeric",
  }).format(date);
}
