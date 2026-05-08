import { useTranslation } from "react-i18next";

import { PageHeader } from "../../shared/components/PageHeader";

const cardKeys = [
  "repoReadiness",
  "pendingApprovals",
  "gateBlocked",
  "auditTrail",
] as const;

export function DashboardPage() {
  const { t } = useTranslation("dashboard");

  return (
    <section>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cardKeys.map((key) => (
          <article
            key={key}
            className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
          >
            <p className="text-sm font-medium text-bt-muted">
              {t(`cards.${key}`)}
            </p>
            <p className="mt-4 text-3xl font-bold text-bt-graphite">0</p>
          </article>
        ))}
      </div>
    </section>
  );
}
