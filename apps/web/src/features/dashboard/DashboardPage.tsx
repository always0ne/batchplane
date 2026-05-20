import type {
  AuditTimelineItem,
  BatchDefinition,
  BatchTrailRuntimePorts,
  Repository,
  RepositoryIssue,
  RepositoryIssueComment,
  RepositoryPullRequest,
  RepositoryUser,
  RuntimeInstallationStatus,
} from "@batchtrail/domain";
import {
  AlertTriangle,
  ClipboardCheck,
  GitBranch,
  History,
  ShieldAlert,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  isRegistrationApprovalRequest,
  parseExecutionApprovalRequest,
} from "../approvals/approval-model";
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

type DashboardState =
  | { type: "loading" }
  | { type: "no-session" }
  | { type: "loaded"; summary: DashboardSummary }
  | { type: "error"; message: string };

type DashboardSummary = {
  auditItems: AuditTimelineItem[];
  batches: BatchDefinition[];
  defaultBranch: string;
  executionIssues: RepositoryIssue[];
  failedIssues: RepositoryIssue[];
  gateBlockedIssues: RepositoryIssue[];
  installationStatus: RuntimeInstallationStatus;
  pendingExecutionIssues: RepositoryIssue[];
  pendingRegistrationRequests: RepositoryPullRequest[];
  repository: Repository;
  user: RepositoryUser;
};

type DashboardPageProps = {
  createRuntime?: (session: GitHubSession) => BatchTrailRuntimePorts;
  readSession?: () => GitHubSession | null;
};

type DashboardCard = {
  icon: LucideIcon;
  key: string;
  tone: "danger" | "neutral" | "success" | "warning";
  to?: string;
  value: string | number;
};

export function DashboardPage({
  createRuntime = createBatchTrailRuntime,
  readSession = readRuntimeSession,
}: DashboardPageProps = {}) {
  const { t } = useTranslation("dashboard");
  const [state, setState] = useState<DashboardState>({ type: "loading" });

  useEffect(() => {
    let ignoreResult = false;

    async function loadDashboard() {
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
        const [
          installationStatus,
          batches,
          registrationRequests,
          executionIssues,
          auditItems,
        ] = await Promise.all([
          runtime.settings.checkInstallationStatus({
            ref: repository.defaultBranch,
          }),
          runtime.batches.listBatchDefinitions({
            ref: repository.defaultBranch,
          }),
          runtime.approvals.listRegistrationRequests({
            baseBranch: repository.defaultBranch,
          }),
          runtime.approvals.listExecutionRequestIssues(),
          runtime.audit.listAuditTimeline({ limit: 5 }),
        ]);

        const executionIssueComments = await Promise.all(
          executionIssues.map((issue) =>
            runtime.approvals.listExecutionRequestComments({
              issueNumber: issue.number,
            }),
          ),
        );

        if (ignoreResult) {
          return;
        }

        const pendingExecutionIssues = executionIssues.filter((issue, index) =>
          isPendingExecutionApprovalIssue(
            issue,
            executionIssueComments[index] ?? [],
          ),
        );
        const pendingRegistrationRequests = registrationRequests.filter(
          isRegistrationApprovalRequest,
        );

        setState({
          type: "loaded",
          summary: {
            auditItems,
            batches,
            defaultBranch: repository.defaultBranch,
            executionIssues,
            failedIssues: executionIssues.filter((issue) =>
              issue.labels.includes("batchtrail:dispatch-failed"),
            ),
            gateBlockedIssues: executionIssues.filter((issue) =>
              issue.labels.includes("batchtrail:gate-blocked"),
            ),
            installationStatus,
            pendingExecutionIssues,
            pendingRegistrationRequests,
            repository,
            user,
          },
        });
      } catch (error) {
        if (!ignoreResult) {
          setState({
            type: "error",
            message: formatRuntimeError(error, t("states.error")),
          });
        }
      }
    }

    void loadDashboard();

    return () => {
      ignoreResult = true;
    };
  }, [createRuntime, readSession, t]);

  return (
    <section>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <DashboardContent state={state} />
    </section>
  );
}

