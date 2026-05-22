import type { BatchPlaneRuntimePorts, ExecutionRun } from "@batchplane/domain";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  GitBranch,
  Loader2,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { GitHubSession } from "../lite-setup/github-session";
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

type ExecutionRunDetailPageProps = {
  createRuntime?: (session: GitHubSession) => BatchPlaneRuntimePorts;
  readSession?: () => GitHubSession | null;
};

type PageState =
  | { type: "loading" }
  | { type: "no-session" }
  | { type: "not-found"; runId: string }
  | { type: "loaded"; run: ExecutionRun }
  | { type: "error"; message: string };

export function ExecutionRunDetailPage({
  createRuntime = createBatchPlaneRuntime,
  readSession = readRuntimeSession,
}: ExecutionRunDetailPageProps = {}) {
  const { runId = "" } = useParams();
  const { t } = useTranslation("executionRequests");
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<PageState>({ type: "loading" });

  useEffect(() => {
    let ignoreResult = false;

    async function loadRun() {
      const session = readSession();

      if (!session) {
        setState({ type: "no-session" });
        return;
      }

      setState({ type: "loading" });

      try {
        const runtime = createRuntime(session);
        const run = await runtime.executions.getExecutionRun({ runId });

        if (ignoreResult) {
          return;
        }

        if (!run) {
          setState({ type: "not-found", runId });
          return;
        }

        setState({ type: "loaded", run });
      } catch (error) {
        if (!ignoreResult) {
          setState({
            type: "error",
            message: formatRuntimeError(error, t("runDetail.states.error")),
          });
        }
      }
    }

    void loadRun();

    return () => {
      ignoreResult = true;
    };
  }, [createRuntime, readSession, reloadToken, runId, t]);

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
    return <ErrorState message={state.message} />;
  }

  const { run } = state;

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title={t("runDetail.title")}
          subtitle={t("runDetail.subtitle", { runId: run.runId })}
        />
        <div className="flex flex-wrap gap-2">
          <button
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bp-graphite"
            onClick={() => setReloadToken((current) => current + 1)}
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

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-4">
          <RunSummaryPanel run={run} />
          <JobSummaryPanel run={run} />
        </div>
        <aside className="space-y-4">
          <GateOutcomePanel run={run} />
          <BusinessOutcomePanel run={run} />
        </aside>
      </div>
    </section>
  );
}

function RunSummaryPanel({ run }: { run: ExecutionRun }) {
  const { t } = useTranslation("executionRequests");

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-bp-git" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-bp-graphite">
            {run.workflowName || t("runDetail.values.unknownWorkflow")}
          </h2>
        </div>
        <RunStatusBadge status={run.status} />
      </div>
      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <DetailFact label={t("runDetail.fields.runId")} value={run.runId} />
        <DetailFact
          label={t("runDetail.fields.requestId")}
          value={run.requestId || t("runDetail.values.unknown")}
        />
        <DetailFact
          label={t("runDetail.fields.batchId")}
          value={run.batchId || t("runDetail.values.unknown")}
        />
        <DetailFact
          label={t("runDetail.fields.actor")}
          value={run.actor || t("runDetail.values.unknown")}
        />
        <DetailFact
          label={t("runDetail.fields.workflow")}
          value={run.workflowPath || t("runDetail.values.unknown")}
        />
        <DetailFact
          label={t("runDetail.fields.event")}
          value={run.event || t("runDetail.values.unknown")}
        />
        <DetailFact
          label={t("runDetail.fields.runAttempt")}
          value={String(run.runAttempt ?? 1)}
        />
        <DetailFact
          label={t("runDetail.fields.startedAt")}
          value={run.startedAt || t("runDetail.values.unknown")}
        />
        <DetailFact
          label={t("runDetail.fields.completedAt")}
          value={run.completedAt || t("runDetail.values.inProgress")}
        />
      </dl>
    </article>
  );
}

function GateOutcomePanel({ run }: { run: ExecutionRun }) {
  const { t } = useTranslation("executionRequests");
  const blocked = run.status === "BLOCKED";
  const allowed =
    run.gateDecision?.allowed === true || hasSuccessfulGateJob(run);
  const tone = blocked ? "blocked" : allowed ? "allowed" : "unknown";
  const Icon =
    tone === "blocked" ? XCircle : tone === "allowed" ? ShieldCheck : Loader2;
  const panelClass = {
    allowed: "border-emerald-200 bg-emerald-50",
    blocked: "border-orange-200 bg-orange-50",
    unknown: "border-slate-200 bg-slate-50",
  }[tone];
  const iconClass = {
    allowed: "text-emerald-700",
    blocked: "text-orange-700",
    unknown: "text-bp-muted",
  }[tone];
  const titleClass = {
    allowed: "text-emerald-950",
    blocked: "text-orange-950",
    unknown: "text-bp-graphite",
  }[tone];
  const messageClass = {
    allowed: "text-emerald-900",
    blocked: "text-orange-900",
    unknown: "text-bp-muted",
  }[tone];

  return (
    <article className={`rounded-lg border p-5 shadow-sm ${panelClass}`}>
      <div className="flex items-center gap-2">
        <Icon className={`h-5 w-5 ${iconClass}`} aria-hidden="true" />
        <h2 className={`text-base font-bold ${titleClass}`}>
          {blocked
            ? t("runDetail.gate.blockedTitle")
            : t("runDetail.gate.title")}
        </h2>
      </div>
      <p className={`mt-3 text-sm font-semibold ${messageClass}`}>
        {blocked
          ? t("runDetail.gate.blockedMessage")
          : allowed
            ? t("runDetail.gate.allowedMessage")
            : t("runDetail.gate.noEvidence")}
      </p>
      <dl className="mt-4 grid gap-3 text-sm">
        <DetailFact
          label={t("runDetail.fields.reasonCode")}
          value={run.gateDecision?.reasonCode || t("runDetail.values.none")}
        />
        <DetailFact
          label={t("runDetail.fields.decidedAt")}
          value={run.gateDecision?.decidedAt || t("runDetail.values.unknown")}
        />
      </dl>
    </article>
  );
}

