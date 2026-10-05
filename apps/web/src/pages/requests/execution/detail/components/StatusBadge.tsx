import type { ExecutionRequest } from "@batchplane/ui-client";
import { useTranslation } from "react-i18next";

export function StatusBadge({
  scheduled,
  status,
}: {
  scheduled: boolean;
  status: ExecutionRequest["status"];
}) {
  const { t } = useTranslation("executionRequests");
  const displayStatus = scheduled ? "SCHEDULE_RECORDED" : status;
  return (
    <span
      className={`shrink-0 rounded-md px-2 py-1 text-xs font-bold ${
        scheduled ? "bg-slate-100 text-slate-700" : statusPalette(status)
      }`}
      title={t(`detail.statusHelp.${displayStatus}`)}
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
