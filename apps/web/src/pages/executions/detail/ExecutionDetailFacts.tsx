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
  const labelKey = gateVerificationUnknown
    ? "runDetail.status.GATE_VERIFICATION_UNKNOWN"
    : variant === "job"
      ? `runDetail.jobStatus.${status}`
      : `runDetail.status.${status}`;

  return (
    <span className={`w-fit rounded-md px-2 py-1 text-xs font-bold ${palette}`}>
      {t(labelKey)}
    </span>
  );
}

export function DetailFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-white/70 px-3 py-2 ring-1 ring-slate-100">
      <dt className="text-xs font-semibold uppercase tracking-normal text-bp-muted">
        {label}
      </dt>
      <dd className="mt-1 font-mono text-xs font-semibold leading-relaxed text-bp-graphite [overflow-wrap:anywhere]">
        {value}
      </dd>
    </div>
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
