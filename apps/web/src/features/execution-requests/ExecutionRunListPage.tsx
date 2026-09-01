import type { BatchPlaneRuntimePorts, ExecutionRun } from "@batchplane/domain";
import {
  AlertTriangle,
  CheckCircle2,
  CircleOff,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { GitHubSession } from "../lite-setup/github-session";
import { PageHeader } from "../../ui/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "../../ui/PageState";
import {
  createBatchPlaneRuntime,
  readRuntimeSession,
} from "../../runtime/runtime-fixtures";
import { formatRuntimeError } from "../../runtime/runtime-errors";
import { formatGateReasonDisplay } from "../../i18n/display-keys";

type ExecutionRunListPageProps = {
  createRuntime?: (session: GitHubSession) => BatchPlaneRuntimePorts;
  readSession?: () => GitHubSession | null;
  view?: ExecutionRunListView;
};

type PageState =
  | { type: "loading" }
  | { type: "no-session" }
  | { type: "loaded"; runs: ExecutionRun[] }
  | { type: "error"; message: string };

type ExecutionRunFilter =
  | "active"
  | "all"
  | "blocked"
  | "canceled"
  | "failed"
  | "succeeded";
type ExecutionRunListView = "executions" | "failures";

const executionRunFilters = [
  "all",
  "active",
  "succeeded",
  "failed",
  "blocked",
  "canceled",
] as const;
const failureRunFilters = ["all", "failed", "blocked"] as const;

export function ExecutionRunListPage({
  createRuntime = createBatchPlaneRuntime,
  readSession = readRuntimeSession,
  view = "executions",
}: ExecutionRunListPageProps = {}) {
  const namespace = view === "failures" ? "failures" : "executions";
  const { t } = useTranslation(namespace);
  const [searchParams, setSearchParams] = useSearchParams();
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<PageState>({ type: "loading" });
  const activeFilter = readExecutionRunFilter(searchParams, view);

  useEffect(() => {
    let ignoreResult = false;

    async function loadRuns() {
      const session = readSession();

      if (!session) {
        setState({ type: "no-session" });
        return;
      }

      setState({ type: "loading" });

      try {
        const runtime = createRuntime(session);
        const runs = await runtime.executions.listExecutionRuns({ limit: 100 });

        if (ignoreResult) {
          return;
        }

        setState({
          type: "loaded",
          runs,
        });
      } catch (error) {
        if (!ignoreResult) {
          setState({
            type: "error",
            message: formatRuntimeError(error, t("states.error")),
          });
        }
      }
    }

    void loadRuns();

    return () => {
      ignoreResult = true;
    };
  }, [createRuntime, readSession, reloadToken, t]);

  function changeFilter(filter: ExecutionRunFilter) {
    if (filter === "all") {
      setSearchParams({});
      return;
    }

    setSearchParams({ type: filter });
  }

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title={t("title")} subtitle={t("subtitle")} />
        <button
          className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bp-graphite"
          onClick={() => setReloadToken((current) => current + 1)}
          type="button"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {t("actions.refresh")}
        </button>
      </div>
      <ExecutionRunListContent
        activeFilter={activeFilter}
        namespace={namespace}
        onFilterChange={changeFilter}
        state={state}
        view={view}
      />
    </section>
  );
}

