import { useTranslation } from "react-i18next";
import type {
  ExecutionFilter,
  ExecutionListView,
} from "./ExecutionListContent";

const executionRunFilters = [
  "all",
  "active",
  "succeeded",
  "failed",
  "blocked",
  "canceled",
] as const;
const failureRunFilters = ["all", "failed", "blocked"] as const;

export function ExecutionListFilters({
  activeFilter,
  namespace,
  onFilterChange,
  view,
}: {
  activeFilter: ExecutionFilter;
  namespace: "executions" | "failures";
  onFilterChange: (filter: ExecutionFilter) => void;
  view: ExecutionListView;
}) {
  const { t } = useTranslation(namespace);
  const filters = view === "failures" ? failureRunFilters : executionRunFilters;
  return (
    <div className="flex flex-wrap gap-2" role="group">
      {filters.map((filter) => (
        <button
          className={[
            "rounded-md border px-3 py-2 text-sm font-semibold",
            filter === activeFilter
              ? "border-bp-control bg-bp-control text-white"
              : "border-slate-300 bg-white text-bp-graphite",
          ].join(" ")}
          key={filter}
          onClick={() => onFilterChange(filter)}
          type="button"
        >
          {t(`filters.${filter}`)}
        </button>
      ))}
    </div>
  );
}
