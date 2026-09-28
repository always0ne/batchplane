import { CronExpressionParser } from "cron-parser";

export type CronPreviewResult =
  | { dates: Date[]; ok: true }
  | { errorCode: CronPreviewErrorCode; ok: false };

export type CronPreviewErrorCode =
  | "cronRequired"
  | "invalidCron"
  | "invalidTimezone"
  | "timezoneRequired";

export function getCronPreview(
  cron: string,
  timezone: string,
  currentDate = new Date(),
): CronPreviewResult {
  const trimmedCron = cron.trim();
  const trimmedTimezone = timezone.trim();

  if (!trimmedCron) return { errorCode: "cronRequired", ok: false };
  if (!trimmedTimezone) return { errorCode: "timezoneRequired", ok: false };

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: trimmedTimezone }).format(
      currentDate,
    );
  } catch {
    return { errorCode: "invalidTimezone", ok: false };
  }

  try {
    const interval = CronExpressionParser.parse(trimmedCron, {
      currentDate,
      tz: trimmedTimezone,
    });
    return {
      dates: Array.from({ length: 3 }, () => interval.next().toDate()),
      ok: true,
    };
  } catch {
    return { errorCode: "invalidCron", ok: false };
  }
}
