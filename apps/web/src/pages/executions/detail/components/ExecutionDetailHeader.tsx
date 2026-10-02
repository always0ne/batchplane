import type { ExecutionRunPresentation as ExecutionRun } from "@batchplane/ui-client";
import { ChevronLeft, ExternalLink, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../../components/Button";
import { ButtonLink } from "../../../../components/ButtonLink";
import { PageHeader } from "../../../../components/PageHeader";

export function ExecutionDetailHeader({
  run,
  source,
  onRefresh,
}: {
  run: ExecutionRun;
  source: string | null;
  onRefresh: () => void;
}) {
  const { t } = useTranslation("executionRequests");
  const backLink = getBackLink(source);
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <PageHeader
        title={t(
          run.evidenceScope === "SOURCE_RUN"
            ? "runDetail.sourceRunTitle"
            : "runDetail.title",
        )}
        subtitle={t("runDetail.subtitle", { executionId: run.runId })}
      />
      <div className="flex flex-wrap gap-2">
        {backLink ? (
          <ButtonLink size="compact" to={backLink.to}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            {t(backLink.labelKey)}
          </ButtonLink>
        ) : null}
        <Button size="compact" onClick={onRefresh} type="button">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {t("runDetail.actions.refresh")}
        </Button>
        <ButtonLink
          size="compact"
          to={`/batches/${encodeURIComponent(run.batchId)}`}
        >
          {t("runDetail.actions.openBatch")}
        </ButtonLink>
        {run.sourceUrl ? (
          <a
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bp-graphite"
            href={run.sourceUrl}
            rel="noreferrer"
            target="_blank"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            {t("runDetail.actions.openGitHubRun")}
          </a>
        ) : null}
      </div>
    </div>
  );
}

function getBackLink(source: string | null) {
  if (source === "failures") {
    return {
      labelKey: "runDetail.actions.backToFailures",
      to: "/executions/failures",
    };
  }
  if (source === "runs") {
    return {
      labelKey: "runDetail.actions.backToExecutions",
      to: "/executions",
    };
  }
  return null;
}
