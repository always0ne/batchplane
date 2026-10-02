import { useTranslation } from "react-i18next";
import { workKinds, type WorkKind } from "../work-rows";
import { FilterButton } from "./FilterButton";

export function MyWorkFilters({
  counts,
  kindFilter,
  onFilterChange,
  total,
}: {
  counts: Record<WorkKind, number>;
  kindFilter: WorkKind | "all";
  onFilterChange: (kind: WorkKind | "all") => void;
  total: number;
}) {
  const { t } = useTranslation("myWork");
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
      <div className="flex flex-wrap gap-2" role="group">
        <FilterButton
          active={kindFilter === "all"}
          count={total}
          label={t("filters.all")}
          onClick={() => onFilterChange("all")}
        />
        {workKinds.map((kind) => (
          <FilterButton
            active={kindFilter === kind}
            count={counts[kind]}
            key={kind}
            label={t(`kinds.${kind}`)}
            onClick={() => onFilterChange(kind)}
          />
        ))}
      </div>
    </section>
  );
}
