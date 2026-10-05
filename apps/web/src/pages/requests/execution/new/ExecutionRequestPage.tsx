import { Link, useParams } from "react-router";
import { useTranslation } from "react-i18next";

import { EmptyState } from "../../../../components/EmptyState";
import { ErrorState } from "../../../../components/ErrorState";
import { LoadingState } from "../../../../components/LoadingState";
import { ExecutionRequestFormSession } from "./components/ExecutionRequestFormSession";
import { useExecutionRequestDraft } from "./hooks/useExecutionRequestDraft";

export function ExecutionRequestPage() {
  const { batchId = "" } = useParams();
  const decodedBatchId = decodeURIComponent(batchId);
  const { t } = useTranslation("executionRequests");
  const draftState = useExecutionRequestDraft(decodedBatchId);

  if (draftState.type === "loading") {
    return <LoadingState message={t("states.loading")} />;
  }

  if (draftState.type === "workspace-not-connected") {
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
  }

  if (draftState.type === "not-found") {
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
        message={t("states.notFound", { batchId: decodedBatchId })}
      />
    );
  }

  if (draftState.type === "error") {
    return <ErrorState message={draftState.message || t("states.error")} />;
  }

  return (
    <ExecutionRequestFormSession
      key={draftState.draft.requestId}
      draft={draftState.draft}
    />
  );
}
