import type { ExecutionRunPresentation as ExecutionRun } from "@batchplane/ui-client";
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

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
