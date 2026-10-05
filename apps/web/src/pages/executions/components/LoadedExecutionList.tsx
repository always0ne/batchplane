import {
  isBusinessFailure,
  type ExecutionRunPresentation as ExecutionRun,
} from "@batchplane/ui-client";
import { useMemo } from "react";
import type {
  ExecutionFilter,
  ExecutionListView,
} from "./ExecutionListContent";
import { ExecutionListSummary } from "./ExecutionListSummary";
import { ExecutionListResults } from "./ExecutionListResults";

export function LoadedExecutionList({
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
  const visibleRuns = useMemo(
    () => (view === "failures" ? runs.filter(isFollowUpRun) : runs),
    [runs, view],
  );
  const filteredRuns = useMemo(
    () => visibleRuns.filter((run) => matchesFilter(run, activeFilter)),
    [activeFilter, visibleRuns],
  );

  return (
    <div className="space-y-4">
      <ExecutionListSummary namespace={namespace} runs={runs} view={view} />
      <ExecutionListResults
        activeFilter={activeFilter}
        namespace={namespace}
        onFilterChange={onFilterChange}
        runs={filteredRuns}
        view={view}
      />
    </div>
  );
}

function matchesFilter(run: ExecutionRun, filter: ExecutionFilter): boolean {
  if (filter === "all") {
    return true;
  }

  if (filter === "active") {
    return isActiveRun(run);
  }

  if (filter === "blocked") {
    return run.status === "BLOCKED";
  }

  if (filter === "canceled") {
    return run.status === "CANCELED";
  }

  if (filter === "failed") {
    return isBusinessFailure(run);
  }

  return run.status === "SUCCEEDED";
}

function isFollowUpRun(run: ExecutionRun): boolean {
  return run.status === "BLOCKED" || isBusinessFailure(run);
}

function isActiveRun(run: ExecutionRun): boolean {
  return run.status === "QUEUED" || run.status === "RUNNING";
}
