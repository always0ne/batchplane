import type {
  FailureFollowUp,
  FailureFollowUpReviewDecision,
  FailureFollowUpReviewDecisionValue,
} from "@batchplane/ui-client";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FailureFollowUpReviewForm } from "./FailureFollowUpReviewForm";

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
        <span
          className={getFailureFollowUpReviewStatusClass(followUp.reviewStatus)}
        >
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
        <FailureFollowUpReviewForm
          canReview={canReview}
          error={error}
          onReasonChange={setReason}
          onSubmit={(decision) => void submitReview(decision)}
          reason={reason}
          submitDecision={submitDecision}
        />
      ) : null}
      {followUp.reviewStatus === "AWAITING_REVIEW" &&
      !reviewCapability.canReview ? (
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

function getFailureFollowUpReviewStatusClass(
  status: FailureFollowUp["reviewStatus"],
) {
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
