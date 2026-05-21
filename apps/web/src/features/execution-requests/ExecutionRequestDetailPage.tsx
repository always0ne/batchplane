import type { BatchPlaneRuntimePorts, ExecutionRun } from "@batchplane/domain";
import {
  CheckCircle2,
  ExternalLink,
  FileText,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import {
  buildExecutionApprovalComment,
  buildExecutionRejectionComment,
  parseExecutionRequestDetail,
  type ExecutionApprovalRequest,
  type ExecutionRequestDisplayStatus,
} from "../approvals/approval-model";
import { ExecutionApprovalActions } from "../approvals/ExecutionApprovalActions";
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

type ExecutionRequestDetailPageProps = {
  createRuntime?: (session: GitHubSession) => BatchPlaneRuntimePorts;
  readSession?: () => GitHubSession | null;
};

type PageState =
  | { type: "loading" }
  | { type: "no-session" }
  | { type: "not-found"; issueNumber: number }
  | {
      type: "loaded";
      login: string;
      repository: string;
      request: ExecutionApprovalRequest;
      runs: ExecutionRun[];
      session: GitHubSession;
    }
  | { type: "error"; message: string };

type ActionState =
  | { type: "idle" }
  | { type: "running"; action: "approve" | "reject" }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

export function ExecutionRequestDetailPage({
  createRuntime = createBatchPlaneRuntime,
  readSession = readRuntimeSession,
}: ExecutionRequestDetailPageProps = {}) {
  const { issueNumber = "" } = useParams();
  const parsedIssueNumber = Number(issueNumber);
  const { t } = useTranslation("executionRequests");
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<PageState>({ type: "loading" });
  const [actionState, setActionState] = useState<ActionState>({
    type: "idle",
  });

  useEffect(() => {
    let ignoreResult = false;

    async function loadRequest() {
      const session = readSession();

      if (!session) {
        setState({ type: "no-session" });
        return;
      }

      if (!Number.isInteger(parsedIssueNumber) || parsedIssueNumber <= 0) {
        setState({ type: "not-found", issueNumber: 0 });
        return;
      }

      setState({ type: "loading" });

      try {
        const runtime = createRuntime(session);
        const [user, repository, issues] = await Promise.all([
          runtime.settings.getCurrentUser(),
          runtime.settings.getRepository(),
          runtime.approvals.listExecutionRequestIssues({ state: "all" }),
        ]);
        const issue = issues.find(
          (candidate) => candidate.number === parsedIssueNumber,
        );

        if (!issue) {
          setState({
            type: "not-found",
            issueNumber: parsedIssueNumber,
          });
          return;
        }

        const comments = await runtime.approvals.listExecutionRequestComments({
          issueNumber: issue.number,
        });
        const request = parseExecutionRequestDetail(issue, comments);

        if (ignoreResult) {
          return;
        }

        if (!request) {
          setState({
            type: "not-found",
            issueNumber: parsedIssueNumber,
          });
          return;
        }

        const runs = await loadRelatedRuns(runtime, request);

        setState({
          type: "loaded",
          login: user.login,
          repository: `${repository.owner}/${repository.repo}`,
          request,
          runs,
          session,
        });
      } catch (error) {
        if (!ignoreResult) {
          setState({
            type: "error",
            message: formatRuntimeError(error, t("detail.states.error")),
          });
        }
      }
    }

    void loadRequest();

    return () => {
      ignoreResult = true;
    };
  }, [createRuntime, parsedIssueNumber, readSession, reloadToken, t]);

  async function approveExecution(request: ExecutionApprovalRequest) {
    if (state.type !== "loaded" || request.requestedBy === state.login) {
      return;
    }

    setActionState({ type: "running", action: "approve" });

    try {
      const runtime = createRuntime(state.session);

      await runtime.approvals.approveExecution({
        body: buildExecutionApprovalComment({
          approvedAt: new Date(),
          approver: state.login,
          request,
        }),
        issueNumber: request.issue.number,
      });

      setActionState({
        type: "success",
        message: t("detail.result.approved", {
          requestId: request.requestId,
        }),
      });
      setReloadToken((current) => current + 1);
    } catch (error) {
      setActionState({
        type: "error",
        message: formatRuntimeError(error, t("detail.result.failed")),
      });
    }
  }

  async function rejectExecution(
    request: ExecutionApprovalRequest,
    reason: string,
  ) {
    if (state.type !== "loaded") {
      return;
    }

    setActionState({ type: "running", action: "reject" });

    try {
      const runtime = createRuntime(state.session);

      await runtime.approvals.rejectExecution({
        body: buildExecutionRejectionComment({
          rejectedAt: new Date(),
          rejector: state.login,
          reason,
          request,
        }),
        issueNumber: request.issue.number,
      });

      setActionState({
        type: "success",
        message: t("detail.result.rejected", {
          requestId: request.requestId,
        }),
      });
      setReloadToken((current) => current + 1);
    } catch (error) {
      setActionState({
        type: "error",
        message: formatRuntimeError(error, t("detail.result.failed")),
      });
    }
  }

  if (state.type === "loading") {
    return <LoadingState message={t("detail.states.loading")} />;
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
        message={t("detail.states.noSession")}
      />
    );
  }

  if (state.type === "not-found") {
    return (
      <EmptyState
        action={
          <Link
            className="font-semibold text-bp-control underline"
            to="/approvals"
          >
            {t("detail.actions.backToApprovals")}
          </Link>
        }
        message={t("detail.states.notFound", {
          issueNumber: state.issueNumber,
        })}
      />
    );
  }

  if (state.type === "error") {
    return <ErrorState message={state.message} />;
  }

  const { request } = state;
  const isActionable = request.status === "REQUESTED";
  const selfApprovalBlocked =
    request.requestedBy === state.login
      ? t("detail.values.selfApprovalBlocked")
      : "";
  const isBusy = actionState.type === "running";

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title={t("detail.title")}
          subtitle={t("detail.subtitle", { requestId: request.requestId })}
        />
        <div className="flex flex-wrap gap-2">
          <Link
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bp-graphite"
            to="/approvals"
          >
            {t("detail.actions.backToApprovals")}
          </Link>
          <a
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bp-graphite"
            href={request.issue.url}
            rel="noreferrer"
            target="_blank"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            {t("detail.actions.openIssue")}
          </a>
          <button
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bp-graphite"
            disabled={isBusy}
            onClick={() => setReloadToken((current) => current + 1)}
            type="button"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {t("detail.actions.refresh")}
          </button>
        </div>
      </div>

      <DetailActionBanner state={actionState} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_28rem]">
        <div className="space-y-4">
          <SummaryPanel repository={state.repository} request={request} />
          <DecisionMaterial request={request} />
          <CanonicalPayloadPanel request={request} />
        </div>

        <aside className="space-y-4">
          <GovernancePanel request={request} />
          <DispatcherPanel request={request} runs={state.runs} />

          {isActionable ? (
            <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-bold text-bp-graphite">
                {t("detail.actions.title")}
              </h2>
              <p className="mt-2 text-sm text-bp-muted">
                {t("detail.actions.note")}
              </p>
              <ExecutionApprovalActions
                approveDisabledReason={selfApprovalBlocked}
                approveLabel={t("detail.actions.approve")}
                disabled={isBusy}
                isApproving={
                  actionState.type === "running" &&
                  actionState.action === "approve"
                }
                isRejecting={
                  actionState.type === "running" &&
                  actionState.action === "reject"
                }
                onApprove={() => void approveExecution(request)}
                onReject={(reason) => void rejectExecution(request, reason)}
                rejectLabel={t("detail.actions.reject")}
              />
            </article>
          ) : (
            <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-bold text-bp-graphite">
                {t("detail.actions.closedTitle")}
              </h2>
              <p className="mt-2 text-sm font-semibold text-bp-muted">
                {t(`detail.statusHelp.${request.status}`)}
              </p>
            </article>
          )}
        </aside>
      </div>
    </section>
  );
}

