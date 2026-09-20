import type {
  ExecutionJobLog,
  ExecutionRunPresentation as ExecutionRun,
} from "@batchplane/ui-client";
import { ExternalLink, GitBranch, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatInspectionError } from "../../../client/inspection-errors";
import {
  JobLogViewer,
  type ExecutionJobItem,
  type ExecutionJobKind,
} from "./JobLogViewer";
import { ExecutionStatusBadge } from "./ExecutionDetailFacts";
type LoadExecutionRunJobLog = (jobId: string) => Promise<ExecutionJobLog>;
type JobLogState =
  | { type: "idle" }
  | { type: "loading" }
  | { type: "loaded"; log: ExecutionJobLog }
  | { type: "error"; error: unknown };

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
            <li
              className="grid min-w-0 grid-cols-1 gap-3 py-3 first:pt-0 last:pb-0 lg:grid-cols-[minmax(0,1fr)_8rem_9rem_11rem]"
              key={job.jobId}
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-bp-graphite">{job.name}</p>
                  <JobKindBadge
                    kind={
                      run.evidenceScope === "SOURCE_RUN"
                        ? "source"
                        : getJobKind(job)
                    }
                  />
                </div>
                <p className="mt-1 font-mono text-xs text-bp-muted">
                  {t("runDetail.jobs.jobId", { jobId: job.jobId })}
                </p>
              </div>
              <ExecutionStatusBadge status={job.status} variant="job" />
              <p className="text-sm font-semibold text-bp-muted">
                {job.conclusion || t("runDetail.values.inProgress")}
              </p>
              <JobLogAction
                job={job}
                kind={
                  run.evidenceScope === "SOURCE_RUN"
                    ? "source"
                    : getJobKind(job)
                }
                onLoadLog={onLoadLog}
              />
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function JobKindBadge({ kind }: { kind: ExecutionJobKind }) {
  const { t } = useTranslation("executionRequests");
  const className =
    kind === "gate" ? "bg-orange-50 text-orange-800" : "bg-sky-50 text-sky-800";

  return (
    <span className={`rounded-md px-2 py-1 text-xs font-bold ${className}`}>
      {t(`runDetail.jobs.kind.${kind}`)}
    </span>
  );
}

function JobLogAction({
  job,
  kind,
  onLoadLog,
}: {
  job: ExecutionJobItem;
  kind: ExecutionJobKind;
  onLoadLog: LoadExecutionRunJobLog;
}) {
  const { t } = useTranslation("executionRequests");
  const [logState, setLogState] = useState<JobLogState>({ type: "idle" });
  const [searchTerm, setSearchTerm] = useState("");

  const lifetime = useRef({ active: true, pending: false });
  useEffect(() => {
    const current = { active: true, pending: false };
    lifetime.current = current;
    setLogState({ type: "idle" });
    return () => {
      current.active = false;
    };
  }, [job.jobId, onLoadLog]);

  async function loadLog() {
    const current = lifetime.current;
    if (!current.active || current.pending) return;
    if (logState.type === "loaded") {
      setLogState({ type: "idle" });
      return;
    }

    current.pending = true;
    setLogState({ type: "loading" });

    try {
      const log = await onLoadLog(job.jobId);
      if (current.active) setLogState({ log, type: "loaded" });
    } catch (error) {
      if (current.active)
        setLogState({
          error,
          type: "error",
        });
    } finally {
      current.pending = false;
    }
  }

  return (
    <>
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <button
            className="inline-flex w-fit items-center gap-2 rounded-md bg-bp-control px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={logState.type === "loading"}
            onClick={loadLog}
            type="button"
          >
            {logState.type === "loading" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <GitBranch className="h-4 w-4" aria-hidden="true" />
            )}
            {logState.type === "loaded"
              ? t("runDetail.jobs.hideLog")
              : logState.type === "loading"
                ? t("runDetail.jobs.loadingLog")
                : kind === "gate"
                  ? t("runDetail.jobs.viewGateLog")
                  : kind === "source"
                    ? t("runDetail.jobs.viewSourceLog")
                    : t("runDetail.jobs.viewBusinessLog")}
          </button>
          {job.url ? (
            <a
              aria-label={t("runDetail.jobs.openLogForJob", { name: job.name })}
              className="inline-flex w-fit items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bp-graphite"
              href={job.url}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              {kind === "gate"
                ? t("runDetail.jobs.openGateLog")
                : kind === "source"
                  ? t("runDetail.jobs.openSourceLog")
                  : t("runDetail.jobs.openBusinessLog")}
            </a>
          ) : null}
        </div>
        {logState.type === "error" ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
            {formatInspectionError(
              logState.error,
              t,
              "runDetail.states.error",
              "runDetail.states.actionsPermission",
            )}
          </p>
        ) : null}
      </div>
      {logState.type === "loaded" ? (
        <div className="min-w-0 max-w-full lg:col-span-4">
          <JobLogViewer
            job={job}
            kind={kind}
            log={logState.log}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
          />
        </div>
      ) : null}
    </>
  );
}

function getJobKind(job: ExecutionJobItem): ExecutionJobKind {
  if (job.role === "GATE") return "gate";
  if (job.role === "BUSINESS") return "business";
  return "business";
}
