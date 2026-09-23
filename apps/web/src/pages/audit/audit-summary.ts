import type { TFunction } from "i18next";
import type { ExecutionAuditItem } from "@batchplane/ui-client";

export function formatAuditSummary(
  item: ExecutionAuditItem,
  translate: TFunction,
): string {
  let summaryKey: string;
  if (item.execution?.sourceOnly) {
    summaryKey = "SOURCE_RUN_OBSERVED";
  } else if (item.execution) {
    summaryKey = "NATIVE_SCHEDULE_OBSERVED";
  } else {
    summaryKey = item.type;
  }

  return translate(`audit:summaries.${summaryKey}`, {
    ...toAuditSummaryValues(item, translate),
    defaultValue: item.summary,
  });
}

function toAuditSummaryValues(
  item: ExecutionAuditItem,
  translate: (key: string) => string,
): Record<string, string | number> {
  const gateResult = String(item.metadata?.gateResult ?? "");

  return {
    batchId: String(item.metadata?.batchId ?? item.subjectId),
    conclusion: String(item.metadata?.conclusion ?? ""),
    decision: String(item.metadata?.decision ?? ""),
    followUpId: String(item.metadata?.followUpId ?? ""),
    gateResult: gateResult
      ? translate(`audit:values.gateResult.${gateResult}`)
      : "",
    pullNumber: Number(item.metadata?.pullNumber ?? 0),
    reasonCode: String(item.metadata?.reasonCode ?? ""),
    requestId: String(item.metadata?.requestId ?? item.subjectId),
    reviewId: String(item.metadata?.reviewId ?? ""),
    reviewStatus: String(item.metadata?.reviewStatus ?? ""),
    runId: Number(item.metadata?.runId ?? 0),
    runAttempt: Number(item.execution?.runAttempt ?? 1),
    scheduleId: String(item.execution?.scheduleId ?? ""),
    observation: item.execution?.observation
      ? translate(`executions:nativeObservation.${item.execution.observation}`)
      : "",
    selfReview: String(item.metadata?.selfReview ?? ""),
    status: String(item.metadata?.status ?? ""),
  };
}
