import type { ExecutionJobLog } from "@batchplane/ui-client";
import { ExternalLink, GitBranch, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatInspectionError } from "../../../../client/inspection-errors";
import { Button } from "../../../../components/Button";
import {
  JobLogViewer,
  type ExecutionJobItem,
  type ExecutionJobKind,
} from "./JobLogViewer";

export type LoadExecutionRunJobLog = (
  jobId: string,
) => Promise<ExecutionJobLog>;

type JobLogState =
  | { type: "idle" }
  | { type: "loading" }
  | { type: "loaded"; log: ExecutionJobLog }
  | { type: "error"; error: unknown };

export function JobLogAction({
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

  async function toggleLogVisibility() {
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

  const logButtonLabel = getLogButtonLabel(logState.type, kind);
  const externalLogLabel = getExternalLogLabel(kind);

  return (
    <>
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button
            className="w-fit"
            size="compact"
            variant="primary"
            disabled={logState.type === "loading"}
            onClick={toggleLogVisibility}
            type="button"
          >
            {logState.type === "loading" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <GitBranch className="h-4 w-4" aria-hidden="true" />
            )}
            {t(logButtonLabel)}
          </Button>
          {job.url ? (
            <a
              aria-label={t("runDetail.jobs.openLogForJob", { name: job.name })}
              className="inline-flex w-fit items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bp-graphite"
              href={job.url}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              {t(externalLogLabel)}
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

function getLogButtonLabel(state: JobLogState["type"], kind: ExecutionJobKind) {
  if (state === "loaded") return "runDetail.jobs.hideLog";
  if (state === "loading") return "runDetail.jobs.loadingLog";
  if (kind === "gate") return "runDetail.jobs.viewGateLog";
  if (kind === "source") return "runDetail.jobs.viewSourceLog";
  return "runDetail.jobs.viewBusinessLog";
}

function getExternalLogLabel(kind: ExecutionJobKind) {
  if (kind === "gate") return "runDetail.jobs.openGateLog";
  if (kind === "source") return "runDetail.jobs.openSourceLog";
  return "runDetail.jobs.openBusinessLog";
}
