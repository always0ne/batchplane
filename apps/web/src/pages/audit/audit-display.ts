import type { TFunction } from "i18next";
import type { ExecutionAuditItem as AuditTimelineItem } from "@batchplane/ui-client";

export function formatAuditEventType(
  item: AuditTimelineItem,
  translate: TFunction,
): string {
  if (item.execution?.sourceOnly) {
    return translate("executions:status.SOURCE_RUN");
  }

  if (item.execution?.locator) {
    return translate("audit:values.scheduleExecution");
  }

  return translate(`common:status.auditTimelineType.${item.type}`);
}
export function uniqueMetadataValues(
  items: AuditTimelineItem[],
  key: string,
): string[] {
  return [
    ...new Set(
      items
        .map((item) => item.metadata?.[key])
        .filter((value): value is string | number => Boolean(value))
        .map(String),
    ),
  ].sort((left, right) => left.localeCompare(right));
}

export function formatAuditMetadataValue(
  key: string,
  value: string | number | boolean,
  translate: (key: string) => string,
): string {
  if (key === "gateResult") {
    return translate(`values.gateResult.${String(value)}`);
  }
  if (key === "observation") {
    return translate(`executions:nativeObservation.${String(value)}`);
  }

  return String(value);
}

export function formatAuditTime(value: string, fallback: string): string {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? fallback : date.toLocaleString();
}
