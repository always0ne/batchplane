import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { EmptyState } from "../../../components/EmptyState";
import { ErrorState } from "../../../components/ErrorState";
import { LoadingState } from "../../../components/LoadingState";
import { formatInspectionError } from "../../../client/inspection-errors";
import type { ExecutionsState } from "../hooks/useExecutions";
import { LoadedExecutionList } from "./LoadedExecutionList";

export type ExecutionFilter =
  | "active"
  | "all"
  | "blocked"
  | "canceled"
  | "failed"
  | "succeeded";
export type ExecutionListView = "executions" | "failures";

export function ExecutionListContent({
  activeFilter,
  namespace,
  onFilterChange,
  state,
  view,
}: {
  activeFilter: ExecutionFilter;
  namespace: "executions" | "failures";
  onFilterChange: (filter: ExecutionFilter) => void;
  state: ExecutionsState;
  view: ExecutionListView;
}) {
  const { t } = useTranslation(namespace);

  if (state.type === "loading") {
    return <LoadingState message={t("states.loading")} />;
  }

  if (state.type === "no-session") {
    return (
      <EmptyState
        action={
          <Link
            className="font-semibold text-bp-control underline"
            to="/workspace"
          >
            {t("actions.openSetup")}
          </Link>
        }
        message={t("states.noSession")}
      />
    );
  }

  if (state.type === "error") {
    return (
      <ErrorState
        message={formatInspectionError(state.error, t, "states.error")}
      />
    );
  }

  return (
    <LoadedExecutionList
      activeFilter={activeFilter}
      namespace={namespace}
      onFilterChange={onFilterChange}
      runs={state.runs}
      view={view}
    />
  );
}
