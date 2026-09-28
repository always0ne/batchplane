import type { ExecutionRunPresentation as ExecutionRun } from "@batchplane/ui-client";
import { useTranslation } from "react-i18next";
import type {
  ExecutionFilter,
  ExecutionListView,
} from "./ExecutionListContent";
import { ExecutionListFilters } from "./ExecutionListFilters";
import { ExecutionRow } from "./ExecutionRow";

export function ExecutionListResults({
  activeFilter,
  namespace,
  onFilterChange,
  runs,
  view,
}: {
  activeFilter: ExecutionFilter;
  namespace: "executions" | "failures";
  onFilterChange: (filter: ExecutionFilter) => void;
  runs: ExecutionRun[];
  view: ExecutionListView;
}) {
  const { t } = useTranslation(namespace);
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-bp-graphite">
            {t("list.title")}
          </h2>
          <p className="mt-1 text-sm text-bp-muted">
            {t("list.subtitle", { count: runs.length })}
          </p>
        </div>
        <ExecutionListFilters
          activeFilter={activeFilter}
          namespace={namespace}
          onFilterChange={onFilterChange}
          view={view}
        />
      </div>

      {runs.length === 0 ? (
        <p className="mt-5 rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold text-bp-muted">
          {t("list.empty")}
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-slate-100">
          {runs.map((run) => (
            <ExecutionRow
              key={`${run.runId}:${run.runAttempt ?? 1}`}
              namespace={namespace}
              run={run}
              view={view}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
