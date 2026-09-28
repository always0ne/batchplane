import type { ChangeRequestDetail } from "@batchplane/ui-client";
import { CheckCircle2, Loader2, Undo2, XCircle } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../../../components/Button";
import type { ChangeRequestAction } from "../hooks/useChangeRequestDetail";

export function DecisionActions({
  detail,
  onAction,
  runningAction,
}: {
  detail: ChangeRequestDetail;
  onAction: (
    action: ChangeRequestAction,
    rejectionReason?: string,
  ) => Promise<boolean>;
  runningAction?: ChangeRequestAction;
}) {
  const { t } = useTranslation("approvals");
  const [rejectionReason, setRejectionReason] = useState("");
  const canApprove = detail.canApprove || detail.canApplyApprovedChange;
  const showApprove =
    detail.reviewState === "OPEN" || detail.canApplyApprovedChange;
  const showReject = detail.canReject;
  const showWithdraw = detail.canWithdraw;
  const unavailableReason = actionUnavailableReason(detail, t);
  let rejectionDisabledReason: string | undefined;
  if (!detail.canReject) {
    rejectionDisabledReason = unavailableReason;
  } else if (!rejectionReason.trim()) {
    rejectionDisabledReason = t(
      "registrationDetail.actions.rejectionReasonRequired",
    );
  }

  async function reject() {
    if (!rejectionReason.trim()) return;
    const completed = await onAction("reject", rejectionReason);
    if (completed) setRejectionReason("");
  }

  if (!showApprove && !showReject && !showWithdraw) {
    return null;
  }

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-bp-graphite">
        {t("registrationDetail.actions.title")}
      </h2>
      {showReject && detail.canReject ? (
        <label className="mt-4 grid gap-1 text-sm font-semibold text-bp-graphite">
          {t("actions.rejectReason")}
          <textarea
            className="min-h-20 rounded-md border border-slate-300 px-3 py-2 text-sm"
            onChange={(event) => setRejectionReason(event.target.value)}
            placeholder={t("actions.rejectReasonPlaceholder")}
            value={rejectionReason}
          />
        </label>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {showApprove ? (
          <Button
            disabled={Boolean(runningAction) || !canApprove}
            onClick={() => void onAction("approve")}
            title={!canApprove ? unavailableReason : undefined}
            variant="primary"
          >
            {runningAction === "approve" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            )}
            {detail.canApplyApprovedChange
              ? t("registrationDetail.actions.applyApproved")
              : t("registrationDetail.actions.approve")}
          </Button>
        ) : null}
        {showReject ? (
          <Button
            disabled={
              Boolean(runningAction) ||
              !detail.canReject ||
              !rejectionReason.trim()
            }
            onClick={() => void reject()}
            title={rejectionDisabledReason}
            variant="secondary"
          >
            <XCircle className="h-4 w-4 text-rose-700" aria-hidden="true" />
            {t("actions.reject")}
          </Button>
        ) : null}
        {showWithdraw ? (
          <Button
            disabled={Boolean(runningAction)}
            onClick={() => void onAction("withdraw")}
            variant="secondary"
          >
            <Undo2 className="h-4 w-4" aria-hidden="true" />
            {t("registrationDetail.actions.withdraw")}
          </Button>
        ) : null}
      </div>
    </article>
  );
}

function actionUnavailableReason(
  detail: ChangeRequestDetail,
  t: (key: string) => string,
): string {
  if (detail.evidence.kind !== "VERIFIED_V2") {
    return t("registrationDetail.actions.evidenceUnavailable");
  }
  if (
    detail.reviewState === "REAPPROVAL_REQUIRED" ||
    detail.reviewState === "LEGACY_UNAPPROVABLE"
  ) {
    return t("registrationDetail.review.recreateRequired");
  }
  return t("registrationDetail.actions.policyOrRoleRequired");
}