function BusinessOutcomePanel({ run }: { run: ExecutionRun }) {
  const { t } = useTranslation("executionRequests");
  const businessFailed = run.status === "FAILED";
  const blocked = run.status === "BLOCKED";
  const succeeded = run.status === "SUCCEEDED";
  const inFlight = run.status === "QUEUED" || run.status === "RUNNING";
  const canceled = run.status === "CANCELED";
  const Icon = businessFailed
    ? AlertTriangle
    : succeeded
      ? CheckCircle2
      : blocked
        ? XCircle
        : inFlight
          ? Loader2
          : AlertTriangle;
  const iconClass = businessFailed
    ? "text-red-700"
    : succeeded
      ? "text-emerald-700"
      : blocked
        ? "text-orange-700"
        : canceled
          ? "text-slate-500"
          : "text-sky-700";

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Icon className={`h-5 w-5 ${iconClass}`} aria-hidden="true" />
        <h2 className="text-base font-bold text-bp-graphite">
          {t("runDetail.business.title")}
        </h2>
      </div>
      <p className="mt-3 text-sm font-semibold text-bp-muted">
        {blocked
          ? t("runDetail.business.notReached")
          : businessFailed
            ? t("runDetail.business.failed")
            : t("runDetail.business.current", {
                status: t(`runDetail.status.${run.status}`),
              })}
      </p>
    </article>
  );
}

function JobSummaryPanel({ run }: { run: ExecutionRun }) {
  const { t } = useTranslation("executionRequests");
  const jobs = run.jobs ?? [];

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <GitBranch className="h-5 w-5 text-bp-git" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-bp-graphite">
          {t("runDetail.jobs.title")}
        </h2>
      </div>
      {jobs.length === 0 ? (
        <p className="mt-4 text-sm font-semibold text-bp-muted">
          {t("runDetail.jobs.empty")}
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {jobs.map((job) => (
            <li
              className="grid gap-3 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_8rem_10rem]"
              key={job.jobId}
            >
              <div>
                <p className="font-semibold text-bp-graphite">{job.name}</p>
                <p className="mt-1 font-mono text-xs text-bp-muted">
                  {job.jobId}
                </p>
              </div>
              <RunStatusBadge status={job.status} variant="job" />
              <p className="text-sm font-semibold text-bp-muted">
                {job.conclusion || t("runDetail.values.inProgress")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function DetailFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-white/70 px-3 py-2 ring-1 ring-slate-100">
      <dt className="text-xs font-semibold uppercase tracking-normal text-bp-muted">
        {label}
      </dt>
      <dd className="mt-1 break-all font-mono text-xs font-semibold text-bp-graphite">
        {value}
      </dd>
    </div>
  );
}

function RunStatusBadge({
  status,
  variant = "run",
}: {
  status: ExecutionRun["status"];
  variant?: "job" | "run";
}) {
  const { t } = useTranslation("executionRequests");
  const palette = getRunStatusPalette(status);
  const labelKey =
    variant === "job"
      ? `runDetail.jobStatus.${status}`
      : `runDetail.status.${status}`;

  return (
    <span className={`w-fit rounded-md px-2 py-1 text-xs font-bold ${palette}`}>
      {t(labelKey)}
    </span>
  );
}

function getRunStatusPalette(status: ExecutionRun["status"]): string {
  switch (status) {
    case "QUEUED":
    case "RUNNING":
      return "bg-sky-50 text-sky-800";
    case "SUCCEEDED":
      return "bg-emerald-50 text-emerald-800";
    case "BLOCKED":
      return "bg-orange-50 text-orange-800";
    case "FAILED":
      return "bg-red-50 text-red-800";
    case "CANCELED":
      return "bg-slate-100 text-bp-muted";
  }
}

function hasSuccessfulGateJob(run: ExecutionRun): boolean {
  return Boolean(
    run.jobs?.some(
      (job) =>
        job.name.toLowerCase().includes("gate") && job.status === "SUCCEEDED",
    ),
  );
}
