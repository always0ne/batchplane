import type { ExecutionRunPresentation as ExecutionRun } from "@batchplane/ui-client";
import { useTranslation } from "react-i18next";

export function ExecutionStatusBadge({
  gateVerificationUnknown = false,
  status,
  variant = "execution",
}: {
  gateVerificationUnknown?: boolean;
  status: ExecutionRun["status"];
  variant?: "execution" | "job";
}) {
  const { t } = useTranslation("executionRequests");
  const palette = gateVerificationUnknown
    ? "bg-slate-100 text-slate-700"
    : getRunStatusPalette(status);
  let labelKey = `runDetail.status.${status}`;
  if (gateVerificationUnknown) {
    labelKey = "runDetail.status.GATE_VERIFICATION_UNKNOWN";
  } else if (variant === "job") {
    labelKey = `runDetail.jobStatus.${status}`;
  }

  return (
    <span className={`w-fit rounded-md px-2 py-1 text-xs font-bold ${palette}`}>
      {t(labelKey)}
    </span>
  );
}

function getRunStatusPalette(status: ExecutionRun["status"]): string {
  switch (status) {
    case "QUEUED":
    case "RUNNING":
      return "bg-sky-50 text-sky-800";
    case "SUCCEEDED":
      return "bg-emerald-50 text-emerald-800";
    case "BLOCKED":
      return "bg-orange-50 text-orange-800";
    case "FAILED":
      return "bg-red-50 text-red-800";
    case "CANCELED":
      return "bg-slate-100 text-bp-muted";
    case "UNCONFIRMED":
      return "bg-slate-100 text-slate-700";
  }
}
