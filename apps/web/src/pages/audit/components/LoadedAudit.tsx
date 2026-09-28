import type { ExecutionAuditItem as AuditTimelineItem } from "@batchplane/ui-client";
import { useMemo, useState } from "react";
import { uniqueMetadataValues } from "../audit-display";
import { AuditFilters } from "./AuditFilters";
import { AuditEvents } from "./AuditEvents";

export function LoadedAudit({ items }: { items: AuditTimelineItem[] }) {
  const [batchFilter, setBatchFilter] = useState("");
  const [requestFilter, setRequestFilter] = useState("");
  const batchOptions = useMemo(
    () => uniqueMetadataValues(items, "batchId"),
    [items],
  );
  const requestOptions = useMemo(
    () => uniqueMetadataValues(items, "requestId"),
    [items],
  );
  const filteredItems = items.filter((item) => {
    const batchId = String(item.metadata?.batchId ?? "");
    const requestId = String(item.metadata?.requestId ?? "");

    return (
      (!batchFilter || batchId === batchFilter) &&
      (!requestFilter || requestId === requestFilter)
    );
  });

  return (
    <div className="space-y-4">
      <AuditFilters
        batchFilter={batchFilter}
        batchOptions={batchOptions}
        onBatchChange={setBatchFilter}
        onRequestChange={setRequestFilter}
        requestFilter={requestFilter}
        requestOptions={requestOptions}
      />
      <AuditEvents items={filteredItems} />
    </div>
  );
}