function SummaryPanel({
  repository,
  request,
}: {
  repository: string;
  request: ExecutionApprovalRequest;
}) {
  const { t } = useTranslation("executionRequests");

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-bp-git" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-bp-graphite">
            #{request.issue.number} {request.issue.title}
          </h2>
        </div>
        <StatusBadge status={request.status} />
      </div>
      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <DetailFact label={t("detail.fields.repository")} value={repository} />
        <DetailFact
          label={t("detail.fields.batchId")}
          value={request.batchId}
        />
        <DetailFact
          label={t("detail.fields.requestedBy")}
          value={request.requestedBy ? `@${request.requestedBy}` : "-"}
        />
        <DetailFact
          label={t("detail.fields.requestedAt")}
          value={request.requestedAt || "-"}
        />
        <DetailFact
          label={t("detail.fields.expiresAt")}
          value={request.expiresAt || "-"}
        />
        <DetailFact
          label={t("detail.fields.issueState")}
          value={request.issue.state}
        />
        <DetailFact
          label={t("detail.fields.workflow")}
          value={
            request.workflow
              ? `${request.workflow.path}@${request.workflow.ref}`
              : "-"
          }
        />
        <DetailFact
          label={t("detail.fields.requestDigest")}
          value={request.requestDigest}
        />
      </dl>
    </article>
  );
}

