import type { ExecutionAttempt, ExecutionRequest } from "@batchplane/ui-client";
import { Activity, ExternalLink, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, ButtonLink } from "../../ui/Button";
import { PageHeader } from "../../ui/PageHeader";

export function ExecutionRequestDetailHeader({
  attempt,
  isBusy,
  onRefresh,
  request,
}: {
  attempt: ExecutionAttempt | null;
  isBusy: boolean;
  onRefresh: () => void;
  request: ExecutionRequest;
}) {
  const { t } = useTranslation("executionRequests");
  const scheduled = request.triggerType === "SCHEDULE";

  return (
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-4">
      <PageHeader
        title={t("detail.title")}
        subtitle={t(
          scheduled ? "detail.nativeScheduleSubtitle" : "detail.subtitle",
          { requestId: request.requestId },
        )}
      />
      <div className="flex min-w-0 flex-wrap gap-2">
        <ButtonLink size="compact" to={scheduled ? "/requests" : "/approvals"}>
          {t(
            scheduled
              ? "detail.actions.backToRequestInventory"
              : "detail.actions.backToApprovals",
          )}
        </ButtonLink>
        {attempt ? (
          <ButtonLink
            size="compact"
            to={`/execution-runs/${encodeURIComponent(attempt.attemptLocator)}`}
          >
            <Activity className="h-4 w-4" aria-hidden="true" />
            {t("detail.actions.openRunDetail")}
          </ButtonLink>
        ) : null}
        {request.sourceUrl ? (
          <a
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bp-graphite"
            href={request.sourceUrl}
            rel="noreferrer"
            target="_blank"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            {t("detail.actions.openSourceRequest")}
          </a>
        ) : null}
        <Button disabled={isBusy} onClick={onRefresh} size="compact">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {t("detail.actions.refresh")}
        </Button>
      </div>
    </div>
  );
}
