import type { DashboardSummary } from "@batchplane/ui-client";
import { ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DashboardFact } from "./DashboardFact";

export function DashboardWorkspaceSummary({
  summary,
}: {
  summary: DashboardSummary;
}) {
  const { t } = useTranslation("dashboard");

  return (
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
  );
}

function calculateReadinessPercent(
  status: DashboardSummary["installation"],
): number {
  if (status.requiredCount === 0) {
    return 100;
  }

  return Math.round((status.presentCount / status.requiredCount) * 100);
}
