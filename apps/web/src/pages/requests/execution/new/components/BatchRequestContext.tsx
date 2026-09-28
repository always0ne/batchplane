import type { ExecutionRequestDraft } from "@batchplane/ui-client";
import { useTranslation } from "react-i18next";

import { ContextFact } from "./ContextFact";

export function BatchRequestContext({
  batch,
}: {
  batch: ExecutionRequestDraft["batch"];
}) {
  const { t } = useTranslation("executionRequests");

  return (
    <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-bp-graphite">
            {batch.name}
          </h2>
          <p className="mt-1 break-all font-mono text-sm text-bp-muted">
            {batch.batchId}
          </p>
        </div>
        <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-800">
          {t("context.controlled")}
        </span>
      </div>

      <dl className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <ContextFact label={t("context.owner")} value={batch.owner} />
        <ContextFact label={t("context.domain")} value={batch.domain} />
        <ContextFact
          label={t("context.environment")}
          value={batch.environment}
        />
        <ContextFact
          label={t("context.workflowPath")}
          value={batch.executionTarget?.targetName ?? "-"}
        />
        <ContextFact
          label={t("context.runsOn")}
          value={batch.executionTarget?.executionEnvironment ?? "-"}
        />
        <ContextFact
          label={t("context.command")}
          value={batch.executionTarget?.command || t("context.missingCommand")}
        />
      </dl>
    </article>
  );
}
