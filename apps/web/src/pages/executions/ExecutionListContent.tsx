import type { ExecutionRunPresentation as ExecutionRun } from "@batchplane/ui-client";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ExecutionRow } from "./ExecutionRow";

import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../components/PageState";

import { isBusinessFailure } from "@batchplane/ui-client";
import { formatInspectionError } from "../../client/inspection-errors";
import type { ExecutionsState } from "./useExecutions";

export type ExecutionFilter =
  | "active"
  | "all"
  | "blocked"
  | "canceled"
  | "failed"
  | "succeeded";
export type ExecutionListView = "executions" | "failures";

const executionRunFilters = [
  "all",
  "active",
  "succeeded",
  "failed",
  "blocked",
  "canceled",
] as const;
const failureRunFilters = ["all", "failed", "blocked"] as const;

export function ExecutionListContent({
  activeFilter,
  namespace,
  onFilterChange,
  state,
  view,
}: {
  activeFilter: ExecutionFilter;
  namespace: "executions" | "failures";
  onFilterChange: (filter: ExecutionFilter) => void;
  state: ExecutionsState;
  view: ExecutionListView;
}) {
  const { t } = useTranslation(namespace);

  if (state.type === "loading") {
    return <LoadingState message={t("states.loading")} />;
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
        message={t("states.noSession")}
      />
    );
  }

  if (state.type === "error") {
    return (
      <ErrorState
        message={formatInspectionError(state.error, t, "states.error")}
      />
    );
  }

  return (
    <LoadedExecutionList
      activeFilter={activeFilter}
      namespace={namespace}
      onFilterChange={onFilterChange}
      runs={state.runs}
      view={view}
    />
  );
}

function LoadedExecutionList({
  activeFilter,
  namespace,
  onFilterChange,
  runs,
  view,
}: {
  activeFilter: ExecutionFilter;
  namespace: "executions" | "failures";
  onFilterChange: (filter: ExecutionFilter) => void;
  runs: ExecutionRun[];
  view: ExecutionListView;
}) {
  const { t } = useTranslation(namespace);
  const visibleRuns = useMemo(
    () => (view === "failures" ? runs.filter(isFollowUpRun) : runs),
    [runs, view],
  );
  const filteredRuns = useMemo(
    () => visibleRuns.filter((run) => matchesFilter(run, activeFilter)),
    [activeFilter, visibleRuns],
  );
  const activeRuns = runs.filter(isActiveRun);
  const followUpRuns = runs.filter(isFollowUpRun);
  const businessFailedRuns = runs.filter(isBusinessFailure);
  const blockedRuns = runs.filter((run) => run.status === "BLOCKED");
  const explainedRuns = businessFailedRuns.filter(
    (run) => (run.failureFollowUps ?? []).length > 0,
  );
  const succeededRuns = runs.filter((run) => run.status === "SUCCEEDED");
  const filters = view === "failures" ? failureRunFilters : executionRunFilters;

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {view === "failures" ? (
          <>
            <ExecutionMetric
              label={t("summary.total")}
              tone="danger"
              value={followUpRuns.length}
            />
            <ExecutionMetric
              label={t("summary.failed")}
              tone="danger"
              value={businessFailedRuns.length}
            />
            <ExecutionMetric
              label={t("summary.blocked")}
              tone="warning"
              value={blockedRuns.length}
            />
            <ExecutionMetric
              label={t("summary.explained")}
              tone="success"
              value={explainedRuns.length}
            />
          </>
        ) : (
          <>
            <ExecutionMetric
              label={t("summary.total")}
              tone="neutral"
              value={runs.length}
            />
            <ExecutionMetric
              label={t("summary.active")}
              tone="info"
              value={activeRuns.length}
            />
            <ExecutionMetric
              label={t("summary.succeeded")}
              tone="success"
              value={succeededRuns.length}
            />
            <ExecutionMetric
              label={t("summary.followUp")}
              tone="danger"
              value={followUpRuns.length}
            />
          </>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-bp-graphite">
              {t("list.title")}
            </h2>
            <p className="mt-1 text-sm text-bp-muted">
              {t("list.subtitle", { count: filteredRuns.length })}
            </p>
          </div>
          <div className="flex flex-wrap gap-2" role="group">
            {filters.map((filter) => (
              <button
                className={[
                  "rounded-md border px-3 py-2 text-sm font-semibold",
                  filter === activeFilter
                    ? "border-bp-control bg-bp-control text-white"
                    : "border-slate-300 bg-white text-bp-graphite",
                ].join(" ")}
                key={filter}
                onClick={() => onFilterChange(filter)}
                type="button"
              >
                {t(`filters.${filter}`)}
              </button>
            ))}
          </div>
        </div>

        {filteredRuns.length === 0 ? (
          <p className="mt-5 rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold text-bp-muted">
            {t("list.empty")}
          </p>
        ) : (
          <ul className="mt-5 divide-y divide-slate-100">
            {filteredRuns.map((run) => (
              <ExecutionRow
                key={`${run.runId}:${run.runAttempt ?? 1}`}
                namespace={namespace}
                run={run}
                view={view}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ExecutionMetric({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "danger" | "info" | "neutral" | "success" | "warning";
  value: number;
}) {
  const toneClass = {
    danger: "text-red-700",
    info: "text-sky-700",
    neutral: "text-bp-muted",
    success: "text-emerald-700",
    warning: "text-orange-700",
  }[tone];

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-bp-muted">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${toneClass}`}>{value}</p>
    </article>
  );
}

function matchesFilter(run: ExecutionRun, filter: ExecutionFilter): boolean {
  if (filter === "all") {
    return true;
  }

  if (filter === "active") {
    return isActiveRun(run);
  }

  if (filter === "blocked") {
    return run.status === "BLOCKED";
  }

  if (filter === "canceled") {
    return run.status === "CANCELED";
  }

  if (filter === "failed") {
    return isBusinessFailure(run);
  }

  return run.status === "SUCCEEDED";
}

function isFollowUpRun(run: ExecutionRun): boolean {
  return run.status === "BLOCKED" || isBusinessFailure(run);
}

function isActiveRun(run: ExecutionRun): boolean {
  return run.status === "QUEUED" || run.status === "RUNNING";
}
