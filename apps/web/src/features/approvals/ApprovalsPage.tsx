import {
  createGitHubLiteClient,
  GitHubLiteApiError,
  type GitHubPullRequest,
} from "@batchtrail/github-lite";
import {
  CheckCircle2,
  GitPullRequest,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { PageHeader } from "../../shared/components/PageHeader";
import {
  readGitHubSession,
  type GitHubSession,
} from "../lite-setup/github-session";
import {
  buildRegistrationApprovalComment,
  buildRegistrationRejectionComment,
  isRegistrationApprovalRequest,
} from "./approval-model";

type ApprovalPageState =
  | { type: "loading" }
  | { type: "no-session" }
  | {
      type: "loaded";
      defaultBranch: string;
      login: string;
      repository: string;
      requests: GitHubPullRequest[];
      session: GitHubSession;
    }
  | { type: "error"; message: string };

type ApprovalActionState =
  | { type: "idle" }
  | { type: "running"; pullNumber: number; action: "approve" | "reject" }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

export function ApprovalsPage() {
  const { t } = useTranslation("approvals");
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
        const pullRequests = await client.listPullRequests({
          ...session,
          base: repository.defaultBranch,
          state: "open",
        });

        if (!ignoreResult) {
          setState({
            type: "loaded",
            defaultBranch: repository.defaultBranch,
            login: user.login,
            repository: `${repository.owner}/${repository.repo}`,
            requests: pullRequests.filter(isRegistrationApprovalRequest),
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
      pullNumber: pullRequest.number,
      action: "approve",
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

      removeRequest(pullRequest.number);
      setActionState({
        type: "success",
        message: t("result.approved", { number: pullRequest.number }),
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
      pullNumber: pullRequest.number,
      action: "reject",
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

      removeRequest(pullRequest.number);
      setActionState({
        type: "success",
        message: t("result.rejected", { number: pullRequest.number }),
      });
    } catch (error) {
      setActionState({ type: "error", message: formatApprovalError(error) });
    }
  }

  function removeRequest(pullNumber: number) {
    setState((current) => {
      if (current.type !== "loaded") {
        return current;
      }

      return {
        ...current,
        requests: current.requests.filter(
          (request) => request.number !== pullNumber,
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
        onApprove={(pullRequest) => void approveAndMerge(pullRequest)}
        onReject={(pullRequest) => void rejectAndClose(pullRequest)}
        state={state}
      />
    </section>
  );
}

function ApprovalContent({
  actionState,
  onApprove,
  onReject,
  state,
}: {
  actionState: ApprovalActionState;
  onApprove: (pullRequest: GitHubPullRequest) => void;
  onReject: (pullRequest: GitHubPullRequest) => void;
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

  if (state.requests.length === 0) {
    return (
      <StatusPanel>
        <span>{t("states.empty", { branch: state.defaultBranch })}</span>
      </StatusPanel>
    );
  }

  return (
    <div className="space-y-3">
      {state.requests.map((pullRequest) => {
        const isBusy =
          actionState.type === "running" &&
          actionState.pullNumber === pullRequest.number;
        const disabled = actionState.type === "running";

        return (
          <article
            className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
            key={pullRequest.number}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <GitPullRequest
                    className="h-4 w-4 text-bt-git"
                    aria-hidden="true"
                  />
                  <h2 className="text-lg font-semibold text-bt-graphite">
                    #{pullRequest.number} {pullRequest.title}
                  </h2>
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

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                className="inline-flex items-center gap-2 rounded-md bg-bt-control px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={disabled}
                onClick={() => onApprove(pullRequest)}
                type="button"
              >
                {isBusy && actionState.action === "approve" ? (
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                )}
                {t("actions.approveAndMerge")}
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 disabled:cursor-not-allowed disabled:text-slate-400"
                disabled={disabled}
                onClick={() => onReject(pullRequest)}
                type="button"
              >
                {isBusy && actionState.action === "reject" ? (
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <XCircle className="h-4 w-4" aria-hidden="true" />
                )}
                {t("actions.reject")}
              </button>
            </div>
          </article>
        );
      })}
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

function formatApprovalError(error: unknown): string {
  if (error instanceof GitHubLiteApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Approval request failed.";
}
