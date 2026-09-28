import { useMemo, useState } from "react";
import {
  compareWorkItems,
  countWorkItems,
  type WorkKind,
  type WorkRow,
} from "../work-rows";
import { MyWorkFilters } from "./MyWorkFilters";
import { MyWorkQueue } from "./MyWorkQueue";

export function LoadedMyWork({
  currentUser,
  items,
}: {
  currentUser: string;
  items: WorkRow[];
}) {
  const [kindFilter, setKindFilter] = useState<WorkKind | "all">("all");
  const sortedItems = useMemo(() => [...items].sort(compareWorkItems), [items]);
  const counts = useMemo(() => countWorkItems(sortedItems), [sortedItems]);
  const filteredItems = sortedItems.filter(
    (item) => kindFilter === "all" || item.kind === kindFilter,
  );

  return (
    <div className="space-y-4">
      <MyWorkFilters
        counts={counts}
        kindFilter={kindFilter}
        onFilterChange={setKindFilter}
        total={sortedItems.length}
      />
      <MyWorkQueue
        currentUser={currentUser}
        items={filteredItems}
        kindFilter={kindFilter}
        onShowAll={() => setKindFilter("all")}
      />
    </div>
  );
}
