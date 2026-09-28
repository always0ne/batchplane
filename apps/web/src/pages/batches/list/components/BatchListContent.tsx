import type { BatchListError } from "@batchplane/ui-client";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { EmptyState } from "../../../../components/EmptyState";
import { ErrorState } from "../../../../components/ErrorState";
import { LoadingState } from "../../../../components/LoadingState";
import type { BatchListState } from "../hooks/useBatchList";
import { BatchListTable } from "./BatchListTable";

type BatchListContentProps = { state: BatchListState };

export function BatchListContent({ state }: BatchListContentProps) {
  const { t } = useTranslation("batches");

  if (state.type === "loading") {
    return <LoadingState message={t("states.loading")} />;
  }

  if (state.type === "workspace-not-connected") {
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

  if (state.type === "error") {
    return <ErrorState message={formatBatchListError(state.error, t)} />;
  }

  if (state.batches.length === 0) {
    return (
      <EmptyState
        message={t("states.empty", { branch: state.sourceRevision })}
      />
    );
  }

  return <BatchListTable batches={state.batches} />;
}

function formatBatchListError(
  error: BatchListError,
  t: (key: string) => string,
): string {
  if (error.type === "message") return error.message;

  const translationKeyByErrorType = {
    "access-denied": "errors:githubApi.forbidden",
    "authentication-required": "errors:githubApi.unauthorized",
    conflict: "errors:githubApi.conflict",
    "invalid-input": "errors:githubApi.validation",
    "request-rejected": "errors:githubApi.badRequest",
    "resource-unavailable": "errors:githubApi.notFound",
    "temporarily-unavailable": "errors:githubApi.rateLimited",
    "provider-unknown": "errors:githubApi.unknown",
  } as const;

  return error.type === "unknown"
    ? t("states.error")
    : t(translationKeyByErrorType[error.type]);
}
