import { Loader2, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";

import { Button } from "../../ui/Button";
import { PageHeader } from "../../ui/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "../../ui/PageState";
import { BatchDeletedArchive } from "./BatchDeletedArchive";
import { BatchProfile } from "./BatchProfile";
import { BatchRequestActions } from "./BatchRequestActions";
import { RecentExecutionRequests } from "./RecentExecutionRequests";
import { type BatchDetailState, useBatchDetail } from "./useBatchDetail";

export function BatchDetailPage() {
  const { batchId = "" } = useParams();
  const { t } = useTranslation("batches");
  const detail = useBatchDetail(batchId, t("states.detailError"));

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title={t("detail.title")} subtitle={batchId} />
        <Button
          disabled={detail.state.type === "loading"}
          onClick={detail.refresh}
          variant="secondary"
        >
          {detail.state.type === "loading" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          )}
          {t("actions.refresh")}
        </Button>
      </div>
      <BatchDetailContent state={detail.state} />
    </section>
  );
}

function BatchDetailContent({ state }: { state: BatchDetailState }) {
  const { t } = useTranslation("batches");
  if (state.type === "loading")
    return <LoadingState message={t("states.detailLoading")} />;
  if (state.type === "workspace-not-connected")
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
        message={t("states.noSession")}
      />
    );
  if (state.type === "not-found")
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
        message={t("states.detailNotFound", { batchId: state.batchId })}
      />
    );
  if (state.type === "error") return <ErrorState message={state.message} />;
  if (state.type === "deleted")
    return (
      <div className="space-y-4">
        <BatchDeletedArchive
          archive={state.archive}
          defaultBranch={state.defaultBranch}
        />
        <RecentExecutionRequests requests={state.recentExecutionRequests} />
      </div>
    );
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <BatchProfile batch={state.batch} defaultBranch={state.defaultBranch} />
        <BatchRequestActions batch={state.batch} control={state.control} />
      </div>
      <RecentExecutionRequests requests={state.recentExecutionRequests} />
    </div>
  );
}
