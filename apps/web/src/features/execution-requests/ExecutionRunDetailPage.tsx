import type {
  BatchPlaneRuntimePorts,
  ExecutionRun,
  ExecutionRunJobLog,
  FailureFollowUp,
  FailureFollowUpReviewDecision,
  FailureFollowUpReviewDecisionValue,
  FailureFollowUpStatus,
} from "@batchplane/domain";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  Download,
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
import { PageHeader } from "../../ui/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "../../ui/PageState";
import {
  createBatchPlaneRuntime,
  readRuntimeSession,
} from "../../runtime/runtime-fixtures";
import { formatRuntimeError } from "../../runtime/runtime-errors";
import { getGateReasonDisplayKey } from "../../i18n/display-keys";
import { failureFollowUpStatuses } from "./failure-follow-up-model";

type ExecutionRunDetailPageProps = {
  createRuntime?: (session: GitHubSession) => BatchPlaneRuntimePorts;
  readSession?: () => GitHubSession | null;
};

type ExecutionRunJobItem = NonNullable<ExecutionRun["jobs"]>[number];
type ExecutionRunJobKind = "business" | "gate";
type LoadExecutionRunJobLog = (jobId: string) => Promise<ExecutionRunJobLog>;
type LogViewMode = "focused" | "full";
type JobLogState =
  | { type: "idle" }
  | { type: "loading" }
  | { type: "loaded"; log: ExecutionRunJobLog }
  | { type: "error"; message: string };

const maxRenderedLogLines = 500;

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

  async function reviewFailureFollowUp({
    decision,
    followUpId,
    reason,
  }: {
    decision: FailureFollowUpReviewDecisionValue;
    followUpId: string;
    reason: string;
  }) {
    const session = readSession();

    if (!session) {
      throw new Error(t("runDetail.states.noSession"));
    }

    const review = await createRuntime(
      session,
    ).executions.reviewFailureFollowUp({
      decision,
      followUpId,
      reason,
      runId: run.runId,
    });

    setState((current) =>
      current.type === "loaded"
        ? {
            type: "loaded",
            run: {
              ...current.run,
              failureFollowUps: (current.run.failureFollowUps ?? []).map(
                (followUp) =>
                  followUp.followUpId === review.followUpId
                    ? {
                        ...followUp,
                        reviewStatus: review.decision,
                        reviews: [...followUp.reviews, review],
                      }
                    : followUp,
              ),
            },
          }
        : current,
    );
  }

  async function loadExecutionRunJobLog(jobId: string) {
    const session = readSession();

    if (!session) {
      throw new Error(t("runDetail.states.noSession"));
    }

    return createRuntime(session).executions.getExecutionRunJobLog({ jobId });
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
            <FailureFollowUpPanel
              onReview={reviewFailureFollowUp}
              onSubmit={recordFailureFollowUp}
              run={run}
            />
          </div>
        ) : null}
        <div className="xl:col-span-2">
          <JobSummaryPanel onLoadLog={loadExecutionRunJobLog} run={run} />
        </div>
      </div>
    </section>
  );
}

