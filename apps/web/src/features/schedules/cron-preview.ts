import { CronExpressionParser } from "cron-parser";

export type CronPreviewResult =
  | { ok: true; dates: Date[] }
  | { ok: false; error: string };

export function getCronPreview(
  cron: string,
  timezone: string,
  count = 3,
  currentDate = new Date(),
): CronPreviewResult {
  const trimmedCron = cron.trim();
  const trimmedTimezone = timezone.trim();

  if (!trimmedCron) {
    return { error: "Cron expression is required.", ok: false };
  }

  if (!trimmedTimezone) {
    return { error: "Timezone is required.", ok: false };
  }

  try {
    validateTimeZone(trimmedTimezone);

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
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Invalid cron expression.",
      ok: false,
    };
  }
}

function validateTimeZone(timeZone: string): void {
  new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
}
