import type { DashboardSummary } from "@batchplane/ui-client";
import { useTranslation } from "react-i18next";
import { createDashboardCards } from "../dashboard-cards";
import { DashboardWorkspaceSummary } from "./DashboardWorkspaceSummary";
import { DashboardCardView } from "./DashboardCardView";
import { DashboardPendingApprovals } from "./DashboardPendingApprovals";
import { DashboardRecentAudit } from "./DashboardRecentAudit";

export function LoadedDashboard({ summary }: { summary: DashboardSummary }) {
  const { t } = useTranslation("dashboard");
  const cards = createDashboardCards(summary, {
    actionRequired: t("values.actionRequired"),
    ready: t("values.ready"),
  });
  return (
    <div className="space-y-4">
      <DashboardWorkspaceSummary summary={summary} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => (
          <DashboardCardView card={card} key={card.key} />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <DashboardPendingApprovals items={summary.pendingApprovals} />
        <DashboardRecentAudit items={summary.auditItems} />
      </section>
    </div>
  );
}
