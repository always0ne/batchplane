import type { BatchDefinition, RepositoryIssue } from "@batchtrail/domain";
import { ExternalLink, Loader2, Play, Plus, RefreshCw } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

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
import type { GitHubSession } from "../lite-setup/github-session";
import {
  addHours,
  buildExecutionRequestIssue,
  type ExecutionRequestIssue,
} from "../execution-requests/execution-request-model";
import { buildExecutionApprovalHandoff } from "../approvals/approval-handoff";
import { getExecutionRequestBlockReason } from "./batch-list-readiness";

type BatchListState =
  | { type: "loading" }
  | { type: "no-session" }
  | {
      type: "loaded";
      batches: BatchDefinition[];
      defaultBranch: string;
      login: string;
      session: GitHubSession;
    }
  | { type: "error"; message: string };

type ExecutionRequestState =
  | { type: "idle" }
  | { type: "running"; batchId: string }
  | {
      type: "success";
      issue: RepositoryIssue;
      requestIssue: ExecutionRequestIssue;
    }
  | { type: "error"; message: string };

export function BatchesPage() {
  const { t } = useTranslation("batches");
  const navigate = useNavigate();
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<BatchListState>({ type: "loading" });
  const [executionRequestState, setExecutionRequestState] =
    useState<ExecutionRequestState>({ type: "idle" });

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
        const runtime = createBatchTrailRuntime(session);
        const [repository, user] = await Promise.all([
          runtime.settings.getRepository(),
          runtime.settings.getCurrentUser(),
        ]);
        const batches = await runtime.batches.listBatchDefinitions({
          ref: repository.defaultBranch,
        });

        if (!ignoreResult) {
          setState({
            type: "loaded",
            batches,
            defaultBranch: repository.defaultBranch,
            login: user.login,
            session,
          });
        }
      } catch (error) {
        if (!ignoreResult) {
          setState({ type: "error", message: formatBatchListError(error) });
        }
      }
    }

    void loadBatches();

    return () => {
      ignoreResult = true;
    };
  }, [reloadToken]);

  async function requestExecution(batch: BatchDefinition) {
    if (state.type !== "loaded") {
      return;
    }

    if (batch.status !== "ACTIVE") {
      setExecutionRequestState({
        type: "error",
        message: t("execution.errors.inactive"),
      });
      return;
    }

    if (!batch.gateRequired) {
      setExecutionRequestState({
        type: "error",
        message: t("execution.errors.gateRequired"),
      });
      return;
    }

    if (!batch.execution?.command.trim()) {
      setExecutionRequestState({
        type: "error",
        message: t("execution.errors.missingCommand"),
      });
      return;
    }

    setExecutionRequestState({ type: "running", batchId: batch.batchId });

    try {
      const now = new Date();
      const requestIssue = await buildExecutionRequestIssue({
        batch,
        expiresAt: addHours(now, 1),
        requestedAt: now,
        requestedBy: state.login,
      });
      const runtime = createBatchTrailRuntime(state.session);
      const issue = await runtime.executions.createExecutionRequest({
        body: requestIssue.body,
        labels: requestIssue.labels,
        title: requestIssue.title,
      });

      setExecutionRequestState({
        type: "success",
        issue,
        requestIssue,
      });
      navigate("/approvals", {
        state: buildExecutionApprovalHandoff(issue),
      });
    } catch (error) {
      setExecutionRequestState({
        type: "error",
        message: formatBatchListError(error),
      });
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title={t("title")} subtitle={t("subtitle")} />
        <div className="flex flex-wrap gap-3">
          <button
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-bt-graphite disabled:cursor-not-allowed disabled:text-slate-400"
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
            className="inline-flex items-center gap-2 rounded-md bg-bt-control px-4 py-2 text-sm font-semibold text-white"
            to="/batches/new"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("actions.register")}
          </Link>
        </div>
      </div>
      <ExecutionRequestBanner state={executionRequestState} />
      <BatchListContent
        executionRequestState={executionRequestState}
        onRequestExecution={(batch) => void requestExecution(batch)}
        state={state}
      />
    </section>
  );
}

function BatchListContent({
  executionRequestState,
  onRequestExecution,
  state,
}: {
  executionRequestState: ExecutionRequestState;
  onRequestExecution: (batch: BatchDefinition) => void;
  state: BatchListState;
}) {
  const { t } = useTranslation("batches");

  if (state.type === "loading") {
    return <LoadingState message={t("states.loading")} />;
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
        <thead className="bg-slate-50 text-sm text-bt-muted">
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
            const isRunning =
              executionRequestState.type === "running" &&
              executionRequestState.batchId === batch.batchId;
            const blockReason = getExecutionRequestBlockReason({
              batch,
              isRequestInProgress:
                executionRequestState.type === "running" && !isRunning,
              t,
            });
            const isDisabled = isRunning || blockReason !== null;

            return (
              <tr key={batch.batchId}>
                <td className="px-4 py-4 font-mono text-sm text-bt-graphite">
                  <Link
                    className="font-semibold text-bt-control underline"
                    to={`/batches/${encodeURIComponent(batch.batchId)}`}
                  >
                    {batch.batchId}
                  </Link>
                </td>
                <td className="px-4 py-4 text-sm font-semibold text-bt-graphite">
                  {batch.name}
                </td>
                <td className="px-4 py-4 text-sm text-bt-graphite">
                  {batch.owner}
                </td>
                <td className="px-4 py-4 text-sm text-bt-graphite">
                  {batch.environment}
                </td>
                <td className="px-4 py-4 text-sm text-bt-graphite">
                  {batch.criticality}
                </td>
                <td className="px-4 py-4 text-sm text-bt-graphite">
                  {batch.status}
                </td>
                <td className="px-4 py-4 text-sm text-bt-graphite">
                  {batch.gateRequired
                    ? t("values.required")
                    : t("values.gateMissing")}
                </td>
                <td className="px-4 py-4 text-sm text-bt-graphite">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bt-graphite"
                      to={`/batches/${encodeURIComponent(batch.batchId)}`}
                    >
                      {t("actions.viewDetails")}
                    </Link>
                    <button
                      className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bt-graphite disabled:cursor-not-allowed disabled:text-slate-400"
                      disabled={isDisabled}
                      onClick={() => onRequestExecution(batch)}
                      title={blockReason ?? t("actions.requestRun")}
                      type="button"
                    >
                      {isRunning ? (
                        <Loader2
                          className="h-4 w-4 animate-spin"
                          aria-hidden="true"
                        />
                      ) : (
                        <Play className="h-4 w-4" aria-hidden="true" />
                      )}
                      {t("actions.requestRun")}
                    </button>
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

function ExecutionRequestBanner({ state }: { state: ExecutionRequestState }) {
  const { t } = useTranslation("batches");

  if (state.type === "success") {
    return (
      <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        <p className="font-semibold">
          {t("execution.result.created", {
            requestId: state.requestIssue.request.requestId,
          })}
        </p>
        <a
          className="mt-2 inline-flex items-center gap-2 font-semibold underline"
          href={state.issue.url}
          rel="noreferrer"
          target="_blank"
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          <span>
            #{state.issue.number} {state.issue.title}
          </span>
        </a>
      </div>
    );
  }

  if (state.type === "error") {
    return (
      <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
        {state.message}
      </div>
    );
  }

  return null;
}

function formatBatchListError(error: unknown): string {
  return formatRuntimeError(error, "Failed to load batch definitions.");
}
