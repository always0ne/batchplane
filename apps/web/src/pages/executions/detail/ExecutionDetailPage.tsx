import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useBatchPlaneClient } from "../../../client/batch-plane-client-context";
import { formatInspectionError } from "../../../client/inspection-errors";
import { ExecutionDetailHeader } from "./components/ExecutionDetailHeader";
import { EmptyState } from "../../../components/EmptyState";
import { ErrorState } from "../../../components/ErrorState";
import { LoadingState } from "../../../components/LoadingState";
import { FailureFollowUpPanel } from "./components/FailureFollowUpPanel";
import { BusinessOutcomePanel } from "./components/BusinessOutcomePanel";
import { GateOutcomePanel } from "./components/GateOutcomePanel";
import { ExecutionSummaryPanel } from "./components/ExecutionSummaryPanel";
import { JobSummaryPanel } from "./components/JobSummaryPanel";
import { useExecutionDetail } from "./hooks/useExecutionDetail";
import { useFailureFollowUpActions } from "./hooks/useFailureFollowUpActions";

export function ExecutionDetailPage() {
  const { executionId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation("executionRequests");
  const client = useBatchPlaneClient();
  const { state, refresh, acceptExecutionUpdate } = useExecutionDetail(
    executionId,
    searchParams.get("runAttempt"),
  );
  const actions = useFailureFollowUpActions(
    client,
    executionId,
    acceptExecutionUpdate,
  );
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
            to="/workspace"
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
        message={t("runDetail.states.notFound", {
          executionId: state.executionId,
        })}
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

  return (
    <section>
      <ExecutionDetailHeader
        run={run}
        source={searchParams.get("from")}
        onRefresh={refresh}
      />

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
        <ExecutionSummaryPanel run={run} />
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
