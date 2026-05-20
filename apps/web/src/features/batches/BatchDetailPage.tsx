import type {
  BatchDefinition,
  BatchTrailRuntimePorts,
  RepositoryIssue,
} from "@batchtrail/domain";
import { GitPullRequest, Play, ShieldCheck } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { parseExecutionApprovalRequest } from "../approvals/approval-model";
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
      recentIssues: RepositoryIssue[];
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
  const [state, setState] = useState<BatchDetailState>({ type: "loading" });
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
        const repository = await runtime.settings.getRepository();
        const [batches, issues] = await Promise.all([
          runtime.batches.listBatchDefinitions({
            ref: repository.defaultBranch,
          }),
          runtime.approvals.listExecutionRequestIssues({ state: "all" }),
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
          recentIssues: issues
            .filter((issue) => issueContainsBatch(issue, batch.batchId))
            .sort((left, right) => right.number - left.number)
            .slice(0, 5),
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

  return (
    <section>
      <PageHeader title={t("detail.title")} subtitle={decodedBatchId} />
      <BatchDetailContent state={state} />
    </section>
  );
}

function BatchDetailContent({ state }: { state: BatchDetailState }) {
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

  const canRequestExecution =
    state.batch.status === "ACTIVE" &&
    state.batch.gateRequired &&
    Boolean(state.batch.execution?.command.trim());

  return (
    <div className="space-y-4">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <BatchProfileCard
          batch={state.batch}
          defaultBranch={state.defaultBranch}
        />
        <RequestActionsCard
          batch={state.batch}
          canRequestExecution={canRequestExecution}
        />
      </section>
      <RecentExecutionEvidence issues={state.recentIssues} />
    </div>
  );
}

function BatchProfileCard({
  batch,
  defaultBranch,
}: {
  batch: BatchDefinition;
  defaultBranch: string;
}) {
  const { t } = useTranslation("batches");

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-bt-graphite">{batch.name}</h2>
          <p className="mt-1 font-mono text-sm text-bt-muted">
            {batch.batchId}
          </p>
        </div>
        <span className="rounded-md bg-slate-100 px-3 py-1 text-xs font-bold text-bt-graphite">
          {batch.status}
        </span>
      </div>

      <dl className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <DetailFact label={t("detail.fields.owner")} value={batch.owner} />
        <DetailFact label={t("detail.fields.domain")} value={batch.domain} />
        <DetailFact
          label={t("detail.fields.environment")}
          value={batch.environment}
        />
        <DetailFact
          label={t("detail.fields.criticality")}
          value={batch.criticality}
        />
        <DetailFact
          label={t("detail.fields.defaultBranch")}
          value={defaultBranch}
        />
        <DetailFact
          label={t("detail.fields.labels")}
          value={batch.labels?.join(", ") || t("values.none")}
        />
      </dl>

      <div className="mt-5 grid gap-5 border-t border-slate-100 pt-5 lg:grid-cols-2">
        <section>
          <h3 className="text-sm font-bold text-bt-graphite">
            {t("detail.workflow.title")}
          </h3>
          <dl className="mt-3 space-y-3 text-sm">
            <DetailFact
              label={t("detail.workflow.runtime")}
              value={t("detail.workflow.runtimeGithubActions")}
            />
            <DetailFact
              label={t("detail.workflow.path")}
              value={batch.workflow.path}
            />
            <DetailFact
              label={t("detail.workflow.ref")}
              value={batch.workflow.ref}
            />
            <DetailFact
              label={t("detail.schedules.title")}
              value={t("detail.schedules.empty")}
            />
          </dl>
        </section>

        <section>
          <h3 className="text-sm font-bold text-bt-graphite">
            {t("detail.executionSpec.title")}
          </h3>
          {batch.execution ? (
            <dl className="mt-3 space-y-3 text-sm">
              <DetailFact
                label={t("detail.executionSpec.runsOn")}
                value={formatRunnerLabel(batch.execution.runsOn)}
              />
              <DetailFact
                label={t("detail.executionSpec.artifactPath")}
                value={
                  batch.execution.artifactPath ||
                  t("detail.executionSpec.noArtifact")
                }
              />
              <div>
                <dt className="text-xs font-semibold uppercase text-bt-muted">
                  {t("detail.executionSpec.command")}
                </dt>
                <dd className="mt-1">
                  <pre className="max-h-36 overflow-auto whitespace-pre-wrap rounded-md bg-bt-graphite p-3 text-xs leading-5 text-white">
                    {batch.execution.command ||
                      t("detail.executionSpec.missing")}
                  </pre>
                </dd>
              </div>
            </dl>
          ) : (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
              {t("detail.executionSpec.missing")}
            </p>
          )}
        </section>
      </div>
    </article>
  );
}

