import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

import { PageHeader } from "../../components/PageHeader";

import type {
  ExecutionFilter,
  ExecutionListView,
} from "./ExecutionListContent";
import { ExecutionListContent } from "./ExecutionListContent";
import { useExecutions } from "./useExecutions";

export function ExecutionHistoryRegion({ view }: { view: ExecutionListView }) {
  const namespace = view === "failures" ? "failures" : "executions";
  const { t } = useTranslation(namespace);
  const [searchParams, setSearchParams] = useSearchParams();
  const { state, refresh } = useExecutions();
  const activeFilter = readExecutionFilter(searchParams, view);

  function changeFilter(filter: ExecutionFilter) {
    if (filter === "all") {
      setSearchParams({});
      return;
    }

    setSearchParams({ type: filter });
  }

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title={t("title")} subtitle={t("subtitle")} />
        <button
          className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bp-graphite"
          onClick={refresh}
          type="button"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {t("actions.refresh")}
        </button>
      </div>
      <ExecutionListContent
        activeFilter={activeFilter}
        namespace={namespace}
        onFilterChange={changeFilter}
        state={state}
        view={view}
      />
    </section>
  );
}

function readExecutionFilter(
  searchParams: URLSearchParams,
  view: ExecutionListView,
): ExecutionFilter {
  const type = searchParams.get("type");
  const validFilter =
    type === "active" ||
    type === "blocked" ||
    type === "canceled" ||
    type === "failed" ||
    type === "succeeded"
      ? type
      : "all";

  return view === "failures" &&
    validFilter !== "all" &&
    validFilter !== "failed" &&
    validFilter !== "blocked"
    ? "all"
    : validFilter;
}
