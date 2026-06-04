import type { BatchDefinition } from "@batchplane/domain";
import { Loader2, Play, Plus, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { PageHeader } from "../../shared/components/PageHeader";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../shared/components/PageState";
import {
  createBatchPlaneRuntime,
  readRuntimeSession,
} from "../../runtime/runtime-fixtures";
import { formatRuntimeError } from "../../runtime/runtime-errors";
import { getExecutionRequestBlockReason } from "./batch-list-readiness";

type BatchListState =
  | { type: "loading" }
  | { type: "no-session" }
  | {
      type: "loaded";
      batches: BatchDefinition[];
      defaultBranch: string;
    }
  | { type: "error"; message: string };

export function BatchesPage() {
  const { t } = useTranslation("batches");
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<BatchListState>({ type: "loading" });

  useEffect(() => {
    let ignoreResult = false;

    async function loadBatches() {
      const session = readRuntimeSession();

      if (!session) {
        setState({ type: "no-session" });
        return;
      }

      setState({ type: "loading" });

      try {
        const runtime = createBatchPlaneRuntime(session);
        const repository = await runtime.settings.getRepository();
        const batches = await runtime.batches.listBatchDefinitions({
          ref: repository.defaultBranch,
        });

        if (!ignoreResult) {
          setState({
            type: "loaded",
            batches,
            defaultBranch: repository.defaultBranch,
          });
        }
      } catch (error) {
        if (!ignoreResult) {
          setState({
            type: "error",
            message: formatBatchListError(error, t("states.error")),
          });
        }
      }
    }

    void loadBatches();

    return () => {
      ignoreResult = true;
    };
  }, [reloadToken, t]);

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title={t("title")} subtitle={t("subtitle")} />
        <div className="flex flex-wrap gap-3">
          <button
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-bp-graphite disabled:cursor-not-allowed disabled:text-slate-400"
            disabled={state.type === "loading"}
            onClick={() => setReloadToken((current) => current + 1)}
            type="button"
          >
            {state.type === "loading" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            )}
            {t("actions.refresh")}
          </button>
          <Link
            className="inline-flex items-center gap-2 rounded-md bg-bp-control px-4 py-2 text-sm font-semibold text-white"
            to="/batches/new"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("actions.register")}
          </Link>
        </div>
      </div>
      <BatchListContent state={state} />
    </section>
  );
}

function BatchListContent({ state }: { state: BatchListState }) {
  const { t } = useTranslation("batches");

  if (state.type === "loading") {
    return <LoadingState message={t("states.loading")} />;
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
        message={t("states.noSession")}
      />
    );
  }

  if (state.type === "error") {
    return <ErrorState message={state.message} />;
  }

  if (state.batches.length === 0) {
    return (
      <EmptyState
        message={t("states.empty", { branch: state.defaultBranch })}
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
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
            <th className="px-4 py-3 font-semibold">{t("table.gate")}</th>
            <th className="px-4 py-3 font-semibold">{t("table.actions")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {state.batches.map((batch) => {
            const blockReason = getExecutionRequestBlockReason({
              batch,
              isRequestInProgress: false,
              t,
            });
            const requestPath = `/batches/${encodeURIComponent(
              batch.batchId,
            )}/execution-requests/new`;

            return (
              <tr key={batch.batchId}>
                <td className="px-4 py-4 font-mono text-sm text-bp-graphite">
                  <Link
                    className="font-semibold text-bp-control underline"
                    to={`/batches/${encodeURIComponent(batch.batchId)}`}
                  >
                    {batch.batchId}
                  </Link>
                </td>
                <td className="px-4 py-4 text-sm font-semibold text-bp-graphite">
                  {batch.name}
                </td>
                <td className="px-4 py-4 text-sm text-bp-graphite">
                  {batch.owner}
                </td>
                <td className="px-4 py-4 text-sm text-bp-graphite">
                  {batch.environment}
                </td>
                <td className="px-4 py-4 text-sm text-bp-graphite">
                  {batch.criticality}
                </td>
                <td className="px-4 py-4 text-sm text-bp-graphite">
                  {batch.status}
                </td>
                <td className="px-4 py-4 text-sm text-bp-graphite">
                  {batch.gateRequired
                    ? t("values.required")
                    : t("values.gateMissing")}
                </td>
                <td className="px-4 py-4 text-sm text-bp-graphite">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bp-graphite"
                      to={`/batches/${encodeURIComponent(batch.batchId)}`}
                    >
                      {t("actions.viewDetails")}
                    </Link>
                    {blockReason ? (
                      <button
                        className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-400 disabled:cursor-not-allowed"
                        disabled
                        title={blockReason}
                        type="button"
                      >
                        <Play className="h-4 w-4" aria-hidden="true" />
                        {t("actions.requestRun")}
                      </button>
                    ) : (
                      <Link
                        className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bp-graphite"
                        title={t("actions.requestRun")}
                        to={requestPath}
                      >
                        <Play className="h-4 w-4" aria-hidden="true" />
                        {t("actions.requestRun")}
                      </Link>
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
          })}
        </tbody>
      </table>
    </div>
  );
}

function formatBatchListError(error: unknown, fallback: string): string {
  return formatRuntimeError(error, fallback);
}
