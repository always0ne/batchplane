import type { ExecutionRunPresentation as ExecutionRun } from "@batchplane/ui-client";
import { Loader2, ShieldCheck, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getGateReasonDisplayKey } from "../../../../i18n/display-keys";
import { DetailFact } from "./DetailFact";

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
