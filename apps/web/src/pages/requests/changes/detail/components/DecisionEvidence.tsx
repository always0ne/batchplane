import type { ChangeRequestDetail } from "@batchplane/ui-client";
import { useTranslation } from "react-i18next";
import { ChangeRequestMeta } from "./ChangeRequestMeta";

export function DecisionEvidence({ detail }: { detail: ChangeRequestDetail }) {
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
          <ChangeRequestMeta
            label={t("registrationDetail.review.decision")}
            value={t(
              `registrationDetail.review.decisions.${detail.decision.decision}`,
            )}
          />
          <ChangeRequestMeta
            label={t("registrationDetail.review.source")}
            value={
              detail.decision.source
                ? t(
                    `registrationDetail.review.sources.${detail.decision.source}`,
                  )
                : "-"
            }
          />
          <ChangeRequestMeta
            label={t("registrationDetail.review.actor")}
            value={detail.decision.actor ?? "-"}
          />
          <ChangeRequestMeta
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
