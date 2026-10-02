import {
  isBusinessFailure,
  type ExecutionRunPresentation as ExecutionRun,
} from "@batchplane/ui-client";
import type { ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import type { ExecutionListView } from "./ExecutionListContent";
import { ExecutionMetric } from "./ExecutionMetric";

export function ExecutionListSummary({
  namespace,
  runs,
  view,
}: {
  namespace: "executions" | "failures";
  runs: ExecutionRun[];
  view: ExecutionListView;
}) {
  const { t } = useTranslation(namespace);
  const followUpRuns = runs.filter(
    (run) => run.status === "BLOCKED" || isBusinessFailure(run),
  );
  let metrics: ComponentProps<typeof ExecutionMetric>[];
  if (view === "failures") {
    const businessFailedRuns = runs.filter(isBusinessFailure);
    const blockedRuns = runs.filter((run) => run.status === "BLOCKED");
    const explainedRuns = businessFailedRuns.filter(
      (run) => (run.failureFollowUps ?? []).length > 0,
    );
    metrics = [
      { label: "summary.total", tone: "danger", value: followUpRuns.length },
      {
        label: "summary.failed",
        tone: "danger",
        value: businessFailedRuns.length,
      },
      { label: "summary.blocked", tone: "warning", value: blockedRuns.length },
      {
        label: "summary.explained",
        tone: "success",
        value: explainedRuns.length,
      },
    ];
  } else {
    const activeRuns = runs.filter(
      (run) => run.status === "QUEUED" || run.status === "RUNNING",
    );
    const succeededRuns = runs.filter((run) => run.status === "SUCCEEDED");
    metrics = [
      { label: "summary.total", tone: "neutral", value: runs.length },
      { label: "summary.active", tone: "info", value: activeRuns.length },
      {
        label: "summary.succeeded",
        tone: "success",
        value: succeededRuns.length,
      },
      { label: "summary.followUp", tone: "danger", value: followUpRuns.length },
    ];
  }
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <ExecutionMetric
          key={metric.label}
          {...metric}
          label={t(metric.label)}
        />
      ))}
    </section>
  );
}
