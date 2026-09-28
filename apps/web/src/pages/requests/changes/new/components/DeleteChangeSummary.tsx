import { useTranslation } from "react-i18next";

export function DeleteChangeSummary({
  batchId,
  name,
  scheduleCount,
}: {
  batchId: string;
  name: string;
  scheduleCount: number;
}) {
  const { t } = useTranslation("registration");
  const summary = [
    { field: "form.batchId", value: batchId },
    { field: "form.name", value: name },
    { field: "form.schedules.title", value: String(scheduleCount) },
  ];

  return (
    <article className="rounded-lg border border-rose-200 bg-rose-50 p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-bp-graphite">
        {t("delete.summaryTitle")}
      </h2>
      <p className="mt-2 text-sm text-bp-muted">{t("delete.summaryBody")}</p>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        {summary.map(({ field, value }) => (
          <div className="rounded-md bg-white px-3 py-2" key={field}>
            <dt className="text-xs font-semibold uppercase text-bp-muted">
              {t(field)}
            </dt>
            <dd className="mt-1 break-all font-mono text-xs text-bp-graphite">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </article>
  );
}
