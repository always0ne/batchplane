import type {
  BatchDefinition,
  BatchTrailRuntimePorts,
  RepositoryIssue,
} from "@batchtrail/domain";
import {
  AlertTriangle,
  GitBranch,
  GitPullRequest,
  Loader2,
  Play,
  ShieldCheck,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { buildExecutionApprovalHandoff } from "../approvals/approval-handoff";
import { parseExecutionApprovalRequest } from "../approvals/approval-model";
import {
  addHours,
  buildExecutionRequestIssue,
  type ExecutionRequestIssue,
} from "../execution-requests/execution-request-model";
import type { GitHubSession } from "../lite-setup/github-session";
import { PageHeader } from "../../shared/components/PageHeader";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../shared/components/PageState";
import {
  createBatchTrailRuntime,
  readRuntimeSession,
} from "../../runtime/runtime-fixtures";
import { formatRuntimeError } from "../../runtime/runtime-errors";

type BatchDetailState =
  | { type: "loading" }
  | { type: "no-session" }
  | { type: "not-found"; batchId: string }
  | {
      type: "loaded";
      batch: BatchDefinition;
      defaultBranch: string;
      login: string;
      recentIssues: RepositoryIssue[];
      session: GitHubSession;
    }
  | { type: "error"; message: string };

type ExecutionFormState =
  | { type: "idle" }
  | { type: "submitting" }
  | {
      type: "success";
      issue: RepositoryIssue;
      requestIssue: ExecutionRequestIssue;
    }
  | { type: "error"; message: string };

type BatchDetailPageProps = {
  createRuntime?: (session: GitHubSession) => BatchTrailRuntimePorts;
  readSession?: () => GitHubSession | null;
};

export function BatchDetailPage({
  createRuntime = createBatchTrailRuntime,
  readSession = readRuntimeSession,
}: BatchDetailPageProps = {}) {
  const { batchId = "" } = useParams();
  const { t } = useTranslation("batches");
  const navigate = useNavigate();
  const [state, setState] = useState<BatchDetailState>({ type: "loading" });
  const [executionState, setExecutionState] = useState<ExecutionFormState>({
    type: "idle",
  });
  const [reason, setReason] = useState(t("detail.execution.defaultReason"));
  const decodedBatchId = decodeURIComponent(batchId);

  useEffect(() => {
    let ignoreResult = false;

    async function loadBatch() {
      const session = readSession();

      if (!session) {
        setState({ type: "no-session" });
        return;
      }

      setState({ type: "loading" });

      try {
        const runtime = createRuntime(session);
        const [repository, user] = await Promise.all([
          runtime.settings.getRepository(),
          runtime.settings.getCurrentUser(),
        ]);
        const [batches, issues] = await Promise.all([
          runtime.batches.listBatchDefinitions({
            ref: repository.defaultBranch,
          }),
          runtime.approvals.listExecutionRequestIssues(),
        ]);
        const batch = batches.find(
          (candidate) => candidate.batchId === decodedBatchId,
        );

        if (ignoreResult) {
          return;
        }

        if (!batch) {
          setState({ type: "not-found", batchId: decodedBatchId });
          return;
        }

        setState({
          type: "loaded",
          batch,
          defaultBranch: repository.defaultBranch,
          login: user.login,
          recentIssues: issues
            .filter((issue) => issueContainsBatch(issue, batch.batchId))
            .slice(0, 5),
          session,
        });
      } catch (error) {
        if (!ignoreResult) {
          setState({
            type: "error",
            message: formatRuntimeError(error, t("states.detailError")),
          });
        }
      }
    }

    void loadBatch();

    return () => {
      ignoreResult = true;
    };
  }, [createRuntime, decodedBatchId, readSession, t]);

  async function requestExecution(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (state.type !== "loaded") {
      return;
    }

    if (state.batch.status !== "ACTIVE") {
      setExecutionState({
        type: "error",
        message: t("execution.errors.inactive"),
      });
      return;
    }

    setExecutionState({ type: "submitting" });

    try {
      const now = new Date();
      const requestIssue = await buildExecutionRequestIssue({
        batch: state.batch,
        expiresAt: addHours(now, 1),
        reason,
        requestedAt: now,
        requestedBy: state.login,
      });
      const runtime = createRuntime(state.session);
      const issue = await runtime.executions.createExecutionRequest({
        body: requestIssue.body,
        labels: requestIssue.labels,
        title: requestIssue.title,
      });

      setExecutionState({ type: "success", issue, requestIssue });
      navigate("/approvals", {
        state: buildExecutionApprovalHandoff(issue),
      });
    } catch (error) {
      setExecutionState({
        type: "error",
        message: formatRuntimeError(error, t("states.detailError")),
      });
    }
  }

  return (
    <section>
      <PageHeader title={t("detail.title")} subtitle={decodedBatchId} />
      <BatchDetailContent
        onReasonChange={setReason}
        onRequestExecution={(event) => void requestExecution(event)}
        reason={reason}
        state={state}
        executionState={executionState}
      />
    </section>
  );
}

function BatchDetailContent({
  executionState,
  onReasonChange,
  onRequestExecution,
  reason,
  state,
}: {
  executionState: ExecutionFormState;
  onReasonChange: (reason: string) => void;
  onRequestExecution: (event: FormEvent<HTMLFormElement>) => void;
  reason: string;
  state: BatchDetailState;
}) {
  const { t } = useTranslation("batches");

  if (state.type === "loading") {
    return <LoadingState message={t("states.detailLoading")} />;
  }

  if (state.type === "no-session") {
    return (
      <EmptyState
        action={
          <Link
            className="font-semibold text-bt-control underline"
            to="/lite/setup"
          >
            {t("actions.openSetup")}
          </Link>
        }
        message={t("states.noSession")}
      />
    );
  }

  if (state.type === "not-found") {
    return (
      <EmptyState
        action={
          <Link
            className="font-semibold text-bt-control underline"
            to="/batches"
          >
            {t("actions.backToBatches")}
          </Link>
        }
        message={t("states.detailNotFound", { batchId: state.batchId })}
      />
    );
  }

  if (state.type === "error") {
    return <ErrorState message={state.message} />;
  }

  return (
    <div className="space-y-4">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-bt-graphite">
                {state.batch.name}
              </h2>
              <p className="mt-1 font-mono text-sm text-bt-muted">
                {state.batch.batchId}
              </p>
            </div>
            <span className="rounded-md bg-slate-100 px-3 py-1 text-xs font-bold text-bt-graphite">
              {state.batch.status}
            </span>
          </div>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <DetailFact
              label={t("detail.fields.owner")}
              value={state.batch.owner}
            />
            <DetailFact
              label={t("detail.fields.domain")}
              value={state.batch.domain}
            />
            <DetailFact
              label={t("detail.fields.environment")}
              value={state.batch.environment}
            />
            <DetailFact
              label={t("detail.fields.criticality")}
              value={state.batch.criticality}
            />
            <DetailFact
              label={t("detail.fields.defaultBranch")}
              value={state.defaultBranch}
            />
            <DetailFact
              label={t("detail.fields.labels")}
              value={state.batch.labels?.join(", ") || t("values.none")}
            />
          </dl>
        </article>

        <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-bt-graphite">
            {t("detail.execution.title")}
          </h2>
          <form className="mt-4 space-y-4" onSubmit={onRequestExecution}>
            <label className="block text-sm font-semibold text-bt-graphite">
              {t("detail.execution.reason")}
              <textarea
                className="mt-2 min-h-24 w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm font-normal text-bt-graphite outline-none focus:border-bt-git focus:ring-2 focus:ring-bt-git/20"
                onChange={(event) => onReasonChange(event.target.value)}
                value={reason}
              />
            </label>
            <button
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-bt-control px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={
                executionState.type === "submitting" ||
                state.batch.status !== "ACTIVE"
              }
              type="submit"
            >
              {executionState.type === "submitting" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Play className="h-4 w-4" aria-hidden="true" />
              )}
              {t("actions.requestRun")}
            </button>
            <ExecutionFormMessage state={executionState} />
          </form>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <InfoCard
          icon={<GitBranch className="h-5 w-5" aria-hidden="true" />}
          title={t("detail.workflow.title")}
        >
          <dl className="space-y-3 text-sm">
            <DetailFact
              label={t("detail.workflow.path")}
              value={state.batch.workflow.path}
            />
            <DetailFact
              label={t("detail.workflow.ref")}
              value={state.batch.workflow.ref}
            />
          </dl>
        </InfoCard>

        <InfoCard
          icon={<ShieldCheck className="h-5 w-5" aria-hidden="true" />}
          title={t("detail.gate.title")}
        >
          <p className="text-sm font-semibold text-bt-graphite">
            {state.batch.gateRequired
              ? t("detail.gate.required")
              : t("detail.gate.off")}
          </p>
          <p className="mt-3 text-sm text-bt-muted">
            {t("detail.approvalPolicy.default")}
          </p>
        </InfoCard>

        <InfoCard
          icon={<GitPullRequest className="h-5 w-5" aria-hidden="true" />}
          title={t("detail.change.title")}
        >
          <p className="text-sm text-bt-muted">
            {t("detail.change.placeholder")}
          </p>
          <Link
            className="mt-4 inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bt-graphite"
            to={`/batches/new?change=${encodeURIComponent(state.batch.batchId)}`}
          >
            {t("actions.requestChange")}
          </Link>
        </InfoCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <InfoCard
          icon={<AlertTriangle className="h-5 w-5" aria-hidden="true" />}
          title={t("detail.schedules.title")}
        >
          <p className="text-sm text-bt-muted">{t("detail.schedules.empty")}</p>
        </InfoCard>

        <InfoCard
          icon={<Play className="h-5 w-5" aria-hidden="true" />}
          title={t("detail.recentRuns.title")}
        >
          {state.recentIssues.length === 0 ? (
            <p className="text-sm text-bt-muted">
              {t("detail.recentRuns.empty")}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {state.recentIssues.map((issue) => (
                <li className="py-3 first:pt-0 last:pb-0" key={issue.number}>
                  <a
                    className="text-sm font-semibold text-bt-graphite hover:text-bt-control"
                    href={issue.url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    #{issue.number} {issue.title}
                  </a>
                  <p className="mt-1 text-xs font-semibold text-bt-muted">
                    {getExecutionIssueStatusLabel(issue, t)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </InfoCard>
      </section>
    </div>
  );
}

function ExecutionFormMessage({ state }: { state: ExecutionFormState }) {
  const { t } = useTranslation("batches");

  if (state.type === "success") {
    return (
      <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
        {t("execution.result.created", {
          requestId: state.requestIssue.request.requestId,
        })}
      </p>
    );
  }

  if (state.type === "error") {
    return (
      <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
        {state.message}
      </p>
    );
  }

  return null;
}

function InfoCard({
  children,
  icon,
  title,
}: {
  children: ReactNode;
  icon: ReactNode;
  title: string;
}) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-bt-graphite">{title}</h2>
        <span className="text-bt-git">{icon}</span>
      </div>
      <div className="mt-4">{children}</div>
    </article>
  );
}

function DetailFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-bt-muted">{label}</dt>
      <dd className="mt-1 break-words text-sm font-bold text-bt-graphite">
        {value}
      </dd>
    </div>
  );
}

function issueContainsBatch(issue: RepositoryIssue, batchId: string): boolean {
  return (
    issue.title.includes(batchId) || issue.body.includes(`batchId=${batchId}`)
  );
}

function getExecutionIssueStatusLabel(
  issue: RepositoryIssue,
  t: (key: string) => string,
): string {
  if (issue.labels.includes("batchtrail:gate-blocked")) {
    return t("detail.recentRuns.status.gateBlocked");
  }

  if (issue.labels.includes("batchtrail:dispatch-failed")) {
    return t("detail.recentRuns.status.dispatchFailed");
  }

  if (issue.labels.includes("batchtrail:dispatching")) {
    return t("detail.recentRuns.status.dispatching");
  }

  if (issue.labels.includes("batchtrail:dispatched")) {
    return t("detail.recentRuns.status.dispatched");
  }

  if (issue.labels.includes("batchtrail:rejected")) {
    return t("detail.recentRuns.status.rejected");
  }

  if (parseExecutionApprovalRequest(issue)) {
    return t("detail.recentRuns.status.requested");
  }

  return t("detail.recentRuns.status.unknown");
}
