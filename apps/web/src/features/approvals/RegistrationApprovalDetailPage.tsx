import type {
  BatchPlaneRuntimePorts,
  RepositoryFile,
  RepositoryPullRequest,
  RepositoryPullRequestFile,
} from "@batchplane/domain";
import {
  CheckCircle2,
  ExternalLink,
  FileCode2,
  FileText,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

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
import {
  buildRegistrationApprovalComment,
  buildRegistrationRejectionComment,
} from "./approval-model";
import {
  deriveRegistrationFilePaths,
  deriveRegistrationReviewState,
  parseRegistrationApprovalDecision,
  parseRegistrationRequestSummary,
  type RegistrationApprovalDecision,
  type RegistrationRequestBodySummary,
  type RegistrationReviewState,
} from "./registration-approval-model";

type RegistrationApprovalDetailPageProps = {
  createRuntime?: (session: GitHubSession) => BatchPlaneRuntimePorts;
  readSession?: () => GitHubSession | null;
};

type PageState =
  | { type: "loading" }
  | { type: "no-session" }
  | { type: "not-found"; pullNumber: number }
  | {
      type: "loaded";
      decision: RegistrationApprovalDecision | null;
      files: RegistrationFileSummary[];
      login: string;
      pullRequest: RepositoryPullRequest;
      repository: string;
      reviewState: RegistrationReviewState;
      session: GitHubSession;
      summary: RegistrationRequestBodySummary;
    }
  | { type: "error"; message: string };

type ActionState =
  | { type: "idle" }
  | { type: "running"; action: "approve" | "reject" }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

type RegistrationFileSummary = {
  baseContent: string;
  headContent: string;
  patch: string;
  path: string;
  status: "ADDED" | "UPDATED" | "UNCHANGED" | "MISSING_HEAD";
};

export function RegistrationApprovalDetailPage({
  createRuntime = createBatchPlaneRuntime,
  readSession = readRuntimeSession,
}: RegistrationApprovalDetailPageProps = {}) {
  const { pullNumber = "" } = useParams();
  const parsedPullNumber = Number(pullNumber);
  const { t } = useTranslation("approvals");
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<PageState>({ type: "loading" });
  const [actionState, setActionState] = useState<ActionState>({ type: "idle" });

  useEffect(() => {
    let ignoreResult = false;

    async function loadRegistrationRequest() {
      const session = readSession();

      if (!session) {
        setState({ type: "no-session" });
        return;
      }

      if (!Number.isInteger(parsedPullNumber) || parsedPullNumber <= 0) {
        setState({ type: "not-found", pullNumber: 0 });
        return;
      }

      setState({ type: "loading" });

      try {
        const runtime = createRuntime(session);
        const [repository, pullRequest, user] = await Promise.all([
          runtime.settings.getRepository(),
          runtime.approvals.getRegistrationRequest({
            pullNumber: parsedPullNumber,
          }),
          runtime.settings.getCurrentUser(),
        ]);

        if (!pullRequest) {
          if (!ignoreResult) {
            setState({
              type: "not-found",
              pullNumber: parsedPullNumber,
            });
          }
          return;
        }

        const [comments, summary] = await Promise.all([
          runtime.approvals.listExecutionRequestComments({
            issueNumber: pullRequest.number,
          }),
          Promise.resolve(parseRegistrationRequestSummary(pullRequest)),
        ]);
        const decision = parseRegistrationApprovalDecision(comments);
        const reviewState = deriveRegistrationReviewState(
          pullRequest,
          decision,
        );
        const files = await loadRegistrationFiles(
          runtime,
          pullRequest,
          summary,
        );

        if (!ignoreResult) {
          setState({
            type: "loaded",
            decision,
            files,
            login: user.login,
            pullRequest,
            repository: `${repository.owner}/${repository.repo}`,
            reviewState,
            session,
            summary,
          });
        }
      } catch (error) {
        if (!ignoreResult) {
          setState({
            type: "error",
            message: formatRuntimeError(
              error,
              t("registrationDetail.states.error"),
            ),
          });
        }
      }
    }

    void loadRegistrationRequest();

    return () => {
      ignoreResult = true;
    };
  }, [createRuntime, parsedPullNumber, readSession, reloadToken, t]);

  async function approveRegistration() {
    if (state.type !== "loaded" || state.pullRequest.state !== "open") {
      return;
    }

    setActionState({ type: "running", action: "approve" });

    try {
      const runtime = createRuntime(state.session);
      const mergeResult = await runtime.approvals.approveRegistration({
        body: buildRegistrationApprovalComment({
          approvedAt: new Date(),
          approver: state.login,
          pullRequest: state.pullRequest,
        }),
        commitTitle: `${state.pullRequest.title} (#${state.pullRequest.number})`,
        pullNumber: state.pullRequest.number,
      });

      if (!mergeResult.merged) {
        throw new Error(mergeResult.message);
      }

      setActionState({
        type: "success",
        message: t("result.registrationApproved", {
          number: state.pullRequest.number,
        }),
      });
      setReloadToken((current) => current + 1);
    } catch (error) {
      setActionState({
        type: "error",
        message: formatRuntimeError(
          error,
          t("registrationDetail.actions.actionFailed"),
        ),
      });
    }
  }

  async function rejectRegistration() {
    if (state.type !== "loaded" || state.pullRequest.state !== "open") {
      return;
    }

    setActionState({ type: "running", action: "reject" });

    try {
      const runtime = createRuntime(state.session);

      await runtime.approvals.rejectRegistration({
        body: buildRegistrationRejectionComment({
          pullRequest: state.pullRequest,
          rejectedAt: new Date(),
          rejector: state.login,
        }),
        pullNumber: state.pullRequest.number,
      });

      setActionState({
        type: "success",
        message: t("result.registrationRejected", {
          number: state.pullRequest.number,
        }),
      });
      setReloadToken((current) => current + 1);
    } catch (error) {
      setActionState({
        type: "error",
        message: formatRuntimeError(
          error,
          t("registrationDetail.actions.actionFailed"),
        ),
      });
    }
  }

  if (state.type === "loading") {
    return <LoadingState message={t("registrationDetail.states.loading")} />;
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
        message={t("registrationDetail.states.noSession")}
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
            {t("registrationDetail.actions.backToApprovals")}
          </Link>
        }
        message={t("registrationDetail.states.notFound", {
          pullNumber: state.pullNumber,
        })}
      />
    );
  }

  if (state.type === "error") {
    return <ErrorState message={state.message} />;
  }

  const isBusy = actionState.type === "running";
  const isActionable =
    state.pullRequest.state === "open" &&
    !["MERGED", "REJECTED", "CLOSED"].includes(state.reviewState);

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          subtitle={t("registrationDetail.subtitle", {
            pullNumber: state.pullRequest.number,
          })}
          title={t("registrationDetail.title")}
        />
        <div className="space-y-1 text-right">
          <div className="flex flex-wrap justify-end gap-2">
            <Link
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bp-graphite"
              to="/approvals"
            >
              {t("registrationDetail.actions.backToApprovals")}
            </Link>
            <a
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bp-graphite"
              href={state.pullRequest.url}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              {t("actions.openSourceRequest")}
            </a>
            <button
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bp-graphite"
              disabled={isBusy}
              onClick={() => setReloadToken((current) => current + 1)}
              type="button"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {t("actions.refresh")}
            </button>
          </div>
          <p className="text-xs text-bp-muted">
            {t("registrationDetail.states.githubLagHint")}
          </p>
        </div>
      </div>

      <DetailActionBanner state={actionState} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-4">
          <RegistrationSummaryPanel
            pullRequest={state.pullRequest}
            repository={state.repository}
            reviewState={state.reviewState}
            summary={state.summary}
          />
          <RegistrationFileSummaryPanel files={state.files} />
        </div>
        <aside className="space-y-4">
          <RegistrationChecklistPanel summary={state.summary} />
          <RegistrationReviewPanel
            decision={state.decision}
            reviewState={state.reviewState}
          />
          <RegistrationActionPanel
            actionState={actionState}
            actionable={isActionable}
            onApprove={() => void approveRegistration()}
            onReject={() => void rejectRegistration()}
            reviewState={state.reviewState}
          />
        </aside>
      </div>
    </section>
  );
}

