import type { TFunction } from "i18next";
import type { ExecutionAuditItem } from "@batchplane/ui-client";
import type { DashboardSummary } from "@batchplane/ui-client";
import {
  AlertTriangle,
  ClipboardCheck,
  GitBranch,
  History,
  ShieldAlert,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { formatInspectionError } from "../../client/inspection-errors";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../components/PageState";
import type { DashboardState } from "./useDashboard";

type DashboardCard = {
  icon: LucideIcon;
  key: string;
  tone: "danger" | "neutral" | "success" | "warning";
  to?: string;
  value: string | number;
};

export function DashboardContent({ state }: { state: DashboardState }) {
  const { t } = useTranslation("dashboard");

  if (state.type === "loading") {
    return <LoadingState message={t("states.loading")} />;
  }

  if (state.type === "no-session") {
    return (
      <EmptyState
        action={
          <Link
            className="font-semibold text-bp-control underline"
            to="/workspace"
          >
            {t("actions.openSetup")}
          </Link>
        }
        message={t("states.noSession")}
      />
    );
  }

  if (state.type === "error") {
    return (
      <ErrorState
        message={formatInspectionError(state.error, t, "states.error")}
      />
    );
  }

  return <LoadedDashboard summary={state.summary} />;
}

function LoadedDashboard({ summary }: { summary: DashboardSummary }) {
  const { t } = useTranslation("dashboard");
  const cards = createDashboardCards(summary, {
    actionRequired: t("values.actionRequired"),
    ready: t("values.ready"),
  });
  const pendingApprovals = summary.pendingApprovals.length;

  return (
    <div className="space-y-4">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-bp-graphite">
                {t("connection.title")}
              </h2>
              <p className="mt-2 text-sm text-bp-muted">
                {summary.workspace.label}
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
              value={`@${summary.workspace.currentUser}`}
            />
            <DashboardFact
              label={t("connection.defaultBranch")}
              value={summary.workspace.defaultRevision}
            />
            <DashboardFact
              label={t("connection.batches")}
              value={summary.batchCount.toLocaleString()}
            />
          </dl>
        </article>
        <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-bp-graphite">
            {t("readiness.title")}
          </h2>
          <p className="mt-2 text-sm text-bp-muted">
            {summary.installation.installed
              ? t("readiness.installed")
              : t("readiness.missing", {
                  count: summary.installation.missingCount,
                })}
          </p>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-bp-control"
              style={{
                width: `${calculateReadinessPercent(summary.installation)}%`,
              }}
            />
          </div>
          <p className="mt-3 text-xs font-semibold text-bp-muted">
            {t("readiness.paths", {
              present: summary.installation.presentCount,
              total: summary.installation.requiredCount,
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
              <h2 className="text-lg font-semibold text-bp-graphite">
                {t("approvals.title")}
              </h2>
              <p className="mt-2 text-sm text-bp-muted">
                {t("approvals.summary", { count: pendingApprovals })}
              </p>
            </div>
            <Link
              className="text-sm font-semibold text-bp-control underline"
              to="/approvals"
            >
              {t("actions.viewApprovals")}
            </Link>
          </div>
          {pendingApprovals === 0 ? (
            <p className="mt-5 rounded-md bg-slate-50 px-3 py-2 text-sm font-medium text-bp-muted">
              {t("approvals.empty")}
            </p>
          ) : (
            <ul className="mt-5 divide-y divide-slate-100">
              {summary.pendingApprovals
                .map((item) => ({
                  key: item.kind + "-" + item.request.requestLocator,
                  meta: t(
                    item.kind === "EXECUTION"
                      ? "approvals.execution"
                      : "approvals.registration",
                  ),
                  title: item.request.sourceLabel + " " + item.title,
                  url: item.request.sourceUrl,
                }))
                .slice(0, 4)
                .map((item) => (
                  <li className="py-3" key={item.key}>
                    <a
                      className="text-sm font-semibold text-bp-graphite hover:text-bp-control"
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {item.title}
                    </a>
                    <p className="mt-1 text-xs font-semibold text-bp-muted">
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
          <h2 className="text-lg font-semibold text-bp-graphite">
            {t("audit.title")}
          </h2>
          <p className="mt-2 text-sm text-bp-muted">{t("audit.subtitle")}</p>
          {summary.auditItems.length === 0 ? (
            <p className="mt-5 rounded-md bg-slate-50 px-3 py-2 text-sm font-medium text-bp-muted">
              {t("audit.empty")}
            </p>
          ) : (
            <ul className="mt-5 divide-y divide-slate-100">
              {summary.auditItems.map((item) => (
                <li className="py-3" key={item.itemId}>
                  <p className="text-sm font-semibold text-bp-graphite">
                    {formatAuditSummary(item, t)}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-bp-muted">
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
      <dt className="text-xs font-semibold uppercase text-bp-muted">{label}</dt>
      <dd className="mt-1 truncate text-sm font-bold text-bp-graphite">
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
    neutral: "text-bp-muted",
    success: "text-emerald-700",
    warning: "text-amber-700",
  }[card.tone];

  const content = (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-bp-muted">
          {t(`cards.${card.key}`)}
        </p>
        <Icon className={`h-5 w-5 ${toneClassName}`} aria-hidden="true" />
      </div>
      <p className="mt-4 text-3xl font-bold text-bp-graphite">{card.value}</p>
      <p className="mt-2 text-xs font-semibold text-bp-muted">
        {t(`cardHints.${card.key}`)}
      </p>
    </>
  );

  if (card.to) {
    return (
      <Link
        className={`${cardClassName} hover:border-bp-git hover:shadow-md`}
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
  const pendingApprovals = summary.pendingApprovals.length;

  return [
    {
      icon: GitBranch,
      key: "repoReadiness",
      tone: summary.installation.installed ? "success" : "warning",
      to: "/workspace",
      value: summary.installation.installed
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
      to: "/executions/failures?type=failed",
      tone: summary.failedRunCount > 0 ? "danger" : "neutral",
      value: summary.failedRunCount,
    },
    {
      icon: ShieldAlert,
      key: "gateBlocked",
      to: "/executions/failures?type=blocked",
      tone: summary.gateBlockedRunCount > 0 ? "warning" : "neutral",
      value: summary.gateBlockedRunCount,
    },
    {
      icon: History,
      key: "auditTrail",
      tone: "neutral",
      to: "/audit",
      value: summary.auditItems.length,
    },
  ];
}

function calculateReadinessPercent(
  status: DashboardSummary["installation"],
): number {
  if (status.requiredCount === 0) {
    return 100;
  }

  return Math.round((status.presentCount / status.requiredCount) * 100);
}

function formatAuditSummary(
  item: ExecutionAuditItem,
  translate: TFunction,
): string {
  const key = item.execution?.sourceOnly
    ? "SOURCE_RUN_OBSERVED"
    : item.execution
      ? "NATIVE_SCHEDULE_OBSERVED"
      : item.type;
  return translate(`audit:summaries.${key}`, {
    ...toAuditSummaryValues(item, translate),
    defaultValue: item.summary,
  });
}

function toAuditSummaryValues(
  item: ExecutionAuditItem,
  translate: (key: string) => string,
): Record<string, string | number> {
  const gateResult = String(item.metadata?.gateResult ?? "");

  return {
    batchId: String(item.metadata?.batchId ?? item.subjectId),
    conclusion: String(item.metadata?.conclusion ?? ""),
    decision: String(item.metadata?.decision ?? ""),
    followUpId: String(item.metadata?.followUpId ?? ""),
    gateResult: gateResult
      ? translate(`audit:values.gateResult.${gateResult}`)
      : "",
    pullNumber: Number(item.metadata?.pullNumber ?? 0),
    reasonCode: String(item.metadata?.reasonCode ?? ""),
    requestId: String(item.metadata?.requestId ?? item.subjectId),
    reviewId: String(item.metadata?.reviewId ?? ""),
    reviewStatus: String(item.metadata?.reviewStatus ?? ""),
    runId: Number(item.metadata?.runId ?? 0),
    runAttempt: Number(item.execution?.runAttempt ?? 1),
    scheduleId: String(item.execution?.scheduleId ?? ""),
    observation: item.execution?.observation
      ? translate(`executions:nativeObservation.${item.execution.observation}`)
      : "",
    selfReview: String(item.metadata?.selfReview ?? ""),
    status: String(item.metadata?.status ?? ""),
  };
}
