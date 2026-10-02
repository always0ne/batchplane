import type { ChangeRequestDetail } from "@batchplane/ui-client";
import { ExternalLink, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../../../components/Button";
import { ButtonLink } from "../../../../../components/ButtonLink";
import { PageHeader } from "../../../../../components/PageHeader";
import type { ChangeRequestAction } from "../hooks/useChangeRequestDetail";

export function ChangeRequestDetailHeader({
  detail,
  onRefresh,
  runningAction,
}: {
  detail: ChangeRequestDetail;
  onRefresh: () => void;
  runningAction?: ChangeRequestAction;
}) {
  const { t } = useTranslation("approvals");
  const pageTitle = t("registrationDetail.changeTitle", {
    batchId: detail.batchId,
    type: t(`values.registrationRequestTypes.${detail.mode}`),
  });

  return (
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
          disabled={Boolean(runningAction)}
          onClick={onRefresh}
          variant="secondary"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {t("actions.refresh")}
        </Button>
      </div>
    </div>
  );
}
