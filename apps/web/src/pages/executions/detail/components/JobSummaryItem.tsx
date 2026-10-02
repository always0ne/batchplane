import { useTranslation } from "react-i18next";
import { ExecutionStatusBadge } from "./ExecutionStatusBadge";
import { JobKindBadge } from "./JobKindBadge";
import { JobLogAction, type LoadExecutionRunJobLog } from "./JobLogAction";
import type { ExecutionJobItem, ExecutionJobKind } from "./JobLogViewer";

export function JobSummaryItem({
  job,
  kind,
  onLoadLog,
}: {
  job: ExecutionJobItem;
  kind: ExecutionJobKind;
  onLoadLog: LoadExecutionRunJobLog;
}) {
  const { t } = useTranslation("executionRequests");
  return (
    <li className="grid min-w-0 grid-cols-1 gap-3 py-3 first:pt-0 last:pb-0 lg:grid-cols-[minmax(0,1fr)_8rem_9rem_11rem]">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-bp-graphite">{job.name}</p>
          <JobKindBadge kind={kind} />
        </div>
        <p className="mt-1 font-mono text-xs text-bp-muted">
          {t("runDetail.jobs.jobId", { jobId: job.jobId })}
        </p>
      </div>
      <ExecutionStatusBadge status={job.status} variant="job" />
      <p className="text-sm font-semibold text-bp-muted">
        {job.conclusion || t("runDetail.values.inProgress")}
      </p>
      <JobLogAction job={job} kind={kind} onLoadLog={onLoadLog} />
    </li>
  );
}
