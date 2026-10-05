import type { ExecutionAuditItem as AuditTimelineItem } from "@batchplane/ui-client";
import { useTranslation } from "react-i18next";
import { formatAuditMetadataValue } from "../audit-display";

export function AuditMetadata({ item }: { item: AuditTimelineItem }) {
  const { t } = useTranslation("audit");
  const entries = [
    ["batchId", item.metadata?.batchId],
    ["requestId", item.metadata?.requestId],
    ["runId", item.metadata?.runId],
    ["runAttempt", item.metadata?.runAttempt],
    ["scheduleId", item.metadata?.scheduleId],
    ["observation", item.metadata?.observation],
    ["gateResult", item.metadata?.gateResult],
    ["status", item.metadata?.status],
    ["reasonCode", item.metadata?.reasonCode],
  ].filter((entry): entry is [string, string | number | boolean] =>
    Boolean(entry[1]),
  );

  if (entries.length === 0) {
    return null;
  }

  return (
    <dl className="mt-3 flex min-w-0 flex-wrap gap-2">
      {entries.map(([key, value]) => (
        <div
          className="min-w-0 max-w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1"
          key={`${item.itemId}-${key}`}
        >
          <dt className="text-[0.65rem] font-bold uppercase text-bp-muted">
            {t(`metadata.${key}`)}
          </dt>
          <dd className="max-w-full break-all text-xs font-semibold text-bp-graphite sm:max-w-72">
            {formatAuditMetadataValue(key, value, t)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