function DecisionMaterial({ request }: { request: ExecutionApprovalRequest }) {
  const { t } = useTranslation("executionRequests");

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-bp-graphite">
        {t("detail.material.title")}
      </h2>
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-4">
          <TextBlock
            label={t("detail.fields.reason")}
            value={request.reason || "-"}
          />
          <div>
            <p className="text-xs font-semibold uppercase text-bp-muted">
              {t("detail.fields.command")}
            </p>
            <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap rounded-md bg-bp-graphite p-3 text-xs leading-5 text-white">
              {request.execution?.command || "-"}
            </pre>
          </div>
        </div>
        <dl className="grid gap-3 text-sm">
          <DetailFact
            label={t("detail.fields.environment")}
            value={request.canonicalPayload?.spec?.batch?.environment ?? "-"}
          />
          <DetailFact
            label={t("detail.fields.runsOn")}
            value={
              request.execution?.runsOn
                ? formatRunnerLabel(request.execution.runsOn)
                : "-"
            }
          />
          <DetailFact
            label={t("detail.fields.artifact")}
            value={request.execution?.artifactPath ?? "-"}
          />
        </dl>
      </div>
    </article>
  );
}

function GovernancePanel({ request }: { request: ExecutionApprovalRequest }) {
  const { t } = useTranslation("executionRequests");
  const gateRequired = request.execution?.gateRequired !== false;

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-bp-graphite">
        {t("detail.governance.title")}
      </h2>
      <ul className="mt-4 space-y-2 text-sm">
        <CheckRow
          ok={gateRequired}
          text={
            gateRequired
              ? t("detail.governance.gateRequired")
              : t("detail.governance.gateMissing")
          }
        />
        <CheckRow
          ok={Boolean(request.requestDigest)}
          text={t("detail.governance.digest")}
        />
        <CheckRow
          ok={request.requestedBy !== ""}
          text={t("detail.governance.requester")}
        />
      </ul>
    </article>
  );
}

async function loadRelatedRuns(
  runtime: BatchPlaneRuntimePorts,
  request: ExecutionApprovalRequest,
): Promise<ExecutionRun[]> {
  try {
    return await runtime.executions.listExecutionRuns({
      batchId: request.batchId,
      limit: 10,
      requestId: request.requestId,
      workflowPath: request.workflow?.path,
    });
  } catch {
    return [];
  }
}

