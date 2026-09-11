import type { BatchListError, BatchListItem } from "@batchplane/ui-client";
import { Play } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { EmptyState, ErrorState, LoadingState } from "../../ui/PageState";
import { Button, ButtonLink } from "../../ui/Button";
import { getExecutionRequestBlockReason } from "./batch-list-readiness";
import type { BatchListState } from "./useBatchList";

type BatchListContentProps = {
  state: BatchListState;
};

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
            to="/lite/setup"
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

function BatchListTable({ batches }: { batches: BatchListItem[] }) {
  const { t } = useTranslation("batches");

  return (
    <div className="max-w-full overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[1040px] border-collapse text-left">
        <thead className="bg-slate-50 text-sm text-bp-muted">
          <tr>
            <th className="px-4 py-3 font-semibold">{t("table.batchId")}</th>
            <th className="px-4 py-3 font-semibold">{t("table.name")}</th>
            <th className="px-4 py-3 font-semibold">{t("table.owner")}</th>
            <th className="px-4 py-3 font-semibold">
              {t("table.environment")}
            </th>
            <th className="px-4 py-3 font-semibold">
              {t("table.criticality")}
            </th>
            <th className="px-4 py-3 font-semibold">{t("table.status")}</th>
            <th className="px-4 py-3 font-semibold">{t("table.control")}</th>
            <th className="px-4 py-3 font-semibold">{t("table.actions")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {batches.map((batch) => (
            <BatchListRow key={batch.batchId} batch={batch} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BatchListRow({ batch }: { batch: BatchListItem }) {
  const { t } = useTranslation("batches");
  const blockReason = getExecutionRequestBlockReason({
    batch,
    isRequestInProgress: false,
    t,
  });
  const batchPath = `/batches/${encodeURIComponent(batch.batchId)}`;
  const requestPath = `${batchPath}/execution-requests/new`;

  return (
    <tr>
      <td className="px-4 py-4 font-mono text-sm text-bp-graphite">
        <Link
          className="font-semibold text-bp-control underline"
          to={batchPath}
        >
          {batch.batchId}
        </Link>
      </td>
      <td className="px-4 py-4 text-sm font-semibold text-bp-graphite">
        {batch.name}
      </td>
      <td className="px-4 py-4 text-sm text-bp-graphite">{batch.owner}</td>
      <td className="px-4 py-4 text-sm text-bp-graphite">
        {batch.environment}
      </td>
      <td className="px-4 py-4 text-sm text-bp-graphite">
        {batch.criticality}
      </td>
      <td className="px-4 py-4 text-sm text-bp-graphite">{batch.status}</td>
      <td className="px-4 py-4 text-sm text-bp-graphite">
        <div className="space-y-1">
          <p
            title={
              batch.gateRequired
                ? t("detail.gate.required")
                : t("detail.gate.nonCompliant")
            }
          >
            {batch.gateRequired
              ? t("values.required")
              : t("values.gateMissing")}
          </p>
          <p
            className={[
              "text-xs font-semibold",
              batch.control.status === "VERIFIED"
                ? "text-emerald-700"
                : "text-amber-800",
            ].join(" ")}
            title={getControlStatusReason(batch, t)}
          >
            {t(`control.status.${batch.control.status.toLowerCase()}`)}
          </p>
        </div>
      </td>
      <td className="px-4 py-4 text-sm text-bp-graphite">
        <div className="flex flex-wrap items-center gap-2">
          <ButtonLink size="compact" to={batchPath} variant="secondary">
            {t("actions.viewDetails")}
          </ButtonLink>
          {blockReason ? (
            <Button
              disabled
              size="compact"
              title={blockReason}
              variant="secondary"
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              {t("actions.requestRun")}
            </Button>
          ) : (
            <ButtonLink
              size="compact"
              title={t("actions.requestRun")}
              to={requestPath}
              variant="secondary"
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              {t("actions.requestRun")}
            </ButtonLink>
          )}
          {blockReason ? (
            <span
              className="inline-flex rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800"
              title={blockReason}
            >
              {t("execution.blocked")}
            </span>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function getControlStatusReason(
  batch: BatchListItem,
  t: (key: string) => string,
): string | undefined {
  if (batch.control.status === "VERIFIED") {
    return t("control.verifiedReason");
  }

  return batch.control.disabledReason === "UNAPPROVED_BATCH_REVISION"
    ? t("execution.errors.controlBypassed")
    : t("execution.errors.controlUnknown");
}
