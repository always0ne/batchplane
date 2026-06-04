import { CronExpressionParser } from "cron-parser";

export type CronPreviewResult =
  | { ok: true; dates: Date[] }
  | { ok: false; errorCode: CronPreviewErrorCode };

export type CronPreviewErrorCode =
  | "cronRequired"
  | "invalidCron"
  | "invalidTimezone"
  | "timezoneRequired";

export function getCronPreview(
  cron: string,
  timezone: string,
  count = 3,
  currentDate = new Date(),
): CronPreviewResult {
  const trimmedCron = cron.trim();
  const trimmedTimezone = timezone.trim();

  if (!trimmedCron) {
    return { errorCode: "cronRequired", ok: false };
  }

  if (!trimmedTimezone) {
    return { errorCode: "timezoneRequired", ok: false };
  }

  try {
    validateTimeZone(trimmedTimezone);
  } catch {
    return { errorCode: "invalidTimezone", ok: false };
  }

  try {
    const interval = CronExpressionParser.parse(trimmedCron, {
      currentDate,
      tz: trimmedTimezone,
    });
    const dates: Date[] = [];

    for (let index = 0; index < count; index += 1) {
      dates.push(interval.next().toDate());
    }

    return {
      dates,
      ok: true,
    };
  } catch {
    return { errorCode: "invalidCron", ok: false };
  }
}

function validateTimeZone(timeZone: string): void {
  new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
}
