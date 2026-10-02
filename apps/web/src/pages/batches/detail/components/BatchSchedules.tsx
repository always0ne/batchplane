import type { BatchScheduleDisplay } from "@batchplane/ui-client";
import { useTranslation } from "react-i18next";

import { BatchDetailFact } from "./BatchDetailFact";

export function BatchSchedules({
  schedules,
}: {
  schedules: BatchScheduleDisplay[];
}) {
  const { t } = useTranslation("batches");

  return (
    <section className="mt-5 border-t border-slate-100 pt-5">
      <h3 className="text-sm font-bold text-bp-graphite">
        {t("detail.schedules.title")}
      </h3>
      <p className="mt-1 text-sm text-bp-muted">
        {t("detail.schedules.subtitle")}
      </p>
      <p className="mt-2 text-sm font-medium text-bp-muted">
        {t("detail.schedules.managementHint")}
      </p>
      {schedules.length === 0 ? (
        <p className="mt-4 text-sm text-bp-muted">
          {t("detail.schedules.empty")}
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {schedules.map((schedule) => (
            <li
              className="rounded-md border border-slate-200 bg-slate-50 p-4"
              key={schedule.scheduleId}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words text-sm font-bold text-bp-graphite">
                    {schedule.name}
                  </p>
                  <p className="mt-1 break-all font-mono text-xs text-bp-muted">
                    {schedule.scheduleId}
                  </p>
                </div>
                <span className="rounded-md bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-700">
                  {schedule.enabled
                    ? t("detail.schedules.enabled")
                    : t("detail.schedules.disabled")}
                </span>
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
                <BatchDetailFact
                  label={t("detail.schedules.fields.cron")}
                  value={schedule.cron}
                />
                <BatchDetailFact
                  label={t("detail.schedules.fields.timezone")}
                  value={schedule.timezone}
                />
                <BatchDetailFact
                  label={t("detail.schedules.fields.generatedCron")}
                  value={schedule.generatedCron}
                />
              </dl>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