function DashboardContent({ state }: { state: DashboardState }) {
  const { t } = useTranslation("dashboard");

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

  return <LoadedDashboard summary={state.summary} />;
}

function LoadedDashboard({ summary }: { summary: DashboardSummary }) {
  const { t } = useTranslation("dashboard");
  const cards = createDashboardCards(summary, {
    actionRequired: t("values.actionRequired"),
    ready: t("values.ready"),
  });
  const pendingApprovals =
    summary.pendingExecutionIssues.length +
    summary.pendingRegistrationRequests.length;

  return (
    <div className="space-y-4">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-bt-graphite">
                {t("connection.title")}
              </h2>
              <p className="mt-2 text-sm text-bt-muted">
                {summary.repository.owner}/{summary.repository.repo}
              </p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              {t("connection.connected")}
            </span>
          </div>
          <dl className="mt-5 grid gap-4 sm:grid-cols-3">
            <DashboardFact
              label={t("connection.user")}
              value={`@${summary.user.login}`}
            />
            <DashboardFact
              label={t("connection.defaultBranch")}
              value={summary.defaultBranch}
            />
            <DashboardFact
              label={t("connection.batches")}
              value={summary.batches.length.toLocaleString()}
            />
          </dl>
        </article>
        <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-bt-graphite">
            {t("readiness.title")}
          </h2>
          <p className="mt-2 text-sm text-bt-muted">
            {summary.installationStatus.installed
              ? t("readiness.installed")
              : t("readiness.missing", {
                  count: summary.installationStatus.missingPaths.length,
                })}
          </p>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-bt-control"
              style={{
                width: `${calculateReadinessPercent(summary.installationStatus)}%`,
              }}
            />
          </div>
          <p className="mt-3 text-xs font-semibold text-bt-muted">
            {t("readiness.paths", {
              present: summary.installationStatus.presentPaths.length,
              total: summary.installationStatus.requiredPaths.length,
            })}
          </p>
        </article>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => (
          <DashboardCardView card={card} key={card.key} />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-bt-graphite">
                {t("approvals.title")}
              </h2>
              <p className="mt-2 text-sm text-bt-muted">
                {t("approvals.summary", { count: pendingApprovals })}
              </p>
            </div>
            <Link
              className="text-sm font-semibold text-bt-control underline"
              to="/approvals"
            >
              {t("actions.viewApprovals")}
            </Link>
          </div>
          {pendingApprovals === 0 ? (
            <p className="mt-5 rounded-md bg-slate-50 px-3 py-2 text-sm font-medium text-bt-muted">
              {t("approvals.empty")}
            </p>
          ) : (
            <ul className="mt-5 divide-y divide-slate-100">
              {[
                ...summary.pendingRegistrationRequests.map((request) => ({
                  key: `registration-${request.number}`,
                  meta: t("approvals.registration"),
                  title: `#${request.number} ${request.title}`,
                  url: request.url,
                })),
                ...summary.pendingExecutionIssues.map((issue) => ({
                  key: `execution-${issue.number}`,
                  meta: t("approvals.execution"),
                  title: `#${issue.number} ${issue.title}`,
                  url: issue.url,
                })),
              ]
                .slice(0, 4)
                .map((item) => (
                  <li className="py-3" key={item.key}>
                    <a
                      className="text-sm font-semibold text-bt-graphite hover:text-bt-control"
                      href={item.url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {item.title}
                    </a>
                    <p className="mt-1 text-xs font-semibold text-bt-muted">
                      {item.meta}
                    </p>
                  </li>
                ))}
            </ul>
          )}
        </article>

        <article
          className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
          id="recent-audit"
        >
          <h2 className="text-lg font-semibold text-bt-graphite">
            {t("audit.title")}
          </h2>
          <p className="mt-2 text-sm text-bt-muted">{t("audit.subtitle")}</p>
          {summary.auditItems.length === 0 ? (
            <p className="mt-5 rounded-md bg-slate-50 px-3 py-2 text-sm font-medium text-bt-muted">
              {t("audit.empty")}
            </p>
          ) : (
            <ul className="mt-5 divide-y divide-slate-100">
              {summary.auditItems.map((item) => (
                <li className="py-3" key={item.itemId}>
                  <p className="text-sm font-semibold text-bt-graphite">
                    {item.summary}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-bt-muted">
                    {item.actor} - {item.occurredAt}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>
    </div>
  );
}

function DashboardFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-bt-muted">{label}</dt>
      <dd className="mt-1 truncate text-sm font-bold text-bt-graphite">
        {value}
      </dd>
    </div>
  );
}

function DashboardCardView({ card }: { card: DashboardCard }) {
  const { t } = useTranslation("dashboard");
  const Icon = card.icon;
  const cardClassName =
    "rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition";
  const toneClassName = {
    danger: "text-red-700",
    neutral: "text-bt-muted",
    success: "text-emerald-700",
    warning: "text-amber-700",
  }[card.tone];

  const content = (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-bt-muted">
          {t(`cards.${card.key}`)}
        </p>
        <Icon className={`h-5 w-5 ${toneClassName}`} aria-hidden="true" />
      </div>
      <p className="mt-4 text-3xl font-bold text-bt-graphite">{card.value}</p>
      <p className="mt-2 text-xs font-semibold text-bt-muted">
        {t(`cardHints.${card.key}`)}
      </p>
    </>
  );

  if (card.to) {
    return (
      <Link
        className={`${cardClassName} hover:border-bt-git hover:shadow-md`}
        to={card.to}
      >
        {content}
      </Link>
    );
  }

  return <article className={cardClassName}>{content}</article>;
}

function createDashboardCards(
  summary: DashboardSummary,
  values: { actionRequired: string; ready: string },
): DashboardCard[] {
  const pendingApprovals =
    summary.pendingExecutionIssues.length +
    summary.pendingRegistrationRequests.length;

  return [
    {
      icon: GitBranch,
      key: "repoReadiness",
      tone: summary.installationStatus.installed ? "success" : "warning",
      to: "/lite/setup",
      value: summary.installationStatus.installed
        ? values.ready
        : values.actionRequired,
    },
    {
      icon: ClipboardCheck,
      key: "pendingApprovals",
      tone: pendingApprovals > 0 ? "warning" : "neutral",
      to: "/approvals",
      value: pendingApprovals,
    },
    {
      icon: AlertTriangle,
      key: "failedRuns",
      tone: summary.failedIssues.length > 0 ? "danger" : "neutral",
      value: summary.failedIssues.length,
    },
    {
      icon: ShieldAlert,
      key: "gateBlocked",
      tone: summary.gateBlockedIssues.length > 0 ? "danger" : "neutral",
      value: summary.gateBlockedIssues.length,
    },
    {
      icon: History,
      key: "auditTrail",
      tone: "neutral",
      to: "#recent-audit",
      value: summary.auditItems.length,
    },
  ];
}

function calculateReadinessPercent(status: RuntimeInstallationStatus): number {
  if (status.requiredPaths.length === 0) {
    return 100;
  }

  return Math.round(
    (status.presentPaths.length / status.requiredPaths.length) * 100,
  );
}

function isPendingExecutionApprovalIssue(
  issue: RepositoryIssue,
  comments: RepositoryIssueComment[],
): boolean {
  return (
    parseExecutionApprovalRequest(issue, comments) !== null &&
    !issue.labels.some((label) =>
      [
        "batchtrail:dispatch-failed",
        "batchtrail:dispatched",
        "batchtrail:dispatching",
        "batchtrail:gate-blocked",
        "batchtrail:rejected",
      ].includes(label),
    )
  );
}
