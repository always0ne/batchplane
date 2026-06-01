import type {
  BatchPlaneRuntimePorts,
  RepositoryPullRequest,
  WorkspacePolicy,
} from "@batchplane/domain";
import { FileText, GitPullRequest, Loader2, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

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
import type { GitHubSession } from "../lite-setup/github-session";
import {
  buildExecutionApprovalComment,
  buildExecutionRejectionComment,
  allowsSelfApproval,
  type ExecutionApprovalRequest,
  isRegistrationApprovalRequest,
  parseExecutionApprovalRequest,
} from "./approval-model";
import {
  mergeExecutionApprovalRequests,
  mergeRegistrationApprovalRequests,
  normalizeApprovalHandoff,
  pruneApprovalHandoff,
  removeExecutionApprovalHandoff,
  removeStoredExecutionApprovalHandoff,
  writeStoredApprovalHandoff,
} from "./approval-handoff";
import { ExecutionApprovalActions } from "./ExecutionApprovalActions";

type ApprovalPageState =
  | { type: "loading" }
  | { type: "no-session" }
  | {
      type: "loaded";
      defaultBranch: string;
      executionRequests: ExecutionApprovalRequest[];
      login: string;
      registrationRequests: RepositoryPullRequest[];
      repository: string;
      session: GitHubSession;
      workspacePolicy: WorkspacePolicy;
    }
  | { type: "error"; message: string };

type ApprovalActionState =
  | { type: "idle" }
  | { type: "running"; action: "approve" | "reject"; targetKey: string }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

type ApprovalsPageProps = {
  createRuntime?: (session: GitHubSession) => BatchPlaneRuntimePorts;
  readSession?: () => GitHubSession | null;
};

export function ApprovalsPage({
  createRuntime = createBatchPlaneRuntime,
  readSession = readRuntimeSession,
}: ApprovalsPageProps = {}) {
  const { t } = useTranslation("approvals");
  const location = useLocation();
  const approvalHandoffRef = useRef(normalizeApprovalHandoff(location.state));
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<ApprovalPageState>({ type: "loading" });
  const [actionState, setActionState] = useState<ApprovalActionState>({
    type: "idle",
  });

  useEffect(() => {
    let ignoreResult = false;

    async function loadApprovalRequests() {
      const session = readSession();

      if (!session) {
        setState({ type: "no-session" });
        return;
      }

      setState({ type: "loading" });

      try {
        const runtime = createRuntime(session);
        const [user, repository] = await Promise.all([
          runtime.settings.getCurrentUser(),
          runtime.settings.getRepository(),
        ]);
        const workspacePolicy = await runtime.settings.getWorkspacePolicy({
          ref: repository.defaultBranch,
        });
        const handoff = approvalHandoffRef.current;
        const immediateExecutionRequests = mergeExecutionApprovalRequests(
          [],
          handoff.executionIssues,
        );
        const immediateRegistrationRequests = mergeRegistrationApprovalRequests(
          [],
          handoff.registrationRequests,
        );

        if (
          !ignoreResult &&
          (immediateRegistrationRequests.length > 0 ||
            immediateExecutionRequests.length > 0)
        ) {
          setState({
            type: "loaded",
            defaultBranch: repository.defaultBranch,
            executionRequests: immediateExecutionRequests,
            login: user.login,
            registrationRequests: immediateRegistrationRequests,
            repository: `${repository.owner}/${repository.repo}`,
            session,
            workspacePolicy,
          });
        }

        const [pullRequests, issues] = await Promise.all([
          runtime.approvals.listRegistrationRequests({
            baseBranch: repository.defaultBranch,
          }),
          runtime.approvals.listExecutionRequestIssues(),
        ]);
        const issueComments = await Promise.all(
          issues.map((issue) =>
            runtime.approvals.listExecutionRequestComments({
              issueNumber: issue.number,
            }),
          ),
        );

        if (!ignoreResult) {
          const currentHandoff = approvalHandoffRef.current;
          const listedExecutionRequests = issues
            .map((issue, index) =>
              parseExecutionApprovalRequest(issue, issueComments[index] ?? []),
            )
            .filter(
              (request): request is ExecutionApprovalRequest =>
                request !== null,
            );
          const listedRegistrationRequests = pullRequests.filter(
            isRegistrationApprovalRequest,
          );
          const pendingHandoff = pruneApprovalHandoff(currentHandoff, {
            listedExecutionRequests,
            listedRegistrationRequests,
          });

          approvalHandoffRef.current = pendingHandoff;
          writeStoredApprovalHandoff(pendingHandoff);

          setState({
            type: "loaded",
            defaultBranch: repository.defaultBranch,
            executionRequests: mergeExecutionApprovalRequests(
              listedExecutionRequests,
              currentHandoff.executionIssues,
            ),
            login: user.login,
            registrationRequests: mergeRegistrationApprovalRequests(
              listedRegistrationRequests,
              currentHandoff.registrationRequests,
            ),
            repository: `${repository.owner}/${repository.repo}`,
            session,
            workspacePolicy,
          });
        }
      } catch (error) {
        if (!ignoreResult) {
          setState({ type: "error", message: formatApprovalError(error) });
        }
      }
    }

    void loadApprovalRequests();

    return () => {
      ignoreResult = true;
    };
  }, [createRuntime, readSession, reloadToken]);

  async function approveExecution(request: ExecutionApprovalRequest) {
    if (state.type !== "loaded") {
      return;
    }

    setActionState({
      type: "running",
      action: "approve",
      targetKey: executionRequestKey(request),
    });

    try {
      const runtime = createRuntime(state.session);

      await runtime.approvals.approveExecution({
        body: buildExecutionApprovalComment({
          approvedAt: new Date(),
          approvalMode: state.workspacePolicy.approval.mode,
          approver: state.login,
          request,
        }),
        issueNumber: request.issue.number,
      });

      removeExecutionRequest(request.issue.number);
      setActionState({
        type: "success",
        message: t("result.executionApproved", {
          requestId: request.requestId,
        }),
      });
    } catch (error) {
      setActionState({ type: "error", message: formatApprovalError(error) });
    }
  }

  async function rejectExecution(
    request: ExecutionApprovalRequest,
    reason: string,
  ) {
    if (state.type !== "loaded") {
      return;
    }

    setActionState({
      type: "running",
      action: "reject",
      targetKey: executionRequestKey(request),
    });

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

      removeExecutionRequest(request.issue.number);
      setActionState({
        type: "success",
        message: t("result.executionRejected", {
          requestId: request.requestId,
        }),
      });
    } catch (error) {
      setActionState({ type: "error", message: formatApprovalError(error) });
    }
  }

  function removeExecutionRequest(issueNumber: number) {
    approvalHandoffRef.current = removeExecutionApprovalHandoff(
      approvalHandoffRef.current,
      issueNumber,
    );
    removeStoredExecutionApprovalHandoff(issueNumber);
    setState((current) => {
      if (current.type !== "loaded") {
        return current;
      }

      return {
        ...current,
        executionRequests: current.executionRequests.filter(
          (request) => request.issue.number !== issueNumber,
        ),
      };
    });
  }

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title={t("title")} subtitle={t("subtitle")} />
        <div className="space-y-1 text-right">
          <button
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-bp-graphite disabled:cursor-not-allowed disabled:text-slate-400"
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
          <p className="text-xs text-bp-muted">{t("states.githubLagHint")}</p>
        </div>
      </div>

      <ActionBanner state={actionState} />

      <ApprovalContent
        actionState={actionState}
        onApproveExecution={(request) => void approveExecution(request)}
        onRejectExecution={(request, reason) =>
          void rejectExecution(request, reason)
        }
        state={state}
      />
    </section>
  );
}

