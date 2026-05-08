import { useTranslation } from "react-i18next";

import { PageHeader } from "../../shared/components/PageHeader";

const rows = [
  {
    batchId: "payment.daily-close",
    environment: "PROD",
    name: "Daily Close",
    status: "ACTIVE",
  },
  {
    batchId: "settlement.monthly",
    environment: "PROD",
    name: "Monthly Settlement",
    status: "ACTIVE",
  },
  {
    batchId: "report.export",
    environment: "STAGE",
    name: "Report Export",
    status: "INACTIVE",
  },
];

export function BatchesPage() {
  const { t } = useTranslation("batches");

  return (
    <section>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead className="bg-slate-50 text-sm text-bt-muted">
            <tr>
              <th className="px-4 py-3 font-semibold">{t("table.batchId")}</th>
              <th className="px-4 py-3 font-semibold">{t("table.name")}</th>
              <th className="px-4 py-3 font-semibold">
                {t("table.environment")}
              </th>
              <th className="px-4 py-3 font-semibold">{t("table.status")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.batchId}>
                <td className="px-4 py-4 font-mono text-sm text-bt-graphite">
                  {row.batchId}
                </td>
                <td className="px-4 py-4 text-sm text-bt-graphite">
                  {row.name}
                </td>
                <td className="px-4 py-4 text-sm text-bt-graphite">
                  {row.environment}
                </td>
                <td className="px-4 py-4 text-sm text-bt-graphite">
                  {row.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