function FailureFollowUpPanel({
  onReview,
  onSubmit,
  run,
}: {
  onReview: (params: {
    decision: FailureFollowUpReviewDecisionValue;
    followUpId: string;
    reason: string;
  }) => Promise<void>;
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
                onReview={onReview}
              />
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

function FailureFollowUpItem({
  followUp,
  onReview,
}: {
  followUp: FailureFollowUp;
  onReview: (params: {
    decision: FailureFollowUpReviewDecisionValue;
    followUpId: string;
    reason: string;
  }) => Promise<void>;
}) {
  const { i18n, t } = useTranslation("executionRequests");
  const [errorMessage, setErrorMessage] = useState("");
  const [reason, setReason] = useState("");
  const [submitDecision, setSubmitDecision] =
    useState<FailureFollowUpReviewDecisionValue | null>(null);
  const latestReview = latestFailureFollowUpReview(followUp);
  const reviewCapability = followUp.reviewCapability ?? {
    canReview: false,
    unavailableReason: "PERMISSION_UNAVAILABLE" as const,
  };
  const canReview =
    reviewCapability.canReview &&
    followUp.reviewStatus === "AWAITING_REVIEW" &&
    reason.trim() !== "";

  async function submitReview(decision: FailureFollowUpReviewDecisionValue) {
    if (!canReview || submitDecision) {
      return;
    }

    setErrorMessage("");
    setSubmitDecision(decision);

    try {
      await onReview({
        decision,
        followUpId: followUp.followUpId,
        reason: reason.trim(),
      });
      setReason("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t("runDetail.followUp.review.error"),
      );
    } finally {
      setSubmitDecision(null);
    }
  }

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-red-50 px-2 py-1 text-xs font-bold text-red-800">
          {t(`runDetail.followUp.statusValues.${followUp.status}`)}
        </span>
        <span className={reviewStatusClassName(followUp.reviewStatus)}>
          {t(`runDetail.followUp.review.statusValues.${followUp.reviewStatus}`)}
        </span>
        <span className="text-xs font-semibold text-bp-muted">
          @{followUp.author} -{" "}
          {formatFollowUpTimestamp(
            followUp.createdAt,
            i18n.language,
            t("runDetail.values.unknown"),
          )}
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
      {latestReview ? (
        <div className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm">
          <p className="font-bold text-bp-graphite">
            {t("runDetail.followUp.review.latest", {
              reviewer: latestReview.reviewer,
              reviewedAt: formatFollowUpTimestamp(
                latestReview.reviewedAt,
                i18n.language,
                t("runDetail.values.unknown"),
              ),
            })}
          </p>
          <p className="mt-1 font-semibold text-bp-muted [overflow-wrap:anywhere]">
            {latestReview.reason}
          </p>
        </div>
      ) : null}
      {followUp.reviewStatus === "AWAITING_REVIEW" &&
      reviewCapability.canReview ? (
        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <label className="block text-sm font-semibold text-bp-graphite">
            {t("runDetail.followUp.review.reason")}
            <textarea
              className="mt-1 min-h-20 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              onChange={(event) => setReason(event.target.value)}
              placeholder={t("runDetail.followUp.review.reasonPlaceholder")}
              value={reason}
            />
          </label>
          {errorMessage ? (
            <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
              {errorMessage}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="inline-flex items-center gap-2 rounded-md bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={!canReview || submitDecision !== null}
              onClick={() => void submitReview("APPROVED")}
              type="button"
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              {submitDecision === "APPROVED"
                ? t("runDetail.followUp.review.saving")
                : t("runDetail.followUp.review.approve")}
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-md border border-orange-300 bg-white px-3 py-2 text-sm font-semibold text-orange-800 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
              disabled={!canReview || submitDecision !== null}
              onClick={() => void submitReview("CHANGES_REQUESTED")}
              type="button"
            >
              {submitDecision === "CHANGES_REQUESTED"
                ? t("runDetail.followUp.review.saving")
                : t("runDetail.followUp.review.requestChanges")}
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-800 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
              disabled={!canReview || submitDecision !== null}
              onClick={() => void submitReview("REJECTED")}
              type="button"
            >
              <XCircle className="h-4 w-4" aria-hidden="true" />
              {submitDecision === "REJECTED"
                ? t("runDetail.followUp.review.saving")
                : t("runDetail.followUp.review.reject")}
            </button>
          </div>
        </div>
      ) : followUp.reviewStatus === "AWAITING_REVIEW" ? (
        <p
          className="mt-3 text-xs font-semibold text-bp-muted"
          title={t(
            `runDetail.followUp.review.unavailableReasons.${reviewCapability.unavailableReason}`,
          )}
        >
          {t(
            `runDetail.followUp.review.unavailableReasons.${reviewCapability.unavailableReason}`,
          )}
        </p>
      ) : null}
    </li>
  );
}

function latestFailureFollowUpReview(
  followUp: FailureFollowUp,
): FailureFollowUpReviewDecision | null {
  return followUp.reviews[followUp.reviews.length - 1] ?? null;
}

function formatFollowUpTimestamp(
  value: string | undefined,
  locale: string,
  fallback: string,
): string {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return fallback;
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

function reviewStatusClassName(status: FailureFollowUp["reviewStatus"]) {
  if (status === "APPROVED") {
    return "rounded-md bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-800";
  }

  if (status === "REJECTED") {
    return "rounded-md bg-red-50 px-2 py-1 text-xs font-bold text-red-800";
  }

  if (status === "CHANGES_REQUESTED") {
    return "rounded-md bg-orange-50 px-2 py-1 text-xs font-bold text-orange-800";
  }

  return "rounded-md bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800";
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
          label={t("runDetail.fields.reason")}
          value={
            run.gateDecision?.reasonCode
              ? t(getGateReasonDisplayKey(run.gateDecision.reasonCode))
              : t("runDetail.values.none")
          }
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

function JobSummaryPanel({
  onLoadLog,
  run,
}: {
  onLoadLog: LoadExecutionRunJobLog;
  run: ExecutionRun;
}) {
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
              <JobLogAction job={job} onLoadLog={onLoadLog} />
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

function JobLogAction({
  job,
  onLoadLog,
}: {
  job: ExecutionRunJobItem;
  onLoadLog: LoadExecutionRunJobLog;
}) {
  const { t } = useTranslation("executionRequests");
  const kind = getJobKind(job);
  const [logState, setLogState] = useState<JobLogState>({ type: "idle" });
  const [searchTerm, setSearchTerm] = useState("");

  async function loadLog() {
    if (logState.type === "loaded") {
      setLogState({ type: "idle" });
      return;
    }

    setLogState({ type: "loading" });

    try {
      setLogState({
        log: await onLoadLog(job.jobId),
        type: "loaded",
      });
    } catch (error) {
      setLogState({
        message: formatExecutionRunDetailError(error, t),
        type: "error",
      });
    }
  }

  if (!job.url) {
    return (
      <div className="text-sm font-semibold text-bp-muted">
        {t("runDetail.jobs.logUnavailable")}
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <button
            className="inline-flex w-fit items-center gap-2 rounded-md bg-bp-control px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={logState.type === "loading"}
            onClick={loadLog}
            type="button"
          >
            {logState.type === "loading" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <GitBranch className="h-4 w-4" aria-hidden="true" />
            )}
            {logState.type === "loaded"
              ? t("runDetail.jobs.hideLog")
              : logState.type === "loading"
                ? t("runDetail.jobs.loadingLog")
                : kind === "gate"
                  ? t("runDetail.jobs.viewGateLog")
                  : t("runDetail.jobs.viewBusinessLog")}
          </button>
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
        </div>
        {logState.type === "error" ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
            {logState.message}
          </p>
        ) : null}
      </div>
      {logState.type === "loaded" ? (
        <div className="lg:col-span-4">
          <JobLogViewer
            job={job}
            log={logState.log}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
          />
        </div>
      ) : null}
    </>
  );
}

function JobLogViewer({
  job,
  log,
  searchTerm,
  setSearchTerm,
}: {
  job: ExecutionRunJobItem;
  log: ExecutionRunJobLog;
  searchTerm: string;
  setSearchTerm: (value: string) => void;
}) {
  const { t } = useTranslation("executionRequests");
  const kind = getJobKind(job);
  const [viewMode, setViewMode] = useState<LogViewMode>(
    kind === "business" ? "focused" : "full",
  );
  const focusedLog =
    kind === "business" ? extractBusinessLogSection(log.content) : null;
  const visibleContent =
    kind === "business" && viewMode === "focused" && focusedLog
      ? focusedLog.content
      : log.content;
  const focusedFallback =
    kind === "business" &&
    viewMode === "focused" &&
    focusedLog?.focused === false;
  const view = buildLogView(visibleContent, searchTerm);

  function downloadLog() {
    const blob = new Blob([log.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = `batchplane-job-${log.jobId}.log`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-slate-950 p-3 text-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold">
            {t("runDetail.jobs.logPreview", { name: job.name })}
          </h3>
          <p className="mt-1 text-xs font-semibold text-slate-300">
            {t("runDetail.jobs.rawLogNotPersisted")}
          </p>
        </div>
        <button
          className="inline-flex w-fit items-center gap-2 rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-100"
          onClick={downloadLog}
          type="button"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          {t("runDetail.jobs.downloadLog")}
        </button>
      </div>
      {kind === "business" ? (
        <div className="mt-3 inline-flex rounded-md border border-slate-700 bg-slate-900 p-1">
          <button
            className={`rounded px-3 py-1.5 text-sm font-semibold ${
              viewMode === "focused"
                ? "bg-slate-100 text-slate-950"
                : "text-slate-200"
            }`}
            onClick={() => setViewMode("focused")}
            type="button"
          >
            {t("runDetail.jobs.batchCommandView")}
          </button>
          <button
            className={`rounded px-3 py-1.5 text-sm font-semibold ${
              viewMode === "full"
                ? "bg-slate-100 text-slate-950"
                : "text-slate-200"
            }`}
            onClick={() => setViewMode("full")}
            type="button"
          >
            {t("runDetail.jobs.fullLogView")}
          </button>
        </div>
      ) : null}
      {focusedFallback ? (
        <p className="mt-3 rounded-md bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-200">
          {t("runDetail.jobs.batchCommandFallback")}
        </p>
      ) : null}
      <label className="mt-3 block text-sm font-semibold text-slate-100">
        {t("runDetail.jobs.searchLog")}
        <input
          className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 font-mono text-sm text-slate-100"
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder={t("runDetail.jobs.searchPlaceholder")}
          value={searchTerm}
        />
      </label>
      {log.truncated ? (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
          {t("runDetail.jobs.logTruncated", {
            size: formatBytes(log.sizeBytes),
          })}
        </p>
      ) : null}
      {view.truncatedByView ? (
        <p className="mt-3 rounded-md bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-200">
          {t("runDetail.jobs.logViewTruncated", {
            count: view.totalMatchedLines,
            limit: maxRenderedLogLines,
          })}
        </p>
      ) : null}
      <pre className="mt-3 max-h-96 overflow-auto rounded-md bg-black p-3 text-xs leading-relaxed text-slate-100">
        {view.text ||
          (searchTerm.trim()
            ? t("runDetail.jobs.searchEmpty")
            : t("runDetail.jobs.logEmpty"))}
      </pre>
    </section>
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

function buildLogView(content: string, searchTerm: string) {
  const query = searchTerm.trim().toLowerCase();
  const lines = content.split(/\r?\n/u);
  const matchedLines = query
    ? lines.filter((line) => line.toLowerCase().includes(query))
    : lines;
  const visibleLines = matchedLines.slice(0, maxRenderedLogLines);

  return {
    text: visibleLines.join("\n"),
    totalMatchedLines: matchedLines.length,
    truncatedByView: matchedLines.length > visibleLines.length,
  };
}

function extractBusinessLogSection(content: string): {
  content: string;
  focused: boolean;
} {
  const lines = content.split(/\r?\n/u);
  const markerSection = extractLogGroup(lines, isBatchPlaneBatchCommandGroup);

  if (markerSection) {
    return {
      content: markerSection,
      focused: true,
    };
  }

  const runBatchSection = extractLogGroup(lines, isRunBatchGroup);

  if (runBatchSection) {
    return {
      content: runBatchSection,
      focused: true,
    };
  }

  const startIndex = lines.findIndex(isLegacyBusinessLogStartLine);

  if (startIndex < 0) {
    return {
      content,
      focused: false,
    };
  }

  const endGroupIndex = lines.findIndex(
    (line, index) => index > startIndex && line.includes("##[endgroup]"),
  );

  if (endGroupIndex >= 0) {
    return {
      content: lines.slice(startIndex, endGroupIndex + 1).join("\n"),
      focused: true,
    };
  }

  const nextGroupIndex = lines.findIndex(
    (line, index) => index > startIndex && line.includes("##[group]"),
  );

  return {
    content: lines
      .slice(startIndex, nextGroupIndex >= 0 ? nextGroupIndex : lines.length)
      .join("\n"),
    focused: true,
  };
}

function extractLogGroup(
  lines: string[],
  isStartLine: (line: string) => boolean,
): string | null {
  const startIndex = lines.findIndex(isStartLine);

  if (startIndex < 0) {
    return null;
  }

  const endIndex = lines.findIndex(
    (line, index) => index > startIndex && line.includes("##[endgroup]"),
  );

  return lines
    .slice(startIndex, endIndex >= 0 ? endIndex + 1 : lines.length)
    .join("\n");
}

function isBatchPlaneBatchCommandGroup(line: string): boolean {
  return line.includes("##[group]BatchPlane batch command");
}

function isRunBatchGroup(line: string): boolean {
  return line.includes("##[group]Run batch");
}

function isLegacyBusinessLogStartLine(line: string): boolean {
  const normalized = line.toLowerCase();

  return (
    normalized.includes("batchplane approved execution") ||
    normalized.includes("running governed batch command")
  );
}

function formatBytes(sizeBytes: number): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
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
