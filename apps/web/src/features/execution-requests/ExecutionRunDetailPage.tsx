import type {
  BatchPlaneRuntimePorts,
  ExecutionRun,
  FailureFollowUp,
  FailureFollowUpStatus,
} from "@batchplane/domain";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ExternalLink,
  GitBranch,
  Loader2,
  RefreshCw,
  Save,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { FormEvent } from "react";
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
import { failureFollowUpStatuses } from "./failure-follow-up-model";

type ExecutionRunDetailPageProps = {
  createRuntime?: (session: GitHubSession) => BatchPlaneRuntimePorts;
  readSession?: () => GitHubSession | null;
};

type ExecutionRunJobItem = NonNullable<ExecutionRun["jobs"]>[number];
type ExecutionRunJobKind = "business" | "gate";

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
  const [searchParams] = useSearchParams();
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
            message: formatExecutionRunDetailError(error, t),
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
  const source = searchParams.get("from");
  const backLink =
    source === "failures"
      ? {
          label: t("runDetail.actions.backToFailures"),
          to: "/failures",
        }
      : source === "runs"
        ? {
            label: t("runDetail.actions.backToRuns"),
            to: "/runs",
          }
        : null;

  async function recordFailureFollowUp({
    actionTaken,
    explanation,
    owner,
    status,
  }: {
    actionTaken: string;
    explanation: string;
    owner: string;
    status: FailureFollowUpStatus;
  }) {
    const session = readSession();

    if (!session) {
      throw new Error(t("runDetail.states.noSession"));
    }

    const followUp = await createRuntime(
      session,
    ).executions.createFailureFollowUp({
      actionTaken,
      explanation,
      owner,
      runId: run.runId,
      status,
    });

    setState((current) =>
      current.type === "loaded"
        ? {
            type: "loaded",
            run: {
              ...current.run,
              failureFollowUps: [
                ...(current.run.failureFollowUps ?? []),
                followUp,
              ],
            },
          }
        : current,
    );
  }

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title={t("runDetail.title")}
          subtitle={t("runDetail.subtitle", { runId: run.runId })}
        />
        <div className="flex flex-wrap gap-2">
          {backLink ? (
            <Link
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bp-graphite"
              to={backLink.to}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              {backLink.label}
            </Link>
          ) : null}
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
        <RunSummaryPanel run={run} />
        <aside className="space-y-4">
          <GateOutcomePanel run={run} />
          <BusinessOutcomePanel run={run} />
        </aside>
        {run.status === "FAILED" ? (
          <div className="xl:col-span-2">
            <FailureFollowUpPanel onSubmit={recordFailureFollowUp} run={run} />
          </div>
        ) : null}
        <div className="xl:col-span-2">
          <JobSummaryPanel run={run} />
        </div>
      </div>
    </section>
  );
}

