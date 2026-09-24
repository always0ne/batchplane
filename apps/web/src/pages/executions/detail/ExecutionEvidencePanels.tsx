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
  const display = getGateOutcomeDisplay(run);
  const Icon = display.Icon;

  return (
    <article
      className={`rounded-lg border p-5 shadow-sm ${display.panelClass}`}
    >
      <div className="flex items-center gap-2">
        <Icon className={`h-5 w-5 ${display.iconClass}`} aria-hidden="true" />
        <h2 className={`text-base font-bold ${display.titleClass}`}>
          {t(display.titleKey)}
        </h2>
      </div>
      <p className={`mt-3 text-sm font-semibold ${display.messageClass}`}>
        {t(display.messageKey)}
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
  const { Icon, iconClass } = getBusinessOutcomeIcon(run);
  const messageKey = getBusinessOutcomeMessageKey(run);

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Icon className={`h-5 w-5 ${iconClass}`} aria-hidden="true" />
        <h2 className="text-base font-bold text-bp-graphite">
          {t("runDetail.business.title")}
        </h2>
      </div>
      <p className="mt-3 text-sm font-semibold text-bp-muted">
        {messageKey === "runDetail.business.current"
          ? t(messageKey, {
              status: t(`runDetail.status.${run.status}`),
            })
          : t(messageKey)}
      </p>
    </article>
  );
}

function getGateOutcomeDisplay(run: ExecutionRun) {
  if (run.status === "BLOCKED") {
    return {
      Icon: XCircle,
      iconClass: "text-orange-700",
      messageClass: "text-orange-900",
      messageKey: "runDetail.gate.blockedMessage" as const,
      panelClass: "border-orange-200 bg-orange-50",
      titleClass: "text-orange-950",
      titleKey: "runDetail.gate.blockedTitle" as const,
    };
  }
  if (run.gateDecision?.allowed === true) {
    return {
      Icon: ShieldCheck,
      iconClass: "text-emerald-700",
      messageClass: "text-emerald-900",
      messageKey: "runDetail.gate.allowedMessage" as const,
      panelClass: "border-emerald-200 bg-emerald-50",
      titleClass: "text-emerald-950",
      titleKey: "runDetail.gate.title" as const,
    };
  }
  return {
    Icon: Loader2,
    iconClass: "text-bp-muted",
    messageClass: "text-bp-muted",
    messageKey: "runDetail.gate.noEvidence" as const,
    panelClass: "border-slate-200 bg-slate-50",
    titleClass: "text-bp-graphite",
    titleKey: "runDetail.gate.title" as const,
  };
}

function getBusinessOutcomeIcon(run: ExecutionRun) {
  if (run.status === "FAILED" && run.gateDecision?.allowed === true) {
    return { Icon: AlertTriangle, iconClass: "text-red-700" };
  }
  if (run.status === "SUCCEEDED") {
    return { Icon: CheckCircle2, iconClass: "text-emerald-700" };
  }
  if (run.status === "BLOCKED") {
    return { Icon: XCircle, iconClass: "text-orange-700" };
  }
  if (run.status === "QUEUED" || run.status === "RUNNING") {
    return { Icon: Loader2, iconClass: "text-sky-700" };
  }
  if (run.status === "CANCELED") {
    return { Icon: AlertTriangle, iconClass: "text-slate-500" };
  }
  return { Icon: AlertTriangle, iconClass: "text-sky-700" };
}

function getBusinessOutcomeMessageKey(run: ExecutionRun) {
  if (run.evidenceScope === "SOURCE_RUN") {
    return "runDetail.business.sourceRunUnconfirmed" as const;
  }
  if (run.status === "BLOCKED") return "runDetail.business.notReached" as const;
  if (run.status === "FAILED" && run.gateDecision?.allowed === true) {
    return "runDetail.business.failed" as const;
  }
  if (run.status === "FAILED") {
    return "runDetail.business.verificationUnknown" as const;
  }
  return "runDetail.business.current" as const;
}
