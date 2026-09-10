import type { BatchSchedule } from "@batchplane/domain";

export type ScheduleFormValues = {
  scheduleId: string;
  name: string;
  cron: string;
  timezone: string;
  enabled: boolean;
};

export const defaultScheduleFormValues: ScheduleFormValues = {
  cron: "0 5 * * *",
  enabled: true,
  name: "",
  scheduleId: "",
  timezone: "Asia/Seoul",
};

export function toScheduleFormValues(
  definition: BatchSchedule,
): ScheduleFormValues {
  return {
    cron: definition.cron,
    enabled: definition.enabled,
    name: definition.name,
    scheduleId: definition.scheduleId,
    timezone: definition.timezone,
  };
}

export function toBatchSchedule(values: ScheduleFormValues): BatchSchedule {
  return {
    cron: values.cron.trim(),
    enabled: values.enabled,
    name: values.name.trim(),
    scheduleId: values.scheduleId.trim(),
    timezone: values.timezone.trim(),
  };
}

export function validateScheduleRegistration(
  definition: BatchSchedule,
): string[] {
  const missingFields: string[] = [];

  if (!definition.scheduleId) missingFields.push("scheduleId");
  if (!definition.name) missingFields.push("name");
  if (!definition.cron) missingFields.push("cron");
  if (!definition.timezone) missingFields.push("timezone");

  return missingFields;
}