function RegistrationSummaryPanel({
  pullRequest,
  repository,
  reviewState,
  summary,
}: {
  pullRequest: RepositoryPullRequest;
  repository: string;
  reviewState: RegistrationReviewState;
  summary: RegistrationRequestBodySummary;
}) {
  const { t } = useTranslation("approvals");

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-bp-git" aria-hidden="true" />
          <h2 className="text-base font-bold text-bp-graphite">
            #{pullRequest.number} {pullRequest.title}
          </h2>
        </div>
        <ReviewStateBadge state={reviewState} />
      </div>

      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <DetailMeta label={t("fields.repository")} value={repository} />
        <DetailMeta
          label={t("fields.author")}
          value={pullRequest.author || t("values.unknown")}
        />
        <DetailMeta label={t("fields.head")} value={pullRequest.head} />
        <DetailMeta label={t("fields.base")} value={pullRequest.base} />
      </dl>

      {summary.kind === "batch" ? (
        <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-3">
          <DetailMeta
            label={t("fields.batchId")}
            value={summary.batchId || t("values.unknown")}
          />
          <DetailMeta
            label={t("fields.workflow")}
            value={summary.workflowPath || t("values.unknown")}
          />
          <DetailMeta
            label={t("fields.runsOn")}
            value={summary.runsOn || t("values.unknown")}
          />
          <DetailMeta
            label={t("fields.command")}
            value={summary.batchCommand || t("values.unknown")}
          />
          <DetailMeta
            label={t("fields.scheduleCount")}
            value={String(summary.schedules.length)}
          />
          <DetailMeta
            label={t("fields.scheduleDeletionCount")}
            value={String(summary.deletedSchedules.length)}
          />
        </div>
      ) : (
        <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-3">
          <DetailMeta
            label={t("fields.batchId")}
            value={summary.batchId || t("values.unknown")}
          />
          <DetailMeta
            label={t("fields.scheduleId")}
            value={summary.scheduleId || t("values.unknown")}
          />
          <DetailMeta
            label={t("fields.schedulePath")}
            value={summary.definitionPath || t("values.unknown")}
          />
          <DetailMeta
            label={t("fields.cron")}
            value={summary.cron || t("values.unknown")}
          />
          <DetailMeta
            label={t("fields.timezone")}
            value={summary.timezone || t("values.unknown")}
          />
          <DetailMeta
            label={t("fields.enabled")}
            value={summary.enabled ? t("values.enabled") : t("values.disabled")}
          />
        </div>
      )}

      {summary.kind === "batch" && summary.schedules.length > 0 ? (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="text-xs font-semibold uppercase text-bp-muted">
            {t("fields.schedules")}
          </p>
          <ul className="mt-2 space-y-2">
            {summary.schedules.map((schedule) => (
              <li
                className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-bp-graphite"
                key={schedule.scheduleId}
              >
                <div className="font-semibold">{schedule.name}</div>
                <div className="mt-1 font-mono text-xs text-bp-muted">
                  {schedule.scheduleId}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {summary.kind === "batch" && summary.deletedSchedules.length > 0 ? (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="text-xs font-semibold uppercase text-bp-muted">
            {t("fields.deletedSchedules")}
          </p>
          <ul className="mt-2 space-y-2">
            {summary.deletedSchedules.map((schedule) => (
              <li
                className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                key={schedule.scheduleId}
              >
                <div className="font-semibold">{schedule.name}</div>
                <div className="mt-1 font-mono text-xs text-amber-800/80">
                  {schedule.scheduleId}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}

function RegistrationFileSummaryPanel({
  files,
}: {
  files: RegistrationFileSummary[];
}) {
  const { t } = useTranslation("approvals");

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-bp-graphite">
        {t("registrationDetail.fileSummary.title")}
      </h2>
      <p className="mt-1 text-sm text-bp-muted">
        {t("registrationDetail.fileSummary.subtitle")}
      </p>
      <div className="mt-4 space-y-3">
        {files.map((file) => (
          <section
            className="rounded-md border border-slate-200 bg-slate-50 p-3"
            key={file.path}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FileCode2
                  className="h-4 w-4 text-bp-muted"
                  aria-hidden="true"
                />
                <p className="font-mono text-xs text-bp-graphite">
                  {file.path}
                </p>
              </div>
              <FileStatusBadge status={file.status} />
            </div>
            {file.patch || file.baseContent || file.headContent ? (
              <details className="mt-2" open={file.status !== "UNCHANGED"}>
                <summary className="cursor-pointer text-xs font-semibold text-bp-control">
                  {t("registrationDetail.fileSummary.preview")}
                </summary>
                {file.patch ? (
                  <div className="mt-2">
                    <RevisionPreview
                      content={file.patch}
                      emptyText=""
                      title={t("registrationDetail.fileSummary.patch")}
                    />
                  </div>
                ) : (
                  <div className="mt-2 grid gap-2 lg:grid-cols-2">
                    <RevisionPreview
                      content={file.baseContent}
                      emptyText={t("registrationDetail.fileSummary.emptyBase")}
                      title={t("registrationDetail.fileSummary.baseRevision")}
                    />
                    <RevisionPreview
                      content={file.headContent}
                      emptyText={t("registrationDetail.fileSummary.emptyHead")}
                      title={t("registrationDetail.fileSummary.headRevision")}
                    />
                  </div>
                )}
              </details>
            ) : null}
          </section>
        ))}
      </div>
    </article>
  );
}

function RegistrationChecklistPanel({
  summary,
}: {
  summary: RegistrationRequestBodySummary;
}) {
  const { t } = useTranslation("approvals");
  const checks = useMemo(() => {
    if (summary.kind === "schedule") {
      return [
        {
          ready: Boolean(
            summary.batchId && summary.scheduleId && summary.definitionPath,
          ),
          text: t("registrationDetail.checklist.schedulePath"),
        },
        {
          ready: Boolean(summary.cron),
          text: t("registrationDetail.checklist.cronRecorded"),
        },
        {
          ready: Boolean(summary.timezone),
          text: t("registrationDetail.checklist.timezoneRecorded"),
        },
        {
          ready: Boolean(summary.enabled || !summary.enabled),
          text: t("registrationDetail.checklist.enabledRecorded"),
        },
      ];
    }

    return [
      {
        ready: Boolean(summary.batchId && summary.workflowPath),
        text: t("registrationDetail.checklist.batchPaths"),
      },
      {
        ready: summary.gateRequired,
        text: t("registrationDetail.checklist.gateRequired"),
      },
      {
        ready: Boolean(summary.runsOn),
        text: t("registrationDetail.checklist.runnerRecorded"),
      },
      {
        ready: Boolean(summary.batchCommand),
        text: t("registrationDetail.checklist.commandRecorded"),
      },
      {
        ready: !summary.schedules.some(
          (schedule) =>
            !schedule.scheduleId ||
            !schedule.definitionPath ||
            !schedule.cron ||
            !schedule.timezone,
        ),
        text: t("registrationDetail.checklist.scheduleDefinitionsRecorded", {
          count: summary.schedules.length,
        }),
      },
      {
        ready: !summary.deletedSchedules.some(
          (schedule) => !schedule.scheduleId || !schedule.definitionPath,
        ),
        text: t("registrationDetail.checklist.scheduleDeletionsRecorded", {
          count: summary.deletedSchedules.length,
        }),
      },
    ];
  }, [summary, t]);

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-bp-graphite">
        {t("registrationDetail.checklist.title")}
      </h2>
      <ul className="mt-3 space-y-2">
        {checks.map((check) => (
          <li className="flex items-start gap-2 text-sm" key={check.text}>
            {check.ready ? (
              <CheckCircle2
                className="mt-0.5 h-4 w-4 text-emerald-600"
                aria-hidden="true"
              />
            ) : (
              <XCircle
                className="mt-0.5 h-4 w-4 text-red-600"
                aria-hidden="true"
              />
            )}
            <span className="text-bp-graphite">{check.text}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function RegistrationReviewPanel({
  decision,
  reviewState,
}: {
  decision: RegistrationApprovalDecision | null;
  reviewState: RegistrationReviewState;
}) {
  const { t } = useTranslation("approvals");

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-bp-graphite">
        {t("registrationDetail.review.title")}
      </h2>
      <p className="mt-2 text-sm font-semibold text-bp-graphite">
        {t(`registrationDetail.review.states.${reviewState}`)}
      </p>
      {decision ? (
        <dl className="mt-3 grid gap-2 text-sm">
          <DetailMeta
            label={t("registrationDetail.review.decision")}
            value={decision.decision}
          />
          <DetailMeta
            label={t("registrationDetail.review.actor")}
            value={decision.actor}
          />
          <DetailMeta
            label={t("registrationDetail.review.decidedAt")}
            value={decision.decidedAt}
          />
        </dl>
      ) : (
        <p className="mt-3 text-sm text-bp-muted">
          {t("registrationDetail.review.noEvidence")}
        </p>
      )}
    </article>
  );
}

function RegistrationActionPanel({
  actionState,
  actionable,
  onApprove,
  onReject,
  reviewState,
}: {
  actionState: ActionState;
  actionable: boolean;
  onApprove: () => void;
  onReject: () => void;
  reviewState: RegistrationReviewState;
}) {
  const { t } = useTranslation("approvals");
  const isBusy = actionState.type === "running";

  if (!actionable) {
    return (
      <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-bp-graphite">
          {t("registrationDetail.actions.closedTitle")}
        </h2>
        <p className="mt-2 text-sm font-semibold text-bp-muted">
          {t(`registrationDetail.review.states.${reviewState}`)}
        </p>
      </article>
    );
  }

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-bp-graphite">
        {t("registrationDetail.actions.title")}
      </h2>
      <p className="mt-2 text-sm text-bp-muted">
        {t("registrationDetail.actions.note")}
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          className="inline-flex items-center gap-2 rounded-md bg-bp-control px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          disabled={isBusy}
          onClick={onApprove}
          type="button"
        >
          {isBusy && actionState.action === "approve" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          )}
          {t("registrationDetail.actions.approve")}
        </button>
        <button
          className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 disabled:cursor-not-allowed disabled:text-slate-400"
          disabled={isBusy}
          onClick={onReject}
          type="button"
        >
          {isBusy && actionState.action === "reject" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <XCircle className="h-4 w-4" aria-hidden="true" />
          )}
          {t("actions.reject")}
        </button>
      </div>
    </article>
  );
}

function ReviewStateBadge({ state }: { state: RegistrationReviewState }) {
  const { t } = useTranslation("approvals");
  const styleMap = {
    APPROVED_PENDING_MERGE: "bg-amber-100 text-amber-800",
    CLOSED: "bg-slate-100 text-slate-700",
    MERGED: "bg-emerald-100 text-emerald-800",
    OPEN: "bg-blue-100 text-blue-800",
    REJECTED: "bg-red-100 text-red-800",
  } as const;

  return (
    <span
      className={`rounded-md px-2.5 py-1 text-xs font-semibold ${styleMap[state]}`}
    >
      {t(`registrationDetail.review.states.${state}`)}
    </span>
  );
}

function FileStatusBadge({
  status,
}: {
  status: RegistrationFileSummary["status"];
}) {
  const { t } = useTranslation("approvals");
  const styleMap = {
    ADDED: "bg-emerald-100 text-emerald-700",
    MISSING_HEAD: "bg-red-100 text-red-700",
    UNCHANGED: "bg-slate-100 text-slate-700",
    UPDATED: "bg-amber-100 text-amber-700",
  } as const;

  return (
    <span
      className={`rounded-md px-2.5 py-1 text-xs font-semibold ${styleMap[status]}`}
    >
      {t(`registrationDetail.fileSummary.status.${status}`)}
    </span>
  );
}

function RevisionPreview({
  content,
  emptyText,
  title,
}: {
  content: string;
  emptyText: string;
  title: string;
}) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-2">
      <h4 className="text-xs font-semibold text-bp-muted">{title}</h4>
      {content ? (
        <pre className="mt-1 max-h-52 overflow-auto whitespace-pre-wrap rounded-md bg-bp-graphite p-2 text-xs leading-5 text-white">
          {content}
        </pre>
      ) : (
        <p className="mt-1 text-xs text-bp-muted">{emptyText}</p>
      )}
    </section>
  );
}

function DetailMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 px-3 py-2">
      <dt className="text-xs font-semibold uppercase tracking-normal text-bp-muted">
        {label}
      </dt>
      <dd className="mt-1 break-all font-mono text-xs text-bp-graphite">
        {value || "-"}
      </dd>
    </div>
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

async function loadRegistrationFiles(
  runtime: BatchPlaneRuntimePorts,
  pullRequest: RepositoryPullRequest,
  summary: RegistrationRequestBodySummary,
): Promise<RegistrationFileSummary[]> {
  const paths = deriveRegistrationFilePaths(summary);
  const pullRequestFiles = await runtime.approvals.listRegistrationRequestFiles(
    {
      pullNumber: pullRequest.number,
    },
  );
  const pullRequestFileByPath = new Map(
    pullRequestFiles.map((file) => [file.path, file]),
  );
  const pathsToLoad = [
    ...new Set([...paths, ...pullRequestFiles.map((file) => file.path)]),
  ];
  const files = await Promise.all(
    pathsToLoad.map(async (path) => {
      const [baseFile, headFile] = await Promise.all([
        runtime.approvals.readRegistrationRequestFile({
          path,
          ref: pullRequest.base,
        }),
        runtime.approvals.readRegistrationRequestFile({
          path,
          ref: pullRequest.head,
        }),
      ]);

      return toRegistrationFileSummary(
        path,
        baseFile,
        headFile,
        pullRequestFileByPath.get(path),
      );
    }),
  );

  return files;
}

function toRegistrationFileSummary(
  path: string,
  baseFile: RepositoryFile | null,
  headFile: RepositoryFile | null,
  pullRequestFile?: RepositoryPullRequestFile,
): RegistrationFileSummary {
  const status = pullRequestFile
    ? toRegistrationFileStatus(pullRequestFile.status)
    : null;

  if (!headFile) {
    return {
      baseContent: baseFile?.content || "",
      headContent: "",
      patch: pullRequestFile?.patch || "",
      path,
      status: status ?? "MISSING_HEAD",
    };
  }

  if (!baseFile) {
    return {
      baseContent: "",
      headContent: headFile.content,
      patch: pullRequestFile?.patch || "",
      path,
      status: status ?? "ADDED",
    };
  }

  return {
    baseContent: baseFile.content,
    headContent: headFile.content,
    patch: pullRequestFile?.patch || "",
    path,
    status:
      status ??
      (baseFile.content === headFile.content
        ? "UNCHANGED"
        : ("UPDATED" as const)),
  };
}

function toRegistrationFileStatus(
  status: RepositoryPullRequestFile["status"],
): RegistrationFileSummary["status"] {
  if (status === "added") {
    return "ADDED";
  }

  if (status === "removed") {
    return "MISSING_HEAD";
  }

  if (status === "unchanged") {
    return "UNCHANGED";
  }

  return "UPDATED";
}
