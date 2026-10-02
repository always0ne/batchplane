import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  statusFilters,
  statusLabel,
  type RequestKindFilter,
  type RequestStatusFilter,
} from "../request-list-display";

export function RequestFilters({
  counts,
  kindFilter,
  onKindChange,
  onQueryChange,
  onStatusChange,
  query,
  statusFilter,
  total,
}: {
  counts: { changeRequest: number; execution: number };
  kindFilter: RequestKindFilter;
  onKindChange: (kind: RequestKindFilter) => void;
  onQueryChange: (query: string) => void;
  onStatusChange: (status: RequestStatusFilter) => void;
  query: string;
  statusFilter: RequestStatusFilter;
  total: number;
}) {
  const { t } = useTranslation("requests");
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_16rem_14rem]">
        <label className="text-xs font-bold uppercase text-bp-muted">
          {t("filters.search")}
          <span className="mt-1 flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2">
            <Search className="h-4 w-4 text-bp-muted" aria-hidden="true" />
            <input
              className="min-w-0 flex-1 bg-transparent text-sm text-bp-graphite outline-none"
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={t("filters.searchPlaceholder")}
              value={query}
            />
          </span>
        </label>
        <label className="text-xs font-bold uppercase text-bp-muted">
          {t("filters.type")}
          <select
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bp-graphite"
            onChange={(event) =>
              onKindChange(event.target.value as RequestKindFilter)
            }
            value={kindFilter}
          >
            {(["all", "change-request", "execution"] as const).map((filter) => (
              <option key={filter} value={filter}>
                {t(`filters.kinds.${filter}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-bold uppercase text-bp-muted">
          {t("filters.status")}
          <select
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bp-graphite"
            onChange={(event) =>
              onStatusChange(event.target.value as RequestStatusFilter)
            }
            value={statusFilter}
          >
            {statusFilters.map((filter) => (
              <option key={filter} value={filter}>
                {statusLabel(filter, t)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-bp-muted">
        <span className="rounded-md bg-slate-100 px-2 py-1">
          {t("counts.total", { count: total })}
        </span>
        <span className="rounded-md bg-slate-100 px-2 py-1">
          {t("counts.changeRequest", { count: counts.changeRequest })}
        </span>
        <span className="rounded-md bg-slate-100 px-2 py-1">
          {t("counts.execution", { count: counts.execution })}
        </span>
      </div>
    </section>
  );
}
