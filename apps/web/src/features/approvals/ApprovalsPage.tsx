import {
  createGitHubLiteClient,
  GitHubLiteApiError,
  type GitHubPullRequest,
} from "@batchtrail/github-lite";
import {
  CheckCircle2,
  FileText,
  GitPullRequest,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { PageHeader } from "../../shared/components/PageHeader";
import {
  readGitHubSession,
  type GitHubSession,
} from "../lite-setup/github-session";
import {
  buildExecutionApprovalComment,
  buildExecutionRejectionComment,
  buildRegistrationApprovalComment,
  buildRegistrationRejectionComment,
  type ExecutionApprovalRequest,
  isRegistrationApprovalRequest,
  parseExecutionApprovalRequest,
} from "./approval-model";
import {
  mergeExecutionApprovalRequests,
  mergeRegistrationApprovalRequests,
  normalizeApprovalHandoff,
  removeExecutionApprovalHandoff,
  removeRegistrationApprovalHandoff,
} from "./approval-handoff";

type ApprovalPageState =
  | { type: "loading" }
  | { type: "no-session" }
  | {
      type: "loaded";
      defaultBranch: string;
      executionRequests: ExecutionApprovalRequest[];
      login: string;
      registrationRequests: GitHubPullRequest[];
      repository: string;
      session: GitHubSession;
    }
  | { type: "error"; message: string };

type ApprovalActionState =
  | { type: "idle" }
  | { type: "running"; action: "approve" | "reject"; targetKey: string }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

export function ApprovalsPage() {
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
      const session = readGitHubSession();

      if (!session) {
        setState({ type: "no-session" });
        return;
      }

      setState({ type: "loading" });

      try {
        const client = createGitHubLiteClient({ token: session.token });
        const [user, repository] = await Promise.all([
          client.getCurrentUser(),
          client.getRepository(session),
        ]);
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
          });
        }

        const [pullRequests, issues] = await Promise.all([
          client.listPullRequests({
            ...session,
            base: repository.defaultBranch,
            state: "open",
          }),
          client.listIssues({
            ...session,
            state: "open",
          }),
        ]);

        if (!ignoreResult) {
          const currentHandoff = approvalHandoffRef.current;
          const listedExecutionRequests = issues
            .map(parseExecutionApprovalRequest)
            .filter(
              (request): request is ExecutionApprovalRequest =>
                request !== null,
            );
          const listedRegistrationRequests = pullRequests.filter(
            isRegistrationApprovalRequest,
          );

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
  }, [reloadToken]);

  async function approveAndMerge(pullRequest: GitHubPullRequest) {
    if (state.type !== "loaded") {
      return;
    }

    setActionState({
      type: "running",
      action: "approve",
      targetKey: registrationRequestKey(pullRequest),
    });

    try {
      const client = createGitHubLiteClient({ token: state.session.token });

      await client.createIssueComment({
        ...state.session,
        issueNumber: pullRequest.number,
        body: buildRegistrationApprovalComment({
          approvedAt: new Date(),
          approver: state.login,
          pullRequest,
        }),
      });

      const mergeResult = await client.mergePullRequest({
        ...state.session,
        pullNumber: pullRequest.number,
        commitTitle: `${pullRequest.title} (#${pullRequest.number})`,
        mergeMethod: "squash",
      });

      if (!mergeResult.merged) {
        throw new Error(mergeResult.message);
      }

      removeRegistrationRequest(pullRequest.number);
      setActionState({
        type: "success",
        message: t("result.registrationApproved", {
          number: pullRequest.number,
        }),
      });
    } catch (error) {
      setActionState({ type: "error", message: formatApprovalError(error) });
    }
  }

  async function rejectAndClose(pullRequest: GitHubPullRequest) {
    if (state.type !== "loaded") {
      return;
    }

    setActionState({
      type: "running",
      action: "reject",
      targetKey: registrationRequestKey(pullRequest),
    });

    try {
      const client = createGitHubLiteClient({ token: state.session.token });

      await client.createIssueComment({
        ...state.session,
        issueNumber: pullRequest.number,
        body: buildRegistrationRejectionComment({
          rejectedAt: new Date(),
          rejector: state.login,
          pullRequest,
        }),
      });
      await client.closeIssue({
        ...state.session,
        issueNumber: pullRequest.number,
      });

      removeRegistrationRequest(pullRequest.number);
      setActionState({
        type: "success",
        message: t("result.registrationRejected", {
          number: pullRequest.number,
        }),
      });
    } catch (error) {
      setActionState({ type: "error", message: formatApprovalError(error) });
    }
  }

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
      const client = createGitHubLiteClient({ token: state.session.token });

      await client.createIssueComment({
        ...state.session,
        issueNumber: request.issue.number,
        body: buildExecutionApprovalComment({
          approvedAt: new Date(),
          approver: state.login,
          request,
        }),
      });
      await client.closeIssue({
        ...state.session,
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

  async function rejectExecution(request: ExecutionApprovalRequest) {
    if (state.type !== "loaded") {
      return;
    }

    setActionState({
      type: "running",
      action: "reject",
      targetKey: executionRequestKey(request),
    });

    try {
      const client = createGitHubLiteClient({ token: state.session.token });

      await client.createIssueComment({
        ...state.session,
        issueNumber: request.issue.number,
        body: buildExecutionRejectionComment({
          rejectedAt: new Date(),
          rejector: state.login,
          request,
        }),
      });
      await client.closeIssue({
        ...state.session,
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

  function removeRegistrationRequest(pullNumber: number) {
    approvalHandoffRef.current = removeRegistrationApprovalHandoff(
      approvalHandoffRef.current,
      pullNumber,
    );
    setState((current) => {
      if (current.type !== "loaded") {
        return current;
      }

      return {
        ...current,
        registrationRequests: current.registrationRequests.filter(
          (request) => request.number !== pullNumber,
        ),
      };
    });
  }

  function removeExecutionRequest(issueNumber: number) {
    approvalHandoffRef.current = removeExecutionApprovalHandoff(
      approvalHandoffRef.current,
      issueNumber,
    );
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
      </div>

      <ActionBanner state={actionState} />

      <ApprovalContent
        actionState={actionState}
        onApproveExecution={(request) => void approveExecution(request)}
        onApproveRegistration={(pullRequest) =>
          void approveAndMerge(pullRequest)
        }
        onRejectExecution={(request) => void rejectExecution(request)}
        onRejectRegistration={(pullRequest) => void rejectAndClose(pullRequest)}
        state={state}
      />
    </section>
  );
}

function ApprovalContent({
  actionState,
  onApproveExecution,
  onApproveRegistration,
  onRejectExecution,
  onRejectRegistration,
  state,
}: {
  actionState: ApprovalActionState;
  onApproveExecution: (request: ExecutionApprovalRequest) => void;
  onApproveRegistration: (pullRequest: GitHubPullRequest) => void;
  onRejectExecution: (request: ExecutionApprovalRequest) => void;
  onRejectRegistration: (pullRequest: GitHubPullRequest) => void;
  state: ApprovalPageState;
}) {
  const { t } = useTranslation("approvals");

  if (state.type === "loading") {
    return (
      <StatusPanel>
        <Loader2 className="h-5 w-5 animate-spin text-bt-git" />
        <span>{t("states.loading")}</span>
      </StatusPanel>
    );
  }

  if (state.type === "no-session") {
    return (
      <StatusPanel>
        <span>{t("states.noSession")}</span>
        <Link
          className="font-semibold text-bt-control underline"
          to="/lite/setup"
        >
          {t("actions.openSetup")}
        </Link>
      </StatusPanel>
    );
  }

  if (state.type === "error") {
    return (
      <StatusPanel tone="danger">
        <span>{state.message}</span>
      </StatusPanel>
    );
  }

  if (
    state.registrationRequests.length === 0 &&
    state.executionRequests.length === 0
  ) {
    return (
      <StatusPanel>
        <span>{t("states.empty", { branch: state.defaultBranch })}</span>
      </StatusPanel>
    );
  }

  return (
    <div className="space-y-6">
      {state.registrationRequests.length > 0 ? (
        <ApprovalSection title={t("sections.registration")}>
          {state.registrationRequests.map((pullRequest) => {
            const isBusy =
              actionState.type === "running" &&
              actionState.targetKey === registrationRequestKey(pullRequest);
            const disabled = actionState.type === "running";

            return (
              <article
                className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
                key={registrationRequestKey(pullRequest)}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <GitPullRequest
                        className="h-4 w-4 text-bt-git"
                        aria-hidden="true"
                      />
                      <h3 className="text-lg font-semibold text-bt-graphite">
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
                  <a
                    className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bt-graphite"
                    href={pullRequest.url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {t("actions.openPullRequest")}
                  </a>
                </div>

                <ApprovalActions
                  approveLabel={t("actions.approveAndMerge")}
                  disabled={disabled}
                  isApproving={isBusy && actionState.action === "approve"}
                  isRejecting={isBusy && actionState.action === "reject"}
                  onApprove={() => onApproveRegistration(pullRequest)}
                  onReject={() => onRejectRegistration(pullRequest)}
                  rejectLabel={t("actions.reject")}
                />
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

            return (
              <article
                className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
                key={executionRequestKey(request)}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <FileText
                        className="h-4 w-4 text-bt-git"
                        aria-hidden="true"
                      />
                      <h3 className="text-lg font-semibold text-bt-graphite">
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
                  </div>
                  <a
                    className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bt-graphite"
                    href={request.issue.url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {t("actions.openIssue")}
                  </a>
                </div>

                <ApprovalActions
                  approveLabel={t("actions.approveExecution")}
                  disabled={disabled}
                  isApproving={isBusy && actionState.action === "approve"}
                  isRejecting={isBusy && actionState.action === "reject"}
                  onApprove={() => onApproveExecution(request)}
                  onReject={() => onRejectExecution(request)}
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
      <h2 className="mb-3 text-base font-bold text-bt-graphite">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function ApprovalActions({
  approveLabel,
  disabled,
  isApproving,
  isRejecting,
  onApprove,
  onReject,
  rejectLabel,
}: {
  approveLabel: string;
  disabled: boolean;
  isApproving: boolean;
  isRejecting: boolean;
  onApprove: () => void;
  onReject: () => void;
  rejectLabel: string;
}) {
  return (
    <div className="mt-5 flex flex-wrap gap-3">
      <button
        className="inline-flex items-center gap-2 rounded-md bg-bt-control px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
        disabled={disabled}
        onClick={onApprove}
        type="button"
      >
        {isApproving ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        )}
        {approveLabel}
      </button>
      <button
        className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 disabled:cursor-not-allowed disabled:text-slate-400"
        disabled={disabled}
        onClick={onReject}
        type="button"
      >
        {isRejecting ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <XCircle className="h-4 w-4" aria-hidden="true" />
        )}
        {rejectLabel}
      </button>
    </div>
  );
}

function ApprovalMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 px-3 py-2">
      <dt className="text-xs font-semibold uppercase tracking-normal text-bt-muted">
        {label}
      </dt>
      <dd className="mt-1 break-all font-mono text-xs text-bt-graphite">
        {value}
      </dd>
    </div>
  );
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

function StatusPanel({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "danger";
}) {
  const className =
    tone === "danger"
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-slate-200 bg-white text-bt-muted";

  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-lg border p-5 text-sm font-semibold shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

function registrationRequestKey(pullRequest: GitHubPullRequest): string {
  return `registration:${pullRequest.number}`;
}

function executionRequestKey(request: ExecutionApprovalRequest): string {
  return `execution:${request.issue.number}`;
}

function formatApprovalError(error: unknown): string {
  if (error instanceof GitHubLiteApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Approval request failed.";
}
