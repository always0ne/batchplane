import type { ExecutionRunPresentation as ExecutionRun } from "@batchplane/ui-client";
import { GitBranch } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { LoadExecutionRunJobLog } from "./JobLogAction";
import type { ExecutionJobItem, ExecutionJobKind } from "./JobLogViewer";
import { JobSummaryItem } from "./JobSummaryItem";

export function JobSummaryPanel({
  onLoadLog,
  run,
}: {
  onLoadLog: LoadExecutionRunJobLog;
  run: ExecutionRun;
}) {
  const { t } = useTranslation("executionRequests");
  const jobs = run.jobs ?? [];

  return (
    <article className="min-w-0 max-w-full rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <GitBranch className="h-5 w-5 text-bp-git" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-bp-graphite">
          {t("runDetail.jobs.title")}
        </h2>
      </div>
      <p className="mt-2 text-sm font-semibold text-bp-muted">
        {t("runDetail.jobs.description")}
      </p>
      {jobs.length === 0 ? (
        <p className="mt-4 text-sm font-semibold text-bp-muted">
          {t("runDetail.jobs.empty")}
        </p>
      ) : (
        <ul className="mt-4 min-w-0 divide-y divide-slate-100">
          {jobs.map((job) => (
            <JobSummaryItem
              key={job.jobId}
              job={job}
              kind={
                run.evidenceScope === "SOURCE_RUN" ? "source" : getJobKind(job)
              }
              onLoadLog={onLoadLog}
            />
          ))}
        </ul>
      )}
    </article>
  );
}

function getJobKind(job: ExecutionJobItem): ExecutionJobKind {
  if (job.role === "GATE") return "gate";
  if (job.role === "BUSINESS") return "business";
  return "business";
}
