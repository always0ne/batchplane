import type { ExecutionRequest } from "@batchplane/ui-client";
import { useTranslation } from "react-i18next";
import { executionRequestStatusHelpKey } from "../execution-request-detail-view";

export function StatusBadge({ request }: { request: ExecutionRequest }) {
  const { t } = useTranslation("executionRequests");
  const scheduled = request.triggerType === "SCHEDULE";
  const status = request.status;
  const displayStatus = scheduled ? "SCHEDULE_RECORDED" : status;
  return (
    <span
      className={`shrink-0 rounded-md px-2 py-1 text-xs font-bold ${
        scheduled ? "bg-slate-100 text-slate-700" : statusPalette(status)
      }`}
      title={t(executionRequestStatusHelpKey(request))}
    >
      {t(`detail.status.${displayStatus}`)}
    </span>
  );
}

function statusPalette(status: ExecutionRequest["status"]): string {
  if (status === "REQUESTED") return "bg-amber-50 text-amber-800";
  if (status === "APPROVED" || status === "DISPATCHING")
    return "bg-sky-50 text-sky-800";
  if (status === "DISPATCHED") return "bg-emerald-50 text-emerald-800";
  return "bg-red-50 text-red-800";
}