function FailureFollowUpPanel({
  onSubmit,
  run,
}: {
  onSubmit: (params: {
    actionTaken: string;
    explanation: string;
    owner: string;
    status: FailureFollowUpStatus;
  }) => Promise<void>;
  run: ExecutionRun;
}) {
  const { t } = useTranslation("executionRequests");
  const [actionTaken, setActionTaken] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [explanation, setExplanation] = useState("");
  const [owner, setOwner] = useState("");
  const [status, setStatus] = useState<FailureFollowUpStatus>("INVESTIGATING");
  const [submitState, setSubmitState] = useState<"idle" | "submitting">("idle");
  const followUps = run.failureFollowUps ?? [];
  const canSubmit =
    actionTaken.trim() !== "" &&
    explanation.trim() !== "" &&
    owner.trim() !== "" &&
    submitState !== "submitting";

  async function submitFollowUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    setErrorMessage("");
    setSubmitState("submitting");

    try {
      await onSubmit({
        actionTaken: actionTaken.trim(),
        explanation: explanation.trim(),
        owner: owner.trim(),
        status,
      });
      setActionTaken("");
      setExplanation("");
      setOwner("");
      setStatus("INVESTIGATING");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : t("runDetail.followUp.error"),
      );
    } finally {
      setSubmitState("idle");
    }
  }

  return (
    <article
      className="rounded-lg border border-red-200 bg-white p-5 shadow-sm"
      id="failure-follow-up"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-red-700" aria-hidden="true" />
        <h2 className="text-base font-bold text-bp-graphite">
          {t("runDetail.followUp.title")}
        </h2>
      </div>
      <p className="mt-3 text-sm font-semibold text-bp-muted">
        {t("runDetail.followUp.description")}
      </p>

      <form
        className="mt-4 grid gap-3 lg:grid-cols-2"
        onSubmit={submitFollowUp}
      >
        <label className="block text-sm font-semibold text-bp-graphite">
          {t("runDetail.followUp.owner")}
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            onChange={(event) => setOwner(event.target.value)}
            placeholder={t("runDetail.followUp.ownerPlaceholder")}
            value={owner}
          />
        </label>
        <label className="block text-sm font-semibold text-bp-graphite">
          {t("runDetail.followUp.status")}
          <select
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            onChange={(event) =>
              setStatus(event.target.value as FailureFollowUpStatus)
            }
            value={status}
          >
            {failureFollowUpStatuses.map((option) => (
              <option key={option} value={option}>
                {t(`runDetail.followUp.statusValues.${option}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-semibold text-bp-graphite">
          {t("runDetail.followUp.explanation")}
          <textarea
            className="mt-1 min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            onChange={(event) => setExplanation(event.target.value)}
            placeholder={t("runDetail.followUp.explanationPlaceholder")}
            value={explanation}
          />
        </label>
        <label className="block text-sm font-semibold text-bp-graphite">
          {t("runDetail.followUp.actionTaken")}
          <textarea
            className="mt-1 min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            onChange={(event) => setActionTaken(event.target.value)}
            placeholder={t("runDetail.followUp.actionTakenPlaceholder")}
            value={actionTaken}
          />
        </label>
        {errorMessage ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 lg:col-span-2">
            {errorMessage}
          </p>
        ) : null}
        <button
          className="inline-flex w-fit items-center gap-2 rounded-md bg-bp-control px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300 lg:col-span-2"
          disabled={!canSubmit}
          type="submit"
        >
          <Save className="h-4 w-4" aria-hidden="true" />
          {submitState === "submitting"
            ? t("runDetail.followUp.saving")
            : t("runDetail.followUp.save")}
        </button>
      </form>

      <div className="mt-5">
        <h3 className="text-sm font-bold text-bp-graphite">
          {t("runDetail.followUp.history")}
        </h3>
        {followUps.length === 0 ? (
          <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold text-bp-muted">
            {t("runDetail.followUp.empty")}
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {followUps.map((followUp) => (
              <FailureFollowUpItem
                followUp={followUp}
                key={followUp.followUpId}
              />
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

function FailureFollowUpItem({ followUp }: { followUp: FailureFollowUp }) {
  const { t } = useTranslation("executionRequests");

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-red-50 px-2 py-1 text-xs font-bold text-red-800">
          {t(`runDetail.followUp.statusValues.${followUp.status}`)}
        </span>
        <span className="text-xs font-semibold text-bp-muted">
          @{followUp.author} - {followUp.createdAt}
        </span>
      </div>
      <p className="mt-2 text-sm font-semibold text-bp-graphite [overflow-wrap:anywhere]">
        {followUp.explanation}
      </p>
      <p className="mt-1 text-sm font-semibold text-bp-muted [overflow-wrap:anywhere]">
        {followUp.actionTaken}
      </p>
      <p className="mt-2 text-xs font-semibold text-bp-muted [overflow-wrap:anywhere]">
        {t("runDetail.followUp.owner")}: {followUp.owner}
      </p>
    </li>
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
      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
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
      <p className="mt-2 text-sm font-semibold text-bp-muted">
        {t("runDetail.jobs.description")}
      </p>
      {jobs.length === 0 ? (
        <p className="mt-4 text-sm font-semibold text-bp-muted">
          {t("runDetail.jobs.empty")}
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {jobs.map((job) => (
            <li
              className="grid gap-3 py-3 first:pt-0 last:pb-0 lg:grid-cols-[minmax(0,1fr)_8rem_9rem_11rem]"
              key={job.jobId}
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-bp-graphite">{job.name}</p>
                  <JobKindBadge kind={getJobKind(job)} />
                </div>
                <p className="mt-1 font-mono text-xs text-bp-muted">
                  {t("runDetail.jobs.jobId", { jobId: job.jobId })}
                </p>
              </div>
              <RunStatusBadge status={job.status} variant="job" />
              <p className="text-sm font-semibold text-bp-muted">
                {job.conclusion || t("runDetail.values.inProgress")}
              </p>
              <JobLogAction job={job} />
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function JobKindBadge({ kind }: { kind: ExecutionRunJobKind }) {
  const { t } = useTranslation("executionRequests");
  const className =
    kind === "gate" ? "bg-orange-50 text-orange-800" : "bg-sky-50 text-sky-800";

  return (
    <span className={`rounded-md px-2 py-1 text-xs font-bold ${className}`}>
      {t(`runDetail.jobs.kind.${kind}`)}
    </span>
  );
}

function JobLogAction({ job }: { job: ExecutionRunJobItem }) {
  const { t } = useTranslation("executionRequests");
  const kind = getJobKind(job);

  if (!job.url) {
    return (
      <span className="text-sm font-semibold text-bp-muted">
        {t("runDetail.jobs.logUnavailable")}
      </span>
    );
  }

  return (
    <a
      aria-label={t("runDetail.jobs.openLogForJob", { name: job.name })}
      className="inline-flex w-fit items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bp-graphite"
      href={job.url}
      rel="noreferrer"
      target="_blank"
    >
      <ExternalLink className="h-4 w-4" aria-hidden="true" />
      {kind === "gate"
        ? t("runDetail.jobs.openGateLog")
        : t("runDetail.jobs.openBusinessLog")}
    </a>
  );
}

function DetailFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-white/70 px-3 py-2 ring-1 ring-slate-100">
      <dt className="text-xs font-semibold uppercase tracking-normal text-bp-muted">
        {label}
      </dt>
      <dd className="mt-1 font-mono text-xs font-semibold leading-relaxed text-bp-graphite [overflow-wrap:anywhere]">
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

function getJobKind(job: ExecutionRunJobItem): ExecutionRunJobKind {
  return isGateJob(job) ? "gate" : "business";
}

function hasSuccessfulGateJob(run: ExecutionRun): boolean {
  return Boolean(
    run.jobs?.some((job) => isGateJob(job) && job.status === "SUCCEEDED"),
  );
}

function isGateJob(job: Pick<ExecutionRunJobItem, "name">): boolean {
  return job.name.toLowerCase().includes("gate");
}

function formatExecutionRunDetailError(
  error: unknown,
  t: ReturnType<typeof useTranslation<"executionRequests">>["t"],
): string {
  if (isGitHubForbiddenError(error)) {
    return t("runDetail.states.actionsPermission");
  }

  return formatRuntimeError(error, t("runDetail.states.error"));
}

function isGitHubForbiddenError(error: unknown): boolean {
  if (!(error instanceof Error) || error.name !== "GitHubLiteApiError") {
    return false;
  }

  const candidate = error as { code?: unknown; status?: unknown };

  return candidate.code === "forbidden" || candidate.status === 403;
}