function DispatcherPanel({
  request,
  runs,
}: {
  request: ExecutionApprovalRequest;
  runs: ExecutionRun[];
}) {
  const { t } = useTranslation("executionRequests");
  const latestRun = runs[0];

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-bp-graphite">
        {t("detail.dispatcher.title")}
      </h2>
      <p className="mt-2 text-sm text-bp-muted">
        {t("detail.dispatcher.noBrowserDispatch")}
      </p>
      <dl className="mt-4 grid gap-3 text-sm">
        <DetailFact
          label={t("detail.dispatcher.status")}
          value={t(`detail.status.${request.status}`)}
        />
        <DetailFact
          label={t("detail.dispatcher.dispatcherEvidence")}
          value={
            request.dispatcherStatus
              ? `${request.dispatcherStatus.status} @ ${request.dispatcherStatus.createdAt}`
              : t("detail.dispatcher.none")
          }
        />
        <DetailFact
          label={t("detail.dispatcher.approvalEvidence")}
          value={
            request.approvalDecision
              ? `${request.approvalDecision.decision} by @${request.approvalDecision.actor}`
              : t("detail.dispatcher.none")
          }
        />
        {request.gateDecision ? (
          <DetailFact
            label={t("detail.dispatcher.gateEvidence")}
            value={`${request.gateDecision.allowed ? "ALLOWED" : "BLOCKED"} ${request.gateDecision.reasonCode}`}
          />
        ) : null}
        <div className="rounded-md bg-slate-50 px-3 py-2">
          <dt className="text-xs font-semibold uppercase tracking-normal text-bp-muted">
            {t("detail.dispatcher.workflowRun")}
          </dt>
          <dd className="mt-1 text-xs font-semibold text-bp-graphite">
            {latestRun ? (
              <Link
                className="font-mono text-bp-control underline"
                to={`/execution-runs/${latestRun.runId}`}
              >
                #{latestRun.runId} {t(`runDetail.status.${latestRun.status}`)}
              </Link>
            ) : (
              t("detail.dispatcher.noWorkflowRun")
            )}
          </dd>
        </div>
      </dl>
      <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-xs font-semibold text-bp-muted">
        {t(`detail.statusHelp.${request.status}`)}
      </p>
    </article>
  );
}

function CanonicalPayloadPanel({
  request,
}: {
  request: ExecutionApprovalRequest;
}) {
  const { t } = useTranslation("executionRequests");

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-bp-graphite">
        {t("detail.payload.title")}
      </h2>
      <pre className="mt-4 max-h-96 overflow-auto rounded-md bg-bp-graphite p-4 text-xs leading-6 text-white">
        <code>
          {request.canonicalPayload
            ? JSON.stringify(request.canonicalPayload, null, 2)
            : request.issue.body}
        </code>
      </pre>
    </article>
  );
}

function DetailFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 px-3 py-2">
      <dt className="text-xs font-semibold uppercase tracking-normal text-bp-muted">
        {label}
      </dt>
      <dd className="mt-1 break-all font-mono text-xs font-semibold text-bp-graphite">
        {value}
      </dd>
    </div>
  );
}

function TextBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-bp-muted">{label}</p>
      <p className="mt-1 text-sm font-medium text-bp-graphite">{value}</p>
    </div>
  );
}

function CheckRow({ ok, text }: { ok: boolean; text: string }) {
  const Icon = ok ? CheckCircle2 : XCircle;

  return (
    <li
      className={`flex items-start gap-2 ${ok ? "text-bp-graphite" : "text-red-800"}`}
    >
      <Icon
        className={`mt-0.5 h-4 w-4 shrink-0 ${ok ? "text-emerald-700" : "text-red-700"}`}
        aria-hidden="true"
      />
      <span className="font-semibold">{text}</span>
    </li>
  );
}

function StatusBadge({ status }: { status: ExecutionRequestDisplayStatus }) {
  const { t } = useTranslation("executionRequests");
  const palette = getStatusPalette(status);

  return (
    <span
      className={`rounded-md px-2 py-1 text-xs font-bold ${palette}`}
      title={t(`detail.statusHelp.${status}`)}
    >
      {t(`detail.status.${status}`)}
    </span>
  );
}

function DetailActionBanner({ state }: { state: ActionState }) {
  if (state.type === "success") {
    return (
      <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
        {state.message}
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

function formatRunnerLabel(
  runsOn: NonNullable<ExecutionApprovalRequest["execution"]>["runsOn"],
) {
  return Array.isArray(runsOn) ? runsOn.join(", ") : runsOn;
}

function getStatusPalette(status: ExecutionRequestDisplayStatus): string {
  switch (status) {
    case "REQUESTED":
      return "bg-amber-50 text-amber-800";
    case "APPROVED":
    case "DISPATCHING":
      return "bg-sky-50 text-sky-800";
    case "DISPATCHED":
      return "bg-emerald-50 text-emerald-800";
    case "REJECTED":
    case "DISPATCH_FAILED":
    case "GATE_BLOCKED":
      return "bg-red-50 text-red-800";
  }
}
