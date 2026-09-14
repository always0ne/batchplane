import { ChevronLeft, ExternalLink, RefreshCw } from "lucide-react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useBatchPlaneClient } from "../../client/batch-plane-client-context";
import { formatInspectionError } from "../../client/inspection-errors";
import { PageHeader } from "../../ui/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "../../ui/PageState";
import { FailureFollowUpPanel } from "./FailureFollowUpPanel";
import {
  BusinessOutcomePanel,
  GateOutcomePanel,
  RunSummaryPanel,
} from "./RunEvidencePanels";
import { JobSummaryPanel } from "./RunJobLogs";
import { useExecutionRunDetail } from "./useExecutionRunDetail";
import { useFailureFollowUpActions } from "./useFailureFollowUpActions";

export function ExecutionRunDetailPage() {
  const { runId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation("executionRequests");
  const client = useBatchPlaneClient();
  const { state, refresh, acceptRunUpdate } = useExecutionRunDetail(
    runId,
    searchParams.get("runAttempt"),
  );
  const actions = useFailureFollowUpActions(client, runId, acceptRunUpdate);
  const loadExecutionRunJobLog = useCallback(
    (jobId: string) => client.getExecutionRunJobLog({ jobId }),
    [client],
  );

  if (state.type === "loading") {
    return <LoadingState message={t("runDetail.states.loading")} />;
  }

  if (state.type === "no-session") {
    return (
      <EmptyState
        action={
          <Link
            className="font-semibold text-bp-control underline"
            to="/lite/setup"
          >
            {t("actions.openSetup")}
          </Link>
        }
        message={t("runDetail.states.noSession")}
      />
    );
  }

  if (state.type === "not-found") {
    return (
      <EmptyState
        action={
          <Link
            className="font-semibold text-bp-control underline"
            to="/batches"
          >
            {t("actions.backToBatches")}
          </Link>
        }
        message={t("runDetail.states.notFound", { runId: state.runId })}
      />
    );
  }

  if (state.type === "error") {
    return (
      <ErrorState
        message={formatInspectionError(
          state.error,
          t,
          "runDetail.states.error",
          "runDetail.states.actionsPermission",
        )}
      />
    );
  }

  const { run } = state;
  const source = searchParams.get("from");
  const backLink =
    source === "failures"
      ? {
          label: t("runDetail.actions.backToFailures"),
          to: "/failures",
        }
      : source === "runs"
        ? {
            label: t("runDetail.actions.backToRuns"),
            to: "/runs",
          }
        : null;

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title={t(
            run.evidenceScope === "SOURCE_RUN"
              ? "runDetail.sourceRunTitle"
              : "runDetail.title",
          )}
          subtitle={t("runDetail.subtitle", { runId: run.runId })}
        />
        <div className="flex flex-wrap gap-2">
          {backLink ? (
            <Link
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bp-graphite"
              to={backLink.to}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              {backLink.label}
            </Link>
          ) : null}
          <button
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bp-graphite"
            onClick={refresh}
            type="button"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {t("runDetail.actions.refresh")}
          </button>
          <Link
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bp-graphite"
            to={`/batches/${encodeURIComponent(run.batchId)}`}
          >
            {t("runDetail.actions.openBatch")}
          </Link>
          {run.workflowRunUrl ? (
            <a
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bp-graphite"
              href={run.workflowRunUrl}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              {t("runDetail.actions.openGitHubRun")}
            </a>
          ) : null}
        </div>
      </div>

      {state.refreshError ? (
        <ErrorState
          message={formatInspectionError(
            state.refreshError,
            t,
            "runDetail.states.error",
            "runDetail.states.actionsPermission",
          )}
        />
      ) : null}
      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <RunSummaryPanel run={run} />
        <aside className="space-y-4">
          <GateOutcomePanel run={run} />
          <BusinessOutcomePanel run={run} />
        </aside>
        {run.status === "FAILED" && run.gateDecision?.allowed === true ? (
          <div className="xl:col-span-2">
            <FailureFollowUpPanel
              onReview={actions.review}
              onSubmit={actions.record}
              run={run}
            />
          </div>
        ) : null}
        <div className="min-w-0 max-w-full xl:col-span-2">
          <JobSummaryPanel onLoadLog={loadExecutionRunJobLog} run={run} />
        </div>
      </div>
    </section>
  );
}
