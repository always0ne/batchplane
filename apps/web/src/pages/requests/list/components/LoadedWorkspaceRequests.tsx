import type { RequestInventoryItem } from "@batchplane/ui-client";
import { useMemo, useState } from "react";
import {
  countRequests,
  matchesRequestFilters,
  type RequestKindFilter,
  type RequestStatusFilter,
} from "../request-list-display";
import { RequestFilters } from "./RequestFilters";
import { RequestResults } from "./RequestResults";

export function LoadedWorkspaceRequests({
  items,
}: {
  items: RequestInventoryItem[];
}) {
  const [kindFilter, setKindFilter] = useState<RequestKindFilter>("all");
  const [statusFilter, setStatusFilter] = useState<RequestStatusFilter>("all");
  const [query, setQuery] = useState("");
  const counts = useMemo(() => countRequests(items), [items]);
  const filteredItems = useMemo(
    () =>
      items.filter((item) =>
        matchesRequestFilters(item, { kindFilter, query, statusFilter }),
      ),
    [items, kindFilter, query, statusFilter],
  );

  return (
    <div className="space-y-4">
      <RequestFilters
        counts={counts}
        kindFilter={kindFilter}
        onKindChange={setKindFilter}
        onQueryChange={setQuery}
        onStatusChange={setStatusFilter}
        query={query}
        statusFilter={statusFilter}
        total={items.length}
      />
      <RequestResults items={filteredItems} />
    </div>
  );
}
