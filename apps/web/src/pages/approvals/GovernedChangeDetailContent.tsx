import type { GovernedChangeDetail } from "@batchplane/ui-client";
import { CheckCircle2, Loader2, Undo2, XCircle } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { GovernedChangePreviewPanel } from "../../features/governed-changes/GovernedChangePreviewPanel";
import { Button } from "../../ui/Button";
import type { GovernedChangeAction } from "./useGovernedChangeDetail";

export function GovernedChangeDetailContent({
  detail,
  onAction,
  runningAction,
}: {
  detail: GovernedChangeDetail;
  onAction: (
    action: GovernedChangeAction,
    rejectionReason?: string,
  ) => Promise<boolean>;
  runningAction?: GovernedChangeAction;
}) {
  return (
    <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="min-w-0 space-y-4">
        <ChangeSummary detail={detail} />
        <ChangeEvidence detail={detail} />
      </div>
      <aside className="space-y-4">
        <DecisionEvidence detail={detail} />
        <DecisionActions
          detail={detail}
          onAction={onAction}
          runningAction={runningAction}
        />
      </aside>
    </div>
  );
}

function ChangeSummary({ detail }: { detail: GovernedChangeDetail }) {
  const { t } = useTranslation("approvals");
  const evidence =
    detail.evidence.kind === "VERIFIED_V2" ? detail.evidence : undefined;

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-bp-graphite">
        {t("registrationDetail.summaryTitle")}
      </h2>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <Meta label={t("fields.batchId")} value={detail.batchId} />
        <Meta
          label={t("fields.requestType")}
          value={t(`values.registrationRequestTypes.${detail.mode}`)}
        />
        <Meta label={t("fields.requestedBy")} value={detail.requester} />
        <Meta
          label={t("fields.requestId")}
          value={evidence?.governedChangeId ?? "-"}
        />
        <Meta
          label={t("fields.requestDigest")}
          value={evidence?.requestDigest ?? "-"}
        />
        <Meta
          label={t("fields.targetRevisionDigest")}
          value={evidence?.targetRevisionDigest ?? "-"}
        />
      </dl>
    </article>
  );
}

function ChangeEvidence({ detail }: { detail: GovernedChangeDetail }) {
  const { t } = useTranslation("approvals");

  return (
    <GovernedChangePreviewPanel
      files={detail.files}
      labels={{
        binarySummary: t("registrationDetail.preview.binaryDigest"),
        emptyFile: t("registrationDetail.preview.emptyFile"),
        evidenceUnavailable: t(
          "registrationDetail.preview.evidenceUnavailable",
        ),
        preview: t("registrationDetail.preview.showDiff"),
        status: {
          ADDED: t("registrationDetail.preview.status.ADDED"),
          DELETED: t("registrationDetail.preview.status.DELETED"),
          MODIFIED: t("registrationDetail.preview.status.MODIFIED"),
          UNCHANGED: t("registrationDetail.preview.status.UNCHANGED"),
        },
        subtitle: t("registrationDetail.preview.subtitle"),
        title: t("registrationDetail.preview.title"),
      }}
    />
  );
}

function DecisionEvidence({ detail }: { detail: GovernedChangeDetail }) {
  const { t } = useTranslation("approvals");
  const requiresRecreation =
    detail.reviewState === "REAPPROVAL_REQUIRED" ||
    detail.reviewState === "LEGACY_UNAPPROVABLE";

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-bp-graphite">
        {t("registrationDetail.review.title")}
      </h2>
      <p className="mt-2 text-sm font-semibold text-bp-graphite">
        {t(`registrationDetail.review.states.${detail.reviewState}`)}
      </p>
      {requiresRecreation ? (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {t("registrationDetail.review.recreateRequired")}
        </p>
      ) : null}
      {detail.decision ? (
        <dl className="mt-3 grid gap-2 text-sm">
          <Meta
            label={t("registrationDetail.review.decision")}
            value={t(
              `registrationDetail.review.decisions.${detail.decision.decision}`,
            )}
          />
          <Meta
            label={t("registrationDetail.review.source")}
            value={
              detail.decision.source
                ? t(
                    `registrationDetail.review.sources.${detail.decision.source}`,
                  )
                : "-"
            }
          />
          <Meta
            label={t("registrationDetail.review.actor")}
            value={detail.decision.actor ?? "-"}
          />
          <Meta
            label={t("registrationDetail.review.decidedAt")}
            value={detail.decision.decidedAt}
          />
        </dl>
      ) : (
        <p className="mt-3 text-sm text-bp-muted">
          {t("registrationDetail.review.noEvidence")}
        </p>
      )}
    </article>
  );
}

function DecisionActions({
  detail,
  onAction,
  runningAction,
}: {
  detail: GovernedChangeDetail;
  onAction: (
    action: GovernedChangeAction,
    rejectionReason?: string,
  ) => Promise<boolean>;
  runningAction?: GovernedChangeAction;
}) {
  const { t } = useTranslation("approvals");
  const [rejectionReason, setRejectionReason] = useState("");
  const canApprove = detail.canApprove || detail.canApplyApprovedChange;
  const showApprove =
    detail.reviewState === "OPEN" || detail.canApplyApprovedChange;
  const showReject = detail.canReject;
  const showWithdraw = detail.canWithdraw;
  const unavailableReason = actionUnavailableReason(detail, t);

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
            title={
              !detail.canReject
                ? unavailableReason
                : !rejectionReason.trim()
                  ? t("registrationDetail.actions.rejectionReasonRequired")
                  : undefined
            }
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
  detail: GovernedChangeDetail,
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

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-slate-50 px-3 py-2">
      <dt className="text-xs font-semibold uppercase text-bp-muted">{label}</dt>
      <dd className="mt-1 break-all font-mono text-xs text-bp-graphite">
        {value || "-"}
      </dd>
    </div>
  );
}
