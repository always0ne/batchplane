import { useTranslation } from "react-i18next";
import type { CronPreviewResult } from "./cron-preview";

export function ScheduleCronPreview({
  cronPreview,
  locale,
  timezone,
}: {
  cronPreview: CronPreviewResult;
  locale: string;
  timezone: string;
}) {
  const { t } = useTranslation("registration");

  if (!cronPreview.ok) {
    return (
      <p className="mt-3 text-xs font-medium text-rose-700">
        {t(`form.schedules.cronPreviewErrors.${cronPreview.errorCode}`)}
      </p>
    );
  }

  return (
    <div className="mt-3 text-xs text-bp-muted">
      <p className="font-semibold text-bp-graphite">
        {t("form.schedules.cronPreviewTitle")}
      </p>
      <ol className="mt-1 list-decimal space-y-1 pl-5">
        {cronPreview.dates.map((date) => (
          <li key={date.toISOString()}>
            {date.toLocaleString(locale, { timeZone: timezone })}
          </li>
        ))}
      </ol>
    </div>
  );
}
