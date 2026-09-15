import type { ExecutionRunPresentation as ExecutionRun } from "@batchplane/ui-client";
import {
  AlertTriangle,
  CheckCircle2,
  CircleOff,
  ExternalLink,
  Loader2,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { formatGateReasonDisplay } from "../../i18n/display-keys";

import { isBusinessFailure } from "@batchplane/ui-client";

import type { ExecutionRunListView } from "./ExecutionRunListContent";

export function ExecutionRunRow({
  namespace,
  run,
  view,
}: {
  namespace: "executions" | "failures";
  run: ExecutionRun;
  view: ExecutionRunListView;
}) {
  const { i18n, t } = useTranslation(namespace);
  const display = getRunStatusDisplay(run);
  const Icon = display.icon;
  const detailQuery = new URLSearchParams();
  if (view === "failures") detailQuery.set("from", "failures");
  if (run.evidenceScope === "SOURCE_RUN")
    detailQuery.set("runAttempt", String(run.runAttempt ?? 1));
  const runDetailPath = `/execution-runs/${encodeURIComponent(run.runId)}${detailQuery.size ? `?${detailQuery}` : ""}`;
  const followUpPath =
    view === "failures" ? `${runDetailPath}#failure-follow-up` : runDetailPath;
  const hasFailureFollowUp = (run.failureFollowUps ?? []).length > 0;
  const failureFollowUpStatusKey = getFailureFollowUpStatusKey(run);

  return (
    <li className="grid gap-4 py-4 first:pt-0 last:pb-0 xl:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold ${display.className}`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {getRunStatusLabel(run, t)}
          </span>
          <Link
            className="font-semibold text-bp-graphite hover:text-bp-control"
            to={runDetailPath}
          >
            {run.batchId || t("values.unknownBatch")}
          </Link>
        </div>
        <p className="text-sm font-semibold text-bp-muted">
          {getRunOutcomeText(run, t)}
        </p>
        {view === "failures" && isBusinessFailure(run) ? (
          <p className="w-fit rounded-md bg-red-50 px-2 py-1 text-xs font-bold text-red-800">
            {t(`values.${failureFollowUpStatusKey}`)}
          </p>
        ) : null}
        <dl className="grid gap-3 text-xs md:grid-cols-2">
          <ExecutionRunFact label={t("fields.runId")} value={run.runId} />
          <ExecutionRunFact
            label={t("fields.requestId")}
            value={run.requestId || t("values.unknown")}
          />
          <ExecutionRunFact
            label={t("fields.workflow")}
            value={run.executionTarget?.location || t("values.unknown")}
          />
          <ExecutionRunFact
            label={t("fields.completedAt")}
            value={
              formatRunTimestamp(run.completedAt, i18n.language) ||
              t(
                run.status === "QUEUED" || run.status === "RUNNING"
                  ? "values.inProgress"
                  : "values.unknown",
              )
            }
          />
        </dl>
      </div>
      <div className="flex flex-wrap items-start gap-2 xl:justify-end">
        {view === "failures" && isBusinessFailure(run) ? (
          <Link
            className="inline-flex items-center whitespace-nowrap rounded-md bg-bp-control px-3 py-2 text-sm font-semibold text-white"
            to={followUpPath}
          >
            {hasFailureFollowUp
              ? t("actions.viewFollowUp")
              : t("actions.recordFollowUp")}
          </Link>
        ) : null}
        {run.sourceUrl ? (
          <a
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bp-muted"
            href={run.sourceUrl}
            rel="noreferrer"
            target="_blank"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            {t("actions.githubRun")}
          </a>
        ) : null}
        <Link
          className={[
            "inline-flex items-center whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold",
            view === "failures" && isBusinessFailure(run)
              ? "border border-slate-300 bg-white text-bp-graphite"
              : "bg-bp-control text-white",
          ].join(" ")}
          to={runDetailPath}
        >
          {t("actions.openRun")}
        </Link>
      </div>
    </li>
  );
}

function getFailureFollowUpStatusKey(run: ExecutionRun) {
  const latestFollowUp = (run.failureFollowUps ?? []).at(-1);

  if (!latestFollowUp) {
    return "explanationNeeded";
  }

  if (latestFollowUp.reviewStatus === "APPROVED") {
    return "reviewApproved";
  }

  if (latestFollowUp.reviewStatus === "REJECTED") {
    return "reviewRejected";
  }

  if (latestFollowUp.reviewStatus === "CHANGES_REQUESTED") {
    return "reviewChangesRequested";
  }

  return "reviewAwaiting";
}

function ExecutionRunFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-semibold uppercase tracking-normal text-bp-muted">
        {label}
      </dt>
      <dd
        className="mt-1 break-all font-mono font-semibold text-bp-graphite md:truncate md:break-normal"
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

function isActiveRun(run: ExecutionRun): boolean {
  return run.status === "QUEUED" || run.status === "RUNNING";
}

function formatRunTimestamp(
  value: string | undefined,
  locale: string,
): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    year: "numeric",
  }).format(date);
}

