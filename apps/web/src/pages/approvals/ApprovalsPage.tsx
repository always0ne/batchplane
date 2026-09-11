import type {
  ExecutionRequest,
  RequestInventoryItem,
} from "@batchplane/ui-client";
import { ExternalLink, FileText, Loader2, RefreshCw } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useBatchPlaneClient } from "../../client/batch-plane-client-context";
import { ExecutionApprovalActions } from "../../features/execution-approval/ExecutionApprovalActions";
import { PageHeader } from "../../ui/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "../../ui/PageState";
import {
  useApprovalRequests,
  type ApprovalRequestsState,
} from "./useApprovalRequests";

type ActionState =
  | { type: "idle" }
  | { action: "approve" | "reject"; requestLocator: string; type: "running" }
  | { message: string; type: "success" }
  | { message: string; type: "error" };

export function ApprovalsPage() {
  const { t } = useTranslation("approvals");
  const client = useBatchPlaneClient();
  const approvals = useApprovalRequests();
  const [actionState, setActionState] = useState<ActionState>({ type: "idle" });
  const actionInFlight = useRef(false);

  async function applyExecutionAction(
    request: ExecutionRequest,
    action: "approve" | "reject",
    reason = "",
  ) {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setActionState({
      action,
      requestLocator: request.requestLocator,
      type: "running",
    });

    try {
      const updated =
        action === "approve"
          ? await client.approveExecutionRequest({
              requestLocator: request.requestLocator,
            })
          : await client.rejectExecutionRequest({
              reason,
              requestLocator: request.requestLocator,
            });
      setActionState({
        message:
          action === "approve"
            ? t("result.executionApproved", { requestId: updated.requestId })
            : t("result.executionRejected", { requestId: updated.requestId }),
        type: "success",
      });
      approvals.applyExecutionResult(updated);
    } catch (error) {
      setActionState({
        message: messageFrom(error) || t("states.error"),
        type: "error",
      });
    } finally {
      actionInFlight.current = false;
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title={t("title")} subtitle={t("subtitle")} />
        <div className="space-y-1 text-right">
          <button
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-bp-graphite disabled:cursor-not-allowed disabled:text-slate-400"
            disabled={
              approvals.state.type === "loading" ||
              actionState.type === "running"
            }
            onClick={approvals.refresh}
            type="button"
          >
            {approvals.state.type === "loading" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            )}
            {t("actions.refresh")}
          </button>
          <p className="text-xs text-bp-muted">{t("states.githubLagHint")}</p>
        </div>
      </div>

      {actionState.type === "success" || actionState.type === "error" ? (
        <p
          className={[
            "mb-4 rounded-md border px-3 py-2 text-sm font-medium",
            actionState.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800",
          ].join(" ")}
          role={actionState.type === "error" ? "alert" : "status"}
        >
          {actionState.message}
        </p>
      ) : null}

      <ApprovalContent
        actionState={actionState}
        actionsDisabled={actionState.type === "running"}
        onExecutionAction={applyExecutionAction}
        state={approvals.state}
      />
    </section>
  );
}

function ApprovalContent({
  actionState,
  actionsDisabled,
  onExecutionAction,
  state,
}: {
  actionState: ActionState;
  actionsDisabled: boolean;
  onExecutionAction: (
    request: ExecutionRequest,
    action: "approve" | "reject",
    reason?: string,
  ) => Promise<void>;
  state: ApprovalRequestsState;
}) {
  const { t } = useTranslation("approvals");

  if (state.type === "loading") {
    return <LoadingState message={t("states.loading")} />;
  }

  if (state.type === "workspace-not-connected") {
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
    return <ErrorState message={state.message || t("states.error")} />;
  }

  const governedChanges = state.inventory.requests.filter(
    (item) => item.kind === "GOVERNED_CHANGE",
  );
  const executionRequests = state.inventory.requests.filter(
    (item) => item.kind === "EXECUTION",
  );

  if (governedChanges.length === 0 && executionRequests.length === 0) {
    return (
      <EmptyState
        message={t("states.empty", {
          branch: state.inventory.workspaceDefaultBranch,
        })}
      />
    );
  }

  return (
    <div className="space-y-6">
      {governedChanges.length > 0 ? (
        <ApprovalSection title={t("sections.registration")}>
          {governedChanges.map((item) => (
            <GovernedChangeApproval
              key={item.request.requestLocator}
              item={item}
            />
          ))}
        </ApprovalSection>
      ) : null}
      {executionRequests.length > 0 ? (
        <ApprovalSection title={t("sections.execution")}>
          {executionRequests.map((item) => (
            <ExecutionApproval
              actionState={actionState}
              actionsDisabled={actionsDisabled}
              item={item}
              key={item.request.requestLocator}
              onAction={onExecutionAction}
            />
          ))}
        </ApprovalSection>
      ) : null}
    </div>
  );
}

function ApprovalSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-bp-graphite">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function GovernedChangeApproval({
  item,
}: {
  item: Extract<RequestInventoryItem, { kind: "GOVERNED_CHANGE" }>;
}) {
  const { t } = useTranslation("approvals");
  const request = item.request;

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <FileText className="h-4 w-4 text-bp-git" aria-hidden="true" />
            <h3 className="break-words text-lg font-semibold text-bp-graphite">
              {request.title}
            </h3>
          </div>
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <ApprovalMeta
              label={t("fields.batchId")}
              value={request.batchId || t("values.unknown")}
            />
            <ApprovalMeta
              label={t("fields.author")}
              value={request.requester || t("values.unknown")}
            />
            <ApprovalMeta
              label={t("fields.requestType")}
              value={governedChangeTypeLabel(item.changeKind, t)}
            />
            <ApprovalMeta
              label={t("fields.repository")}
              value={request.workspaceLabel}
            />
          </dl>
        </div>
        <div className="flex flex-wrap gap-2">
          {request.sourceUrl ? (
            <a
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-bp-graphite hover:border-bp-git"
              href={request.sourceUrl}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              {t("actions.openSourceRequest")}
            </a>
          ) : null}
          <Link
            className="inline-flex h-10 items-center justify-center rounded-md bg-bp-control px-3 text-sm font-semibold text-white hover:bg-bp-graphite"
            to={`/approvals/registration/${encodeURIComponent(request.requestLocator)}`}
          >
            {t("actions.viewRegistrationDetails")}
          </Link>
        </div>
      </div>
      <p className="mt-4 text-sm text-bp-muted">
        {t("states.registrationReviewHint")}
      </p>
    </article>
  );
}

function ExecutionApproval({
  actionState,
  actionsDisabled,
  item,
  onAction,
}: {
  actionState: ActionState;
  actionsDisabled: boolean;
  item: Extract<RequestInventoryItem, { kind: "EXECUTION" }>;
  onAction: (
    request: ExecutionRequest,
    action: "approve" | "reject",
    reason?: string,
  ) => Promise<void>;
}) {
  const { t } = useTranslation("approvals");
  const request = item.request;
  const isRunning =
    actionState.type === "running" &&
    actionState.requestLocator === request.requestLocator;
  const approveDisabledReason = approvalDisabledReason(request, t);

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="break-words text-lg font-semibold text-bp-graphite">
            {request.title}
          </h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {request.sourceUrl ? (
            <a
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-bp-graphite hover:border-bp-git"
              href={request.sourceUrl}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              {t("actions.openIssue")}
            </a>
          ) : null}
          <Link
            className="inline-flex h-10 items-center justify-center rounded-md bg-bp-control px-3 text-sm font-semibold text-white hover:bg-bp-graphite"
            to={`/execution-requests/${encodeURIComponent(request.requestLocator)}`}
          >
            {t("actions.viewDetails")}
          </Link>
        </div>
      </div>
      <h4 className="mt-5 text-base font-semibold text-bp-graphite">
        {t("context.executionTitle")}
      </h4>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <ApprovalMeta label={t("fields.batchId")} value={request.batchId} />
        <ApprovalMeta label={t("fields.requestId")} value={request.requestId} />
        <ApprovalMeta
          label={t("fields.requestedBy")}
          value={request.requestedBy || t("values.unknown")}
        />
        <ApprovalMeta
          label={t("fields.expiresAt")}
          value={request.expiresAt || t("values.unknown")}
        />
        <ApprovalMeta
          label={t("fields.requestDigest")}
          value={request.evidence.requestDigest || t("values.unknown")}
        />
        <ApprovalMeta
          label={t("fields.workflow")}
          value={
            request.workflow
              ? `${request.workflow.path}@${request.workflow.ref}`
              : t("values.unknown")
          }
        />
        <ApprovalMeta
          label={t("fields.runsOn")}
          value={runnerLabel(request.execution?.runsOn) || t("values.unknown")}
        />
        <ApprovalMeta
          label={t("fields.command")}
          value={request.execution?.command ?? t("values.unknown")}
        />
        <ApprovalMeta
          label={t("fields.gate")}
          value={
            request.execution?.gateRequired
              ? t("values.gateRequired")
              : t("values.gateNonCompliant")
          }
        />
      </dl>
      <div className="mt-4 rounded-md bg-slate-50 p-3 text-sm text-bp-graphite">
        <p className="text-xs font-bold uppercase text-bp-muted">
          {t("fields.reason")}
        </p>
        <p className="mt-1 break-words">
          {request.reason || t("values.unknown")}
        </p>
      </div>
      <ExecutionApprovalActions
        approveDisabled={!request.capability.canApprove}
        approveDisabledReason={approveDisabledReason}
        approveLabel={t("actions.approveExecution")}
        disabled={actionsDisabled}
        isApproving={isRunning && actionState.action === "approve"}
        isRejecting={isRunning && actionState.action === "reject"}
        onApprove={() => void onAction(request, "approve")}
        onReject={(reason) => void onAction(request, "reject", reason)}
        rejectLabel={t("actions.reject")}
        rejectDisabled={!request.capability.canReject}
      />
    </article>
  );
}

function ApprovalMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-bold uppercase text-bp-muted">{label}</dt>
      <dd className="mt-1 break-words font-semibold text-bp-graphite">
        {value}
      </dd>
    </div>
  );
}

function approvalDisabledReason(
  request: ExecutionRequest,
  t: (key: string) => string,
) {
  if (request.capability.canApprove) return "";
  if (request.capability.approveUnavailableReason === "SELF_APPROVAL_BLOCKED") {
    return t("values.selfApprovalBlocked");
  }
  if (request.gateDecision?.allowed === false)
    return t("values.gateApprovalBlocked");
  return "";
}

function governedChangeTypeLabel(
  changeKind: Extract<
    RequestInventoryItem,
    { kind: "GOVERNED_CHANGE" }
  >["changeKind"],
  t: (key: string) => string,
) {
  const requestType = changeKind.endsWith("REGISTER")
    ? "REGISTER"
    : changeKind.endsWith("DELETE")
      ? "DELETE"
      : "CHANGE";
  return t(`values.registrationRequestTypes.${requestType}`);
}

function runnerLabel(
  value: NonNullable<ExecutionRequest["execution"]>["runsOn"] | undefined,
) {
  return Array.isArray(value) ? value.join(", ") : (value ?? "");
}

function messageFrom(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : "";
}
