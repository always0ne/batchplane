import type { ExecutionRunPresentation as ExecutionRun } from "@batchplane/ui-client";
import { Activity } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DetailFact } from "./DetailFact";
import { ExecutionStatusBadge } from "./ExecutionStatusBadge";

export function ExecutionSummaryPanel({ run }: { run: ExecutionRun }) {
  const { t } = useTranslation("executionRequests");

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-bp-git" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-bp-graphite">
            {run.executionTarget?.name || t("runDetail.values.unknownWorkflow")}
          </h2>
        </div>
        <ExecutionStatusBadge
          gateVerificationUnknown={
            run.status === "FAILED" && run.gateDecision?.allowed !== true
          }
          status={run.status}
        />
      </div>
      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <DetailFact
          label={
            run.evidenceScope === "SOURCE_RUN"
              ? t("runDetail.fields.sourceRunId")
              : t("runDetail.fields.executionId")
          }
          value={run.runId}
        />
        <DetailFact
          label={t("runDetail.fields.requestId")}
          value={run.requestId || t("runDetail.values.unknown")}
        />
        <DetailFact
          label={t("runDetail.fields.batchId")}
          value={run.batchId || t("runDetail.values.unknown")}
        />
        <DetailFact
          label={t("runDetail.fields.actor")}
          value={run.actor || t("runDetail.values.unknown")}
        />
        <DetailFact
          label={t("runDetail.fields.workflow")}
          value={run.executionTarget?.location || t("runDetail.values.unknown")}
        />
        <DetailFact
          label={t("runDetail.fields.event")}
          value={run.event || t("runDetail.values.unknown")}
        />
        <DetailFact
          label={t("runDetail.fields.runAttempt")}
          value={String(run.runAttempt ?? 1)}
        />
        <DetailFact
          label={t("runDetail.fields.startedAt")}
          value={run.startedAt || t("runDetail.values.unknown")}
        />
        <DetailFact
          label={t("runDetail.fields.completedAt")}
          value={
            run.completedAt ||
            t(
              run.status === "QUEUED" || run.status === "RUNNING"
                ? "runDetail.values.inProgress"
                : "runDetail.values.unknown",
            )
          }
        />
      </dl>
    </article>
  );
}