function getRunOutcomeText(
  run: ExecutionRun,
  t: (key: string) => string,
): string {
  if (run.evidenceScope === "SOURCE_RUN")
    return t("values.sourceRunUnconfirmed");
  const native = run.nativeSchedule;
  if (native?.observation === "UNCONFIRMED") {
    return t("values.nativeUnconfirmed");
  }
  if (run.status === "BLOCKED") {
    return formatGateReasonDisplay(
      run.gateDecision?.reasonCode,
      t,
      t("values.gateBlocked"),
    );
  }

  if (run.status === "FAILED") {
    return run.gateDecision?.allowed === true
      ? t("values.businessFailure")
      : t("values.gateVerificationUnknown");
  }

  if (run.status === "SUCCEEDED") {
    return t("values.succeeded");
  }

  if (isActiveRun(run)) {
    return t("values.active");
  }

  if (run.status === "CANCELED") {
    return t("values.canceled");
  }

  return t("values.unknown");
}

function getRunStatusDisplay(run: ExecutionRun): {
  className: string;
  icon: LucideIcon;
} {
  if (run.nativeSchedule?.observation === "UNCONFIRMED") {
    return { className: "bg-slate-100 text-slate-700", icon: CircleOff };
  }
  if (run.status === "FAILED" && !isBusinessFailure(run)) {
    return {
      className: "bg-slate-100 text-slate-700",
      icon: CircleOff,
    };
  }

  switch (run.status) {
    case "BLOCKED":
      return {
        className: "bg-orange-50 text-orange-800",
        icon: ShieldAlert,
      };
    case "CANCELED":
      return {
        className: "bg-slate-100 text-slate-700",
        icon: CircleOff,
      };
    case "UNCONFIRMED":
      return {
        className: "bg-slate-100 text-slate-700",
        icon: CircleOff,
      };
    case "FAILED":
      return {
        className: "bg-red-50 text-red-800",
        icon: AlertTriangle,
      };
    case "QUEUED":
    case "RUNNING":
      return {
        className: "bg-sky-50 text-sky-800",
        icon: Loader2,
      };
    case "SUCCEEDED":
      return {
        className: "bg-emerald-50 text-emerald-800",
        icon: CheckCircle2,
      };
  }
}

function getRunStatusLabel(
  run: ExecutionRun,
  t: (key: string) => string,
): string {
  if (run.evidenceScope === "SOURCE_RUN") return t("status.SOURCE_RUN");
  const native = run.nativeSchedule;
  if (native) return t(`executions:nativeObservation.${native.observation}`);
  return run.status === "FAILED" && !isBusinessFailure(run)
    ? t("status.GATE_VERIFICATION_UNKNOWN")
    : t(`status.${run.status}`);
}
