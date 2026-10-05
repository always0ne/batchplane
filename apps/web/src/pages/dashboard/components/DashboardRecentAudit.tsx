import type { DashboardSummary } from "@batchplane/ui-client";
import { useTranslation } from "react-i18next";
import { formatAuditSummary } from "../../audit/audit-summary";

export function DashboardRecentAudit({
  items,
}: {
  items: DashboardSummary["auditItems"];
}) {
  const { t } = useTranslation("dashboard");

  return (
    <article
      className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
      id="recent-audit"
    >
      <h2 className="text-lg font-semibold text-bp-graphite">
        {t("audit.title")}
      </h2>
      <p className="mt-2 text-sm text-bp-muted">{t("audit.subtitle")}</p>
      {items.length === 0 ? (
        <p className="mt-5 rounded-md bg-slate-50 px-3 py-2 text-sm font-medium text-bp-muted">
          {t("audit.empty")}
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-slate-100">
          {items.map((item) => (
            <li className="py-3" key={item.itemId}>
              <p className="text-sm font-semibold text-bp-graphite">
                {formatAuditSummary(item, t)}
              </p>
              <p className="mt-1 text-xs font-semibold text-bp-muted">
                {item.actor} - {item.occurredAt}
              </p>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
