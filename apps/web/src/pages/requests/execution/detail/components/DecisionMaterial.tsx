import type { ExecutionRequest } from "@batchplane/ui-client";
import { useTranslation } from "react-i18next";

import { Fact } from "./Fact";
import { LinkedFact } from "./LinkedFact";

export function DecisionMaterial({ request }: { request: ExecutionRequest }) {
  const { t } = useTranslation("executionRequests");
  return (
    <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-bp-graphite">
        {t("detail.material.title")}
      </h2>
      <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-bp-muted">
              {t("detail.fields.reason")}
            </p>
            <p className="mt-1 break-words text-sm font-medium text-bp-graphite">
              {request.reason || "-"}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-bp-muted">
              {t("detail.fields.command")}
            </p>
            <pre className="mt-2 max-h-36 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-md bg-bp-graphite p-3 text-xs leading-5 text-white">
              {request.executionTarget?.command || "-"}
            </pre>
          </div>
        </div>
        <dl className="grid min-w-0 gap-3 text-sm">
          <Fact
            label={t("detail.fields.approvedBatchRevision")}
            value={formatApprovedBatchRevision(request)}
          />
          {request.evidence.sourceChange ? (
            <LinkedFact
              label={t("detail.fields.sourceChange")}
              to={`/approvals/registration/${encodeURIComponent(request.evidence.sourceChange.requestLocator)}`}
              value={request.evidence.sourceChange.label}
            />
          ) : null}
          <Fact
            label={t("detail.fields.environment")}
            value={request.batch.environment || "-"}
          />
          <Fact
            label={t("detail.fields.runsOn")}
            value={request.executionTarget?.executionEnvironment || "-"}
          />
          <Fact
            label={t("detail.fields.artifact")}
            value={request.executionTarget?.executionFile?.location || "-"}
          />
        </dl>
      </div>
    </article>
  );
}

function formatApprovedBatchRevision(request: ExecutionRequest): string {
  const revision = request.evidence.approvedBatchRevision;
  return revision
    ? `${revision.governedChangeId} (${revision.targetRevisionDigest})`
    : "-";
}
