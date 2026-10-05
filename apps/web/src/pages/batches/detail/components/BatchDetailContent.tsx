import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { EmptyState } from "../../../../components/EmptyState";
import { ErrorState } from "../../../../components/ErrorState";
import { LoadingState } from "../../../../components/LoadingState";
import type { BatchDetailState } from "../hooks/useBatchDetail";
import { BatchDeletedArchive } from "./BatchDeletedArchive";
import { BatchProfile } from "./BatchProfile";
import { BatchRequestActions } from "./BatchRequestActions";
import { RecentExecutionRequests } from "./RecentExecutionRequests";

export function BatchDetailContent({ state }: { state: BatchDetailState }) {
  const { t } = useTranslation("batches");
  if (state.type === "loading")
    return <LoadingState message={t("states.detailLoading")} />;
  if (state.type === "workspace-not-connected")
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
