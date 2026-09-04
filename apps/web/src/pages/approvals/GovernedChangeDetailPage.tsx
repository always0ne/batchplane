import { ExternalLink, RefreshCw } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { Button, ButtonLink } from "../../ui/Button";
import { EmptyState, ErrorState, LoadingState } from "../../ui/PageState";
import { PageHeader } from "../../ui/PageHeader";
import { GovernedChangeDetailContent } from "./GovernedChangeDetailContent";
import { useGovernedChangeDetail } from "./useGovernedChangeDetail";

export function GovernedChangeDetailPage() {
  const { requestLocator = "" } = useParams();
  const { t } = useTranslation("approvals");
  const change = useGovernedChangeDetail(requestLocator);

  if (change.detailState.type === "loading") {
    return <LoadingState message={t("registrationDetail.states.loading")} />;
  }

  if (change.detailState.type === "not-found") {
    return (
      <EmptyState
        action={
          <Link
            className="font-semibold text-bp-control underline"
            to="/approvals"
          >
            {t("registrationDetail.actions.backToApprovals")}
          </Link>
        }
        message={t("registrationDetail.states.notFound", { requestLocator })}
      />
    );
  }

  if (change.detailState.type === "error") {
    return (
      <ErrorState
        message={
          change.detailState.message || t("registrationDetail.states.error")
        }
      />
    );
  }

  const detail = change.detailState.detail;
  const pageTitle = t("registrationDetail.changeTitle", {
    batchId: detail.batchId,
    type: t(`values.registrationRequestTypes.${detail.mode}`),
  });

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          subtitle={`${detail.sourceLabel} · ${detail.requester}`}
          title={pageTitle}
        />
        <div className="flex flex-wrap justify-end gap-2">
          <ButtonLink to="/approvals" variant="secondary">
            {t("registrationDetail.actions.backToApprovals")}
          </ButtonLink>
          {detail.batchId ? (
            <ButtonLink
              to={`/batches/${encodeURIComponent(detail.batchId)}`}
              variant="secondary"
            >
              {t("registrationDetail.actions.openBatchDetail")}
            </ButtonLink>
          ) : null}
          {detail.sourceUrl ? (
            <a
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-bp-graphite"
              href={detail.sourceUrl}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              {t("actions.openSourceRequest")}
            </a>
          ) : null}
          <Button
            disabled={Boolean(change.runningAction)}
            onClick={() => void change.refresh()}
            variant="secondary"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {t("actions.refresh")}
          </Button>
        </div>
      </div>
      {change.actionError ? (
        <p
          className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800"
          role="alert"
        >
          {change.actionError || t("registrationDetail.actions.actionFailed")}
        </p>
      ) : null}
      <GovernedChangeDetailContent
        detail={detail}
        onAction={change.applyAction}
        runningAction={change.runningAction}
      />
    </section>
  );
}
