import type {
  ExecutionAttempt,
  ExecutionRequest,
  ExecutionRequestCapability,
} from "@batchplane/ui-client";
import {
  Activity,
  CheckCircle2,
  ExternalLink,
  FileText,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { useMemo } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { ExecutionApprovalActions } from "../../features/execution-approval/ExecutionApprovalActions";
import { formatGateReasonDisplay } from "../../i18n/display-keys";
import { PageHeader } from "../../ui/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "../../ui/PageState";
import { useExecutionRequestDetail } from "./useExecutionRequestDetail";

export function ExecutionRequestDetailPage() {
  const { requestLocator = "" } = useParams();
  const location = useLocation();
  const { t } = useTranslation("executionRequests");
  const initialRequest = useMemo(
    () => initialRequestFrom(location.state, requestLocator),
    [location.state, requestLocator],
  );
  const detail = useExecutionRequestDetail({
    initialRequest,
    requestLocator,
  });

  if (detail.state.type === "loading") {
    return <LoadingState message={t("detail.states.loading")} />;
  }
  if (detail.state.type === "workspace-not-connected") {
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
  if (detail.state.type === "not-found") {
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
        message={t("detail.states.notFound", { requestLocator })}
      />
    );
  }
  if (detail.state.type === "error") {
    return (
      <ErrorState message={detail.state.message || t("detail.states.error")} />
    );
  }

  const request = detail.state.request;
  const postCreateError = postCreateErrorFrom(location.state, request);
  const attempt = latestAttempt(request);
  const isBusy = Boolean(detail.runningAction);
  const canAct = request.capability.canApprove || request.capability.canReject;

  return (
    <section className="min-w-0">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-4">
        <PageHeader
          title={t("detail.title")}
          subtitle={t("detail.subtitle", { requestId: request.requestId })}
        />
        <div className="flex min-w-0 flex-wrap gap-2">
          <Link
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bp-graphite"
            to="/approvals"
          >
            {t("detail.actions.backToApprovals")}
          </Link>
          {attempt ? (
            <Link
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bp-graphite"
              to={`/execution-runs/${encodeURIComponent(attempt.attemptLocator)}`}
            >
              <Activity className="h-4 w-4" aria-hidden="true" />
              {t("detail.actions.openRunDetail")}
            </Link>
          ) : null}
          {request.sourceUrl ? (
            <a
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bp-graphite"
              href={request.sourceUrl}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              {t("detail.actions.openSourceRequest")}
            </a>
          ) : null}
          <button
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bp-graphite"
            disabled={isBusy}
            onClick={detail.refresh}
            type="button"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {t("detail.actions.refresh")}
          </button>
        </div>
      </div>

      {detail.completedAction ? (
        <p
          className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800"
          role="status"
        >
          {t(
            `detail.result.${detail.completedAction === "approve" ? "approved" : "rejected"}`,
            { requestId: request.requestId },
          )}
        </p>
      ) : null}
      {detail.actionError ? (
        <p
          className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800"
          role="alert"
        >
          {detail.actionError.message || t("detail.result.failed")}
        </p>
      ) : null}
      {postCreateError ? (
        <p
          className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900"
          role="alert"
        >
          {t("states.autoApprovalEvidenceMissing")}
        </p>
      ) : null}
      {detail.state.readState === "pending" ? (
        <p className="mt-4 text-sm font-medium text-amber-800" role="status">
          {t("detail.states.pending")}
        </p>
      ) : null}
      {detail.state.readState === "unavailable" ? (
        <p className="mt-4 text-sm font-medium text-red-800" role="alert">
          {t("detail.states.unavailable")}
        </p>
      ) : null}

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_28rem]">
        <div className="min-w-0 space-y-4">
          <RequestSummary request={request} />
          <DecisionMaterial request={request} />
          <CanonicalPayload request={request} />
        </div>
        <aside className="min-w-0 space-y-4">
          <GovernanceChecks request={request} />
          <DispatcherEvidence attempt={attempt} request={request} />
          {canAct ? (
            <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-bold text-bp-graphite">
                {t("detail.actions.title")}
              </h2>
              <p className="mt-2 text-sm text-bp-muted">
                {t("detail.actions.note")}
              </p>
              {request.approvalNotice?.kind === "SELF_APPROVAL_ALLOWED" ? (
                <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
                  {t("detail.values.selfApprovalAllowed", {
                    mode: request.approvalNotice.mode,
                  })}
                </p>
              ) : null}
              <ExecutionApprovalActions
                approveDisabled={!request.capability.canApprove}
                approveDisabledReason={approvalUnavailableReason(
                  request.capability,
                  t,
                )}
                approveLabel={t("detail.actions.approve")}
                disabled={isBusy}
                isApproving={detail.runningAction === "approve"}
                isRejecting={detail.runningAction === "reject"}
                onApprove={() => void detail.applyAction("approve")}
                onReject={(reason) => void detail.applyAction("reject", reason)}
                rejectDisabled={!request.capability.canReject}
                rejectLabel={t("detail.actions.reject")}
              />
            </article>
          ) : (
            <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
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

function initialRequestFrom(
  state: unknown,
  requestLocator: string,
): ExecutionRequest | null {
  if (!state || typeof state !== "object") return null;
  const request = (state as { createdExecutionRequest?: unknown })
    .createdExecutionRequest;
  if (!request || typeof request !== "object") return null;
  const candidate = request as Partial<ExecutionRequest>;
  return candidate.requestLocator === requestLocator &&
    typeof candidate.requestId === "string" &&
    typeof candidate.evidence?.requestDigest === "string"
    ? (candidate as ExecutionRequest)
    : null;
}

function postCreateErrorFrom(
  state: unknown,
  request: ExecutionRequest,
): boolean {
  if (!state || typeof state !== "object") return false;
  const error = (state as { executionRequestPostCreateError?: unknown })
    .executionRequestPostCreateError;
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    code?: unknown;
    requestDigest?: unknown;
    requestId?: unknown;
    requestLocator?: unknown;
  };
  return (
    candidate.code === "AUTO_APPROVAL_RECORDING_FAILED" &&
    candidate.requestDigest === request.evidence.requestDigest &&
    candidate.requestId === request.requestId &&
    candidate.requestLocator === request.requestLocator
  );
}

function latestAttempt(request: ExecutionRequest): ExecutionAttempt | null {
  return request.attempts.type === "loaded"
    ? (request.attempts.attempts[0] ?? null)
    : null;
}

function RequestSummary({ request }: { request: ExecutionRequest }) {
  const { t } = useTranslation("executionRequests");
  return (
    <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex items-center gap-2">
          <FileText
            className="h-5 w-5 shrink-0 text-bp-git"
            aria-hidden="true"
          />
          <h2 className="break-words text-lg font-semibold text-bp-graphite">
            {request.title}
          </h2>
        </div>
        <StatusBadge status={request.status} />
      </div>
      <dl className="mt-5 grid min-w-0 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Fact
          label={t("detail.fields.repository")}
          value={request.workspaceLabel}
        />
        <Fact label={t("detail.fields.batchId")} value={request.batchId} />
        <Fact
          label={t("detail.fields.requestedBy")}
          value={request.requestedBy ? `@${request.requestedBy}` : "-"}
        />
        <Fact
          label={t("detail.fields.requestedAt")}
          value={request.requestedAt || "-"}
        />
        <Fact
          label={t("detail.fields.expiresAt")}
          value={request.expiresAt || "-"}
        />
        <Fact
          label={t("detail.fields.issueState")}
          value={request.sourceState}
        />
        <Fact
          label={t("detail.fields.workflow")}
          value={
            request.workflow
              ? `${request.workflow.path}@${request.workflow.ref}`
              : "-"
          }
        />
        <Fact
          label={t("detail.fields.requestDigest")}
          value={request.evidence.requestDigest}
        />
      </dl>
    </article>
  );
}

function DecisionMaterial({ request }: { request: ExecutionRequest }) {
  const { t } = useTranslation("executionRequests");
  return (
    <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-bp-graphite">
        {t("detail.material.title")}
      </h2>
      <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-4">
          <TextBlock
            label={t("detail.fields.reason")}
            value={request.reason || "-"}
          />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-bp-muted">
              {t("detail.fields.command")}
            </p>
            <pre className="mt-2 max-h-36 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-md bg-bp-graphite p-3 text-xs leading-5 text-white">
              {request.execution?.command || "-"}
            </pre>
          </div>
        </div>
        <dl className="grid min-w-0 gap-3 text-sm">
          <Fact
            label={t("detail.fields.environment")}
            value={request.batch.environment || "-"}
          />
          <Fact
            label={t("detail.fields.runsOn")}
            value={formatRunnerLabel(request.execution?.runsOn)}
          />
          <Fact
            label={t("detail.fields.artifact")}
            value={request.execution?.artifactPath || "-"}
          />
        </dl>
      </div>
    </article>
  );
}

function GovernanceChecks({ request }: { request: ExecutionRequest }) {
  const { t } = useTranslation("executionRequests");
  const gateRequired = Boolean(request.execution?.gateRequired);
  return (
    <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
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
          ok={Boolean(request.evidence.requestDigest)}
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

function DispatcherEvidence({
  attempt,
  request,
}: {
  attempt: ExecutionAttempt | null;
  request: ExecutionRequest;
}) {
  const { t } = useTranslation("executionRequests");
  const gateEvidence = request.gateDecision
    ? `${request.gateDecision.allowed ? t("detail.dispatcher.gateAllowed") : t("detail.dispatcher.gateBlocked")} ${formatGateReasonDisplay(request.gateDecision.reasonCode, t, t("detail.dispatcher.none"))}`
    : "";
  const approvalEvidence = request.approvalDecision
    ? `${request.approvalDecision.decision} by @${request.approvalDecision.actor}${request.approvalDecision.reason ? `: ${request.approvalDecision.reason}` : ""}`
    : t("detail.dispatcher.none");
  return (
    <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-bp-graphite">
        {t("detail.dispatcher.title")}
      </h2>
      <p className="mt-2 text-sm text-bp-muted">
        {t("detail.dispatcher.noBrowserDispatch")}
      </p>
      <dl className="mt-4 grid min-w-0 gap-3 text-sm">
        <Fact
          label={t("detail.dispatcher.status")}
          value={t(`detail.status.${request.status}`)}
        />
        <Fact
          label={t("detail.dispatcher.dispatcherEvidence")}
          value={
            request.dispatcher
              ? `${request.dispatcher.status} @ ${request.dispatcher.createdAt}`
              : t("detail.dispatcher.none")
          }
        />
        <Fact
          label={t("detail.dispatcher.approvalEvidence")}
          value={approvalEvidence}
        />
        {gateEvidence ? (
          <Fact
            label={t("detail.dispatcher.gateEvidence")}
            value={gateEvidence}
          />
        ) : null}
        <div className="min-w-0 rounded-md bg-slate-50 px-3 py-2">
          <dt className="text-xs font-semibold uppercase tracking-normal text-bp-muted">
            {t("detail.dispatcher.workflowRun")}
          </dt>
          <dd className="mt-1 min-w-0 break-words text-xs font-semibold text-bp-graphite">
            {attempt ? (
              <Link
                className="break-all font-mono text-bp-control underline"
                to={`/execution-runs/${encodeURIComponent(attempt.attemptLocator)}`}
              >
                {attempt.sourceLabel} {t(`runDetail.status.${attempt.status}`)}
              </Link>
            ) : request.attempts.type === "unavailable" ? (
              t("detail.dispatcher.workflowRunUnavailable")
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

function CanonicalPayload({ request }: { request: ExecutionRequest }) {
  const { t } = useTranslation("executionRequests");
  return (
    <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-bp-graphite">
        {t("detail.payload.title")}
      </h2>
      <pre className="mt-4 max-h-96 max-w-full overflow-auto rounded-md bg-bp-graphite p-4 text-xs leading-6 text-white">
        <code>{request.evidence.canonicalPayload || "-"}</code>
      </pre>
    </article>
  );
}

function approvalUnavailableReason(
  capability: ExecutionRequestCapability,
  t: (key: string) => string,
): string {
  return capability.approveUnavailableReason === "SELF_APPROVAL_BLOCKED"
    ? t("detail.values.selfApprovalBlocked")
    : "";
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-slate-50 px-3 py-2">
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
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase text-bp-muted">{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-bp-graphite">
        {value}
      </p>
    </div>
  );
}

function CheckRow({ ok, text }: { ok: boolean; text: string }) {
  const Icon = ok ? CheckCircle2 : XCircle;
  return (
    <li
      className={`flex min-w-0 items-start gap-2 ${ok ? "text-bp-graphite" : "text-red-800"}`}
    >
      <Icon
        className={`mt-0.5 h-4 w-4 shrink-0 ${ok ? "text-emerald-700" : "text-red-700"}`}
        aria-hidden="true"
      />
      <span className="break-words font-semibold">{text}</span>
    </li>
  );
}

function StatusBadge({ status }: { status: ExecutionRequest["status"] }) {
  const { t } = useTranslation("executionRequests");
  return (
    <span
      className={`shrink-0 rounded-md px-2 py-1 text-xs font-bold ${statusPalette(status)}`}
      title={t(`detail.statusHelp.${status}`)}
    >
      {t(`detail.status.${status}`)}
    </span>
  );
}

function formatRunnerLabel(
  runsOn: NonNullable<ExecutionRequest["execution"]>["runsOn"] | undefined,
): string {
  return Array.isArray(runsOn) ? runsOn.join(", ") : runsOn || "-";
}

function statusPalette(status: ExecutionRequest["status"]): string {
  if (status === "REQUESTED") return "bg-amber-50 text-amber-800";
  if (status === "APPROVED" || status === "DISPATCHING")
    return "bg-sky-50 text-sky-800";
  if (status === "DISPATCHED") return "bg-emerald-50 text-emerald-800";
  return "bg-red-50 text-red-800";
}
