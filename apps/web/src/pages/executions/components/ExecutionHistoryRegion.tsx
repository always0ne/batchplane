import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";

import { Button } from "../../../components/Button";
import { PageHeader } from "../../../components/PageHeader";

import type {
  ExecutionFilter,
  ExecutionListView,
} from "./ExecutionListContent";
import { ExecutionListContent } from "./ExecutionListContent";
import { useExecutions } from "../hooks/useExecutions";

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
        <Button size="compact" onClick={refresh} type="button">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {t("actions.refresh")}
        </Button>
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
  let filter: ExecutionFilter = "all";
  if (
    type === "active" ||
    type === "blocked" ||
    type === "canceled" ||
    type === "failed" ||
    type === "succeeded"
  ) {
    filter = type;
  }
  if (
    view === "failures" &&
    filter !== "all" &&
    filter !== "failed" &&
    filter !== "blocked"
  ) {
    return "all";
  }
  return filter;
}
