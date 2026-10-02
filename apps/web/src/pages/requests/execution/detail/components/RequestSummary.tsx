import type { ExecutionRequest } from "@batchplane/ui-client";
import { FileText } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Fact } from "./Fact";
import { StatusBadge } from "./StatusBadge";

export function RequestSummary({ request }: { request: ExecutionRequest }) {
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
