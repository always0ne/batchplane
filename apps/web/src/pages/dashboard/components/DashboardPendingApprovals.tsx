import type { DashboardSummary } from "@batchplane/ui-client";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

export function DashboardPendingApprovals({
  items,
}: {
  items: DashboardSummary["pendingApprovals"];
}) {
  const { t } = useTranslation("dashboard");
  const pendingApprovals = items.length;
  const visibleItems = items.slice(0, 4).map((item) => ({
    key: item.kind + "-" + item.request.requestLocator,
    meta: t(
      item.kind === "EXECUTION"
        ? "approvals.execution"
        : "approvals.registration",
    ),
    title: item.request.sourceLabel + " " + item.title,
    url: item.request.sourceUrl,
  }));

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-bp-graphite">
            {t("approvals.title")}
          </h2>
          <p className="mt-2 text-sm text-bp-muted">
            {t("approvals.summary", { count: pendingApprovals })}
          </p>
        </div>
        <Link
          className="text-sm font-semibold text-bp-control underline"
          to="/approvals"
        >
          {t("actions.viewApprovals")}
        </Link>
      </div>
      {pendingApprovals === 0 ? (
        <p className="mt-5 rounded-md bg-slate-50 px-3 py-2 text-sm font-medium text-bp-muted">
          {t("approvals.empty")}
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-slate-100">
          {visibleItems.map((item) => (
            <li className="py-3" key={item.key}>
              <a
                className="text-sm font-semibold text-bp-graphite hover:text-bp-control"
                href={item.url}
                target="_blank"
                rel="noreferrer"
              >
                {item.title}
              </a>
              <p className="mt-1 text-xs font-semibold text-bp-muted">
                {item.meta}
              </p>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