function RequestActionsCard({
  batch,
  canRequestExecution,
}: {
  batch: BatchDefinition;
  canRequestExecution: boolean;
}) {
  const { t } = useTranslation("batches");
  const executionRequestPath = `/batches/${encodeURIComponent(
    batch.batchId,
  )}/execution-requests/new`;

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-bt-graphite">
          {t("detail.requests.title")}
        </h2>
        <span>
          <span
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${
              batch.gateRequired
                ? "bg-emerald-50 text-emerald-800"
                : "bg-amber-50 text-amber-900"
            }`}
            title={
              batch.gateRequired
                ? t("detail.gate.required")
                : t("detail.gate.nonCompliant")
            }
          >
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            {batch.gateRequired
              ? t("detail.gate.requiredShort")
              : t("detail.gate.nonCompliantShort")}
          </span>
          <span
            className="ml-2 inline-flex rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-bt-muted"
            title={t("detail.approvalPolicy.default")}
          >
            {t("detail.approvalPolicy.short")}
          </span>
        </span>
      </div>

      <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
        <h3 className="text-sm font-bold text-bt-graphite">
          {t("detail.execution.title")}
        </h3>
        {canRequestExecution ? (
          <Link
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-bt-control px-4 py-2 text-sm font-semibold text-white"
            to={executionRequestPath}
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            {t("actions.requestRun")}
          </Link>
        ) : (
          <button
            className="inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-md bg-slate-300 px-4 py-2 text-sm font-semibold text-white"
            disabled
            title={t("detail.execution.unavailable")}
            type="button"
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            {t("actions.requestRun")}
          </button>
        )}
      </div>

      <div className="mt-5 border-t border-slate-100 pt-5">
        <h3 className="text-sm font-bold text-bt-graphite">
          {t("detail.change.title")}
        </h3>
        <p className="mt-2 text-sm text-bt-muted">
          {t("detail.change.description")}
        </p>
        <Link
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bt-graphite"
          to={`/batches/new?change=${encodeURIComponent(batch.batchId)}`}
        >
          <GitPullRequest className="h-4 w-4" aria-hidden="true" />
          {t("actions.requestChange")}
        </Link>
      </div>
    </article>
  );
}

function RecentExecutionEvidence({ issues }: { issues: RepositoryIssue[] }) {
  const { t } = useTranslation("batches");

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-bt-graphite">
        {t("detail.recentRuns.title")}
      </h2>
      {issues.length === 0 ? (
        <p className="mt-4 text-sm text-bt-muted">
          {t("detail.recentRuns.empty")}
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100">
          {issues.map((issue) => {
            const evidence = getExecutionIssueEvidence(issue);

            return (
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
                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                  <DetailFact
                    label={t("detail.recentRuns.fields.requestId")}
                    value={
                      evidence.requestId || t("detail.recentRuns.unknownValue")
                    }
                  />
                  <DetailFact
                    label={t("detail.recentRuns.fields.requestedBy")}
                    value={
                      evidence.requestedBy ||
                      t("detail.recentRuns.unknownValue")
                    }
                  />
                  <DetailFact
                    label={t("detail.recentRuns.fields.requestedAt")}
                    value={
                      evidence.requestedAt ||
                      t("detail.recentRuns.unknownValue")
                    }
                  />
                  <DetailFact
                    label={t("detail.recentRuns.fields.requestDigest")}
                    value={
                      evidence.requestDigest ||
                      t("detail.recentRuns.unknownValue")
                    }
                  />
                </dl>
              </li>
            );
          })}
        </ul>
      )}
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

function formatRunnerLabel(
  runsOn: NonNullable<BatchDefinition["execution"]>["runsOn"],
) {
  return Array.isArray(runsOn) ? runsOn.join(", ") : runsOn;
}

function getExecutionIssueEvidence(issue: RepositoryIssue) {
  return {
    requestDigest: readMarkdownField(issue.body, "Request digest"),
    requestedAt: readMarkdownField(issue.body, "Requested at"),
    requestedBy: readMarkdownField(issue.body, "Requested by"),
    requestId: readMarkdownField(issue.body, "Request ID"),
  };
}

function readMarkdownField(body: string, label: string): string {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = body.match(new RegExp(`- ${escapedLabel}:\\s*(.+)`));
  const value = match?.[1]?.trim() ?? "";

  return value.replace(/^`|`$/g, "").trim();
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
