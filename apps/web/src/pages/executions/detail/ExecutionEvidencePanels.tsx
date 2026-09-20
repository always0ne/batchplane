import type { ExecutionRunPresentation as ExecutionRun } from "@batchplane/ui-client";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { getGateReasonDisplayKey } from "../../../i18n/display-keys";
import { DetailFact, ExecutionStatusBadge } from "./ExecutionDetailFacts";

export function ExecutionSummaryPanel({ run }: { run: ExecutionRun }) {
  const { t } = useTranslation("executionRequests");

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-bp-git" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-bp-graphite">
            {run.executionTarget?.name || t("runDetail.values.unknownWorkflow")}
          </h2>
        </div>
        <ExecutionStatusBadge
          gateVerificationUnknown={
            run.status === "FAILED" && run.gateDecision?.allowed !== true
          }
          status={run.status}
        />
      </div>
      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <DetailFact
          label={
            run.evidenceScope === "SOURCE_RUN"
              ? t("runDetail.fields.sourceRunId")
              : t("runDetail.fields.executionId")
          }
          value={run.runId}
        />
        <DetailFact
          label={t("runDetail.fields.requestId")}
          value={run.requestId || t("runDetail.values.unknown")}
        />
        <DetailFact
          label={t("runDetail.fields.batchId")}
          value={run.batchId || t("runDetail.values.unknown")}
        />
        <DetailFact
          label={t("runDetail.fields.actor")}
          value={run.actor || t("runDetail.values.unknown")}
        />
        <DetailFact
          label={t("runDetail.fields.workflow")}
          value={run.executionTarget?.location || t("runDetail.values.unknown")}
        />
        <DetailFact
          label={t("runDetail.fields.event")}
          value={run.event || t("runDetail.values.unknown")}
        />
        <DetailFact
          label={t("runDetail.fields.runAttempt")}
          value={String(run.runAttempt ?? 1)}
        />
        <DetailFact
          label={t("runDetail.fields.startedAt")}
          value={run.startedAt || t("runDetail.values.unknown")}
        />
        <DetailFact
          label={t("runDetail.fields.completedAt")}
          value={
            run.completedAt ||
            t(
              run.status === "QUEUED" || run.status === "RUNNING"
                ? "runDetail.values.inProgress"
                : "runDetail.values.unknown",
            )
          }
        />
      </dl>
    </article>
  );
}

export function GateOutcomePanel({ run }: { run: ExecutionRun }) {
  const { t } = useTranslation("executionRequests");
  const blocked = run.status === "BLOCKED";
  const allowed = run.gateDecision?.allowed === true;
  const tone = blocked ? "blocked" : allowed ? "allowed" : "unknown";
  const Icon =
    tone === "blocked" ? XCircle : tone === "allowed" ? ShieldCheck : Loader2;
  const panelClass = {
    allowed: "border-emerald-200 bg-emerald-50",
    blocked: "border-orange-200 bg-orange-50",
    unknown: "border-slate-200 bg-slate-50",
  }[tone];
  const iconClass = {
    allowed: "text-emerald-700",
    blocked: "text-orange-700",
    unknown: "text-bp-muted",
  }[tone];
  const titleClass = {
    allowed: "text-emerald-950",
    blocked: "text-orange-950",
    unknown: "text-bp-graphite",
  }[tone];
  const messageClass = {
    allowed: "text-emerald-900",
    blocked: "text-orange-900",
    unknown: "text-bp-muted",
  }[tone];

  return (
    <article className={`rounded-lg border p-5 shadow-sm ${panelClass}`}>
      <div className="flex items-center gap-2">
        <Icon className={`h-5 w-5 ${iconClass}`} aria-hidden="true" />
        <h2 className={`text-base font-bold ${titleClass}`}>
          {blocked
            ? t("runDetail.gate.blockedTitle")
            : t("runDetail.gate.title")}
        </h2>
      </div>
      <p className={`mt-3 text-sm font-semibold ${messageClass}`}>
        {blocked
          ? t("runDetail.gate.blockedMessage")
          : allowed
            ? t("runDetail.gate.allowedMessage")
            : t("runDetail.gate.noEvidence")}
      </p>
      <dl className="mt-4 grid gap-3 text-sm">
        <DetailFact
          label={t("runDetail.fields.reasonCode")}
          value={run.gateDecision?.reasonCode || t("runDetail.values.none")}
        />
        <DetailFact
          label={t("runDetail.fields.reason")}
          value={
            run.gateDecision?.reasonCode
              ? t(getGateReasonDisplayKey(run.gateDecision.reasonCode))
              : t("runDetail.values.none")
          }
        />
        <DetailFact
          label={t("runDetail.fields.decidedAt")}
          value={run.gateDecision?.decidedAt || t("runDetail.values.unknown")}
        />
      </dl>
    </article>
  );
}

export function BusinessOutcomePanel({ run }: { run: ExecutionRun }) {
  const { t } = useTranslation("executionRequests");
  const businessFailed =
    run.status === "FAILED" && run.gateDecision?.allowed === true;
  const blocked = run.status === "BLOCKED";
  const succeeded = run.status === "SUCCEEDED";
  const inFlight = run.status === "QUEUED" || run.status === "RUNNING";
  const canceled = run.status === "CANCELED";
  const Icon = businessFailed
    ? AlertTriangle
    : succeeded
      ? CheckCircle2
      : blocked
        ? XCircle
        : inFlight
          ? Loader2
          : AlertTriangle;
  const iconClass = businessFailed
    ? "text-red-700"
    : succeeded
      ? "text-emerald-700"
      : blocked
        ? "text-orange-700"
        : canceled
          ? "text-slate-500"
          : "text-sky-700";

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Icon className={`h-5 w-5 ${iconClass}`} aria-hidden="true" />
        <h2 className="text-base font-bold text-bp-graphite">
          {t("runDetail.business.title")}
        </h2>
      </div>
      <p className="mt-3 text-sm font-semibold text-bp-muted">
        {run.evidenceScope === "SOURCE_RUN"
          ? t("runDetail.business.sourceRunUnconfirmed")
          : blocked
            ? t("runDetail.business.notReached")
            : businessFailed
              ? t("runDetail.business.failed")
              : run.status === "FAILED"
                ? t("runDetail.business.verificationUnknown")
                : t("runDetail.business.current", {
                    status: t(`runDetail.status.${run.status}`),
                  })}
      </p>
    </article>
  );
}
