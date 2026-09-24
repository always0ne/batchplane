import type { ExecutionRequest } from "@batchplane/ui-client";
import { FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export function ExecutionRequestContent({
  request,
}: {
  request: ExecutionRequest;
}) {
  return (
    <div className="min-w-0 space-y-4">
      <RequestSummary request={request} />
      <DecisionMaterial request={request} />
      <CanonicalPayload request={request} />
    </div>
  );
}

function RequestSummary({ request }: { request: ExecutionRequest }) {
  const { t } = useTranslation("executionRequests");
  return (
    <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex items-center gap-2">
          <FileText
            className="h-5 w-5 shrink-0 text-bp-git"
            aria-hidden="true"
          />
          <h2 className="break-words text-lg font-semibold text-bp-graphite">
            {request.title}
          </h2>
        </div>
        <StatusBadge
          scheduled={request.triggerType === "SCHEDULE"}
          status={request.status}
        />
      </div>
      <dl className="mt-5 grid min-w-0 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Fact
          label={t("detail.fields.repository")}
          value={request.workspaceLabel}
        />
        <Fact label={t("detail.fields.batchId")} value={request.batchId} />
        <Fact
          label={t("detail.fields.requestedBy")}
          value={request.requestedBy ? `@${request.requestedBy}` : "-"}
        />
        <Fact
          label={t("detail.fields.requestedAt")}
          value={request.requestedAt || "-"}
        />
        <Fact
          label={t("detail.fields.expiresAt")}
          value={request.expiresAt || "-"}
        />
        <Fact
          label={t("detail.fields.issueState")}
          value={request.sourceState}
        />
        <Fact
          label={t("detail.fields.workflow")}
          value={
            request.executionTarget
              ? `${request.executionTarget.targetName}@${request.executionTarget.targetRevision}`
              : "-"
          }
        />
        <Fact
          label={t("detail.fields.requestDigest")}
          value={request.evidence.requestDigest}
        />
      </dl>
    </article>
  );
}

function DecisionMaterial({ request }: { request: ExecutionRequest }) {
  const { t } = useTranslation("executionRequests");
  return (
    <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-bp-graphite">
        {t("detail.material.title")}
      </h2>
      <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-4">
          <TextBlock
            label={t("detail.fields.reason")}
            value={request.reason || "-"}
          />
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

function CanonicalPayload({ request }: { request: ExecutionRequest }) {
  const { t } = useTranslation("executionRequests");
  return (
    <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-bp-graphite">
        {t("detail.payload.title")}
      </h2>
      <pre className="mt-4 max-h-96 max-w-full overflow-auto rounded-md bg-bp-graphite p-4 text-xs leading-6 text-white">
        <code>{request.evidence.canonicalPayload || "-"}</code>
      </pre>
    </article>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-slate-50 px-3 py-2">
      <dt className="text-xs font-semibold uppercase tracking-normal text-bp-muted">
        {label}
      </dt>
      <dd className="mt-1 break-all font-mono text-xs font-semibold text-bp-graphite">
        {value}
      </dd>
    </div>
  );
}

function LinkedFact({
  label,
  to,
  value,
}: {
  label: string;
  to: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-md bg-slate-50 px-3 py-2">
      <dt className="text-xs font-semibold uppercase tracking-normal text-bp-muted">
        {label}
      </dt>
      <dd className="mt-1 min-w-0">
        <Link
          className="break-all font-mono text-xs font-semibold text-bp-control underline"
          to={to}
        >
          {value}
        </Link>
      </dd>
    </div>
  );
}

function formatApprovedBatchRevision(request: ExecutionRequest): string {
  const revision = request.evidence.approvedBatchRevision;
  return revision
    ? `${revision.governedChangeId} (${revision.targetRevisionDigest})`
    : "-";
}

function TextBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase text-bp-muted">{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-bp-graphite">
        {value}
      </p>
    </div>
  );
}

function StatusBadge({
  scheduled,
  status,
}: {
  scheduled: boolean;
  status: ExecutionRequest["status"];
}) {
  const { t } = useTranslation("executionRequests");
  const displayStatus = scheduled ? "SCHEDULE_RECORDED" : status;
  return (
    <span
      className={`shrink-0 rounded-md px-2 py-1 text-xs font-bold ${
        scheduled ? "bg-slate-100 text-slate-700" : statusPalette(status)
      }`}
      title={t(`detail.statusHelp.${displayStatus}`)}
    >
      {t(`detail.status.${displayStatus}`)}
    </span>
  );
}

function statusPalette(status: ExecutionRequest["status"]): string {
  if (status === "REQUESTED") return "bg-amber-50 text-amber-800";
  if (status === "APPROVED" || status === "DISPATCHING")
    return "bg-sky-50 text-sky-800";
  if (status === "DISPATCHED") return "bg-emerald-50 text-emerald-800";
  return "bg-red-50 text-red-800";
}