function ExecutionRunListContent({
  activeFilter,
  namespace,
  onFilterChange,
  state,
  view,
}: {
  activeFilter: ExecutionRunFilter;
  namespace: "executions" | "failures";
  onFilterChange: (filter: ExecutionRunFilter) => void;
  state: PageState;
  view: ExecutionRunListView;
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

  return (
    <LoadedExecutionRunList
      activeFilter={activeFilter}
      namespace={namespace}
      onFilterChange={onFilterChange}
      runs={state.runs}
      view={view}
    />
  );
}

function LoadedExecutionRunList({
  activeFilter,
  namespace,
  onFilterChange,
  runs,
  view,
}: {
  activeFilter: ExecutionRunFilter;
  namespace: "executions" | "failures";
  onFilterChange: (filter: ExecutionRunFilter) => void;
  runs: ExecutionRun[];
  view: ExecutionRunListView;
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
  const businessFailedRuns = runs.filter((run) => run.status === "FAILED");
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
              <ExecutionRunRow
                key={run.runId}
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

function ExecutionRunRow({
  namespace,
  run,
  view,
}: {
  namespace: "executions" | "failures";
  run: ExecutionRun;
  view: ExecutionRunListView;
}) {
  const { i18n, t } = useTranslation(namespace);
  const display = getRunStatusDisplay(run.status);
  const Icon = display.icon;
  const runDetailPath =
    view === "failures"
      ? `/execution-runs/${run.runId}?from=failures`
      : `/execution-runs/${run.runId}`;
  const followUpPath =
    view === "failures"
      ? `/execution-runs/${run.runId}?from=failures#failure-follow-up`
      : runDetailPath;
  const hasFailureFollowUp = (run.failureFollowUps ?? []).length > 0;
  const failureFollowUpStatusKey = getFailureFollowUpStatusKey(run);

  return (
    <li className="grid gap-4 py-4 first:pt-0 last:pb-0 xl:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold ${display.className}`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {t(`status.${run.status}`)}
          </span>
          <Link
            className="font-semibold text-bp-graphite hover:text-bp-control"
            to={runDetailPath}
          >
            {run.batchId || t("values.unknownBatch")}
          </Link>
        </div>
        <p className="text-sm font-semibold text-bp-muted">
          {getRunOutcomeText(run, t)}
        </p>
        {view === "failures" && run.status === "FAILED" ? (
          <p className="w-fit rounded-md bg-red-50 px-2 py-1 text-xs font-bold text-red-800">
            {t(`values.${failureFollowUpStatusKey}`)}
          </p>
        ) : null}
        <dl className="grid gap-3 text-xs md:grid-cols-2">
          <ExecutionRunFact label={t("fields.runId")} value={run.runId} />
          <ExecutionRunFact
            label={t("fields.requestId")}
            value={run.requestId || t("values.unknown")}
          />
          <ExecutionRunFact
            label={t("fields.workflow")}
            value={run.workflowPath || t("values.unknown")}
          />
          <ExecutionRunFact
            label={t("fields.completedAt")}
            value={
              formatRunTimestamp(run.completedAt, i18n.language) ||
              t("values.inProgress")
            }
          />
        </dl>
      </div>
      <div className="flex flex-wrap items-start gap-2 xl:justify-end">
        {view === "failures" && run.status === "FAILED" ? (
          <Link
            className="inline-flex items-center whitespace-nowrap rounded-md bg-bp-control px-3 py-2 text-sm font-semibold text-white"
            to={followUpPath}
          >
            {hasFailureFollowUp
              ? t("actions.viewFollowUp")
              : t("actions.recordFollowUp")}
          </Link>
        ) : null}
        {run.workflowRunUrl ? (
          <a
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bp-muted"
            href={run.workflowRunUrl}
            rel="noreferrer"
            target="_blank"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            {t("actions.githubRun")}
          </a>
        ) : null}
        <Link
          className={[
            "inline-flex items-center whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold",
            view === "failures" && run.status === "FAILED"
              ? "border border-slate-300 bg-white text-bp-graphite"
              : "bg-bp-control text-white",
          ].join(" ")}
          to={runDetailPath}
        >
          {t("actions.openRun")}
        </Link>
      </div>
    </li>
  );
}

function getFailureFollowUpStatusKey(run: ExecutionRun) {
  const latestFollowUp = (run.failureFollowUps ?? []).at(-1);

  if (!latestFollowUp) {
    return "explanationNeeded";
  }

  if (latestFollowUp.reviewStatus === "APPROVED") {
    return "reviewApproved";
  }

  if (latestFollowUp.reviewStatus === "REJECTED") {
    return "reviewRejected";
  }

  if (latestFollowUp.reviewStatus === "CHANGES_REQUESTED") {
    return "reviewChangesRequested";
  }

  return "reviewAwaiting";
}

function ExecutionRunFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-semibold uppercase tracking-normal text-bp-muted">
        {label}
      </dt>
      <dd
        className="mt-1 break-all font-mono font-semibold text-bp-graphite md:truncate md:break-normal"
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

function matchesFilter(run: ExecutionRun, filter: ExecutionRunFilter): boolean {
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
    return run.status === "FAILED";
  }

  return run.status === "SUCCEEDED";
}

function isFollowUpRun(run: ExecutionRun): boolean {
  return run.status === "FAILED" || run.status === "BLOCKED";
}

function isActiveRun(run: ExecutionRun): boolean {
  return run.status === "QUEUED" || run.status === "RUNNING";
}

function formatRunTimestamp(
  value: string | undefined,
  locale: string,
): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    year: "numeric",
  }).format(date);
}

function getRunOutcomeText(
  run: ExecutionRun,
  t: (key: string) => string,
): string {
  if (run.status === "BLOCKED") {
    return formatGateReasonDisplay(
      run.gateDecision?.reasonCode,
      t,
      t("values.gateBlocked"),
    );
  }

  if (run.status === "FAILED") {
    return t("values.businessFailure");
  }

  if (run.status === "SUCCEEDED") {
    return t("values.succeeded");
  }

  if (isActiveRun(run)) {
    return t("values.active");
  }

  if (run.status === "CANCELED") {
    return t("values.canceled");
  }

  return t("values.unknown");
}

function getRunStatusDisplay(status: ExecutionRun["status"]): {
  className: string;
  icon: LucideIcon;
} {
  switch (status) {
    case "BLOCKED":
      return {
        className: "bg-orange-50 text-orange-800",
        icon: ShieldAlert,
      };
    case "CANCELED":
      return {
        className: "bg-slate-100 text-slate-700",
        icon: CircleOff,
      };
    case "FAILED":
      return {
        className: "bg-red-50 text-red-800",
        icon: AlertTriangle,
      };
    case "QUEUED":
    case "RUNNING":
      return {
        className: "bg-sky-50 text-sky-800",
        icon: Loader2,
      };
    case "SUCCEEDED":
      return {
        className: "bg-emerald-50 text-emerald-800",
        icon: CheckCircle2,
      };
  }
}

function readExecutionRunFilter(
  searchParams: URLSearchParams,
  view: ExecutionRunListView,
): ExecutionRunFilter {
  const type = searchParams.get("type");
  const validFilter =
    type === "active" ||
    type === "blocked" ||
    type === "canceled" ||
    type === "failed" ||
    type === "succeeded"
      ? type
      : "all";

  return view === "failures" &&
    validFilter !== "all" &&
    validFilter !== "failed" &&
    validFilter !== "blocked"
    ? "all"
    : validFilter;
}
