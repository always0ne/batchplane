import type { ExecutionAuditItem as AuditTimelineItem } from "@batchplane/ui-client";
import { useTranslation } from "react-i18next";
import { EmptyState } from "../../../components/EmptyState";
import { AuditEventItem } from "./AuditEventItem";

export function AuditEvents({ items }: { items: AuditTimelineItem[] }) {
  const { t } = useTranslation(["audit", "common"]);
  return (
    <>
      {items.length === 0 ? (
        <EmptyState message={t("audit:states.empty")} />
      ) : (
        <ol className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white shadow-sm">
          {items.map((item) => (
            <AuditEventItem item={item} key={item.itemId} translate={t} />
          ))}
        </ol>
      )}
    </>
  );
}