function ApprovalContent({
  actionState,
  onApproveExecution,
  onRejectExecution,
  state,
}: {
  actionState: ApprovalActionState;
  onApproveExecution: (request: ExecutionApprovalRequest) => void;
  onRejectExecution: (
    request: ExecutionApprovalRequest,
    reason: string,
  ) => void;
  state: ApprovalPageState;
}) {
  const { t } = useTranslation("approvals");

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

  if (
    state.registrationRequests.length === 0 &&
    state.executionRequests.length === 0
  ) {
    return (
      <EmptyState
        message={t("states.empty", { branch: state.defaultBranch })}
      />
    );
  }

  return (
    <div className="space-y-6">
      {state.registrationRequests.length > 0 ? (
        <ApprovalSection title={t("sections.registration")}>
          {state.registrationRequests.map((pullRequest) => {
            return (
              <article
                className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
                key={registrationRequestKey(pullRequest)}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <GitPullRequest
                        className="h-4 w-4 text-bp-git"
                        aria-hidden="true"
                      />
                      <h3 className="text-lg font-semibold text-bp-graphite">
                        #{pullRequest.number} {pullRequest.title}
                      </h3>
                    </div>
                    <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                      <ApprovalMeta
                        label={t("fields.repository")}
                        value={state.repository}
                      />
                      <ApprovalMeta
                        label={t("fields.author")}
                        value={pullRequest.author || "-"}
                      />
                      <ApprovalMeta
                        label={t("fields.head")}
                        value={pullRequest.head}
                      />
                      <ApprovalMeta
                        label={t("fields.base")}
                        value={pullRequest.base}
                      />
                    </dl>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a
                      className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bp-graphite"
                      href={pullRequest.url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {t("actions.openPullRequest")}
                    </a>
                    <Link
                      className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bp-graphite"
                      to={`/approvals/registration/${pullRequest.number}`}
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
          })}
        </ApprovalSection>
      ) : null}

      {state.executionRequests.length > 0 ? (
        <ApprovalSection title={t("sections.execution")}>
          {state.executionRequests.map((request) => {
            const isBusy =
              actionState.type === "running" &&
              actionState.targetKey === executionRequestKey(request);
            const disabled = actionState.type === "running";
            const selfApprovalAllowed = allowsSelfApproval(
              state.workspacePolicy,
            );
            const selfApproval =
              request.requestedBy === state.login && request.requestedBy !== "";
            const selfApprovalBlocked =
              selfApproval && !selfApprovalAllowed
                ? t("values.selfApprovalBlocked")
                : "";
            const selfApprovalNotice =
              selfApproval && selfApprovalAllowed
                ? t("values.selfApprovalAllowed", {
                    mode: state.workspacePolicy.approval.mode,
                  })
                : "";
            const gateBlocked =
              request.execution?.gateRequired === false
                ? t("values.gateApprovalBlocked")
                : "";
            const approveDisabledReason = [gateBlocked, selfApprovalBlocked]
              .filter(Boolean)
              .join(" ");

            return (
              <article
                className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
                key={executionRequestKey(request)}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <FileText
                        className="h-4 w-4 text-bp-git"
                        aria-hidden="true"
                      />
                      <h3 className="text-lg font-semibold text-bp-graphite">
                        #{request.issue.number} {request.issue.title}
                      </h3>
                    </div>
                    <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                      <ApprovalMeta
                        label={t("fields.requestId")}
                        value={request.requestId}
                      />
                      <ApprovalMeta
                        label={t("fields.batchId")}
                        value={request.batchId}
                      />
                      <ApprovalMeta
                        label={t("fields.requestedBy")}
                        value={
                          request.requestedBy || request.issue.author || "-"
                        }
                      />
                      <ApprovalMeta
                        label={t("fields.expiresAt")}
                        value={request.expiresAt || "-"}
                      />
                      <ApprovalMeta
                        label={t("fields.requestDigest")}
                        value={request.requestDigest}
                      />
                    </dl>
                    <ExecutionApprovalContext request={request} />
                    {selfApprovalNotice ? (
                      <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
                        {selfApprovalNotice}
                      </p>
                    ) : null}
                  </div>
                  <a
                    className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bp-graphite"
                    href={request.issue.url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {t("actions.openIssue")}
                  </a>
                  <Link
                    className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bp-graphite"
                    to={`/execution-requests/${request.issue.number}`}
                  >
                    {t("actions.viewDetails")}
                  </Link>
                </div>

                <ExecutionApprovalActions
                  approveLabel={t("actions.approveExecution")}
                  approveDisabledReason={approveDisabledReason}
                  disabled={disabled}
                  isApproving={isBusy && actionState.action === "approve"}
                  isRejecting={isBusy && actionState.action === "reject"}
                  onApprove={() => onApproveExecution(request)}
                  onReject={(reason) => onRejectExecution(request, reason)}
                  rejectLabel={t("actions.reject")}
                />
              </article>
            );
          })}
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
      <h2 className="mb-3 text-base font-bold text-bp-graphite">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function ExecutionApprovalContext({
  request,
}: {
  request: ExecutionApprovalRequest;
}) {
  const { t } = useTranslation("approvals");

  return (
    <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
      <h4 className="text-sm font-bold text-bp-graphite">
        {t("context.executionTitle")}
      </h4>
      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-3">
          <ApprovalContextText
            label={t("fields.reason")}
            value={request.reason || t("values.unknown")}
          />
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-bp-muted">
              {t("fields.command")}
            </p>
            <div className="mt-1">
              <pre className="max-h-28 overflow-auto whitespace-pre-wrap rounded-md bg-bp-graphite p-3 text-xs leading-5 text-white">
                {request.execution?.command || t("values.unknown")}
              </pre>
            </div>
          </div>
        </div>
        <dl className="grid gap-2 text-sm">
          <ApprovalMeta
            label={t("fields.runsOn")}
            value={
              request.execution?.runsOn
                ? formatRunnerLabel(request.execution.runsOn)
                : t("values.unknown")
            }
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
            label={t("fields.gate")}
            value={
              request.execution?.gateRequired === false
                ? t("values.gateNonCompliant")
                : t("values.gateRequired")
            }
          />
        </dl>
      </div>
    </div>
  );
}

function ApprovalContextText({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-normal text-bp-muted">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-bp-graphite">{value}</p>
    </div>
  );
}

function ApprovalMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 px-3 py-2">
      <dt className="text-xs font-semibold uppercase tracking-normal text-bp-muted">
        {label}
      </dt>
      <dd className="mt-1 break-all font-mono text-xs text-bp-graphite">
        {value}
      </dd>
    </div>
  );
}

function formatRunnerLabel(
  runsOn: NonNullable<ExecutionApprovalRequest["execution"]>["runsOn"],
) {
  return Array.isArray(runsOn) ? runsOn.join(", ") : runsOn;
}

function ActionBanner({ state }: { state: ApprovalActionState }) {
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

function registrationRequestKey(pullRequest: RepositoryPullRequest): string {
  return `registration:${pullRequest.number}`;
}

function executionRequestKey(request: ExecutionApprovalRequest): string {
  return `execution:${request.issue.number}`;
}

function formatApprovalError(error: unknown): string {
  return formatRuntimeError(error, "Approval request failed.");
}
