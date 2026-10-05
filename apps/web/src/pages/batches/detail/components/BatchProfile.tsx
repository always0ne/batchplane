import type { BatchDetailDefinition } from "@batchplane/ui-client";
import { useTranslation } from "react-i18next";

import { BatchDetailFact } from "./BatchDetailFact";
import { BatchExecutionTarget } from "./BatchExecutionTarget";
import { BatchSchedules } from "./BatchSchedules";

export function BatchProfile({
  batch,
  defaultBranch,
}: {
  batch: BatchDetailDefinition;
  defaultBranch: string;
}) {
  const { t } = useTranslation("batches");

  return (
    <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="break-words text-xl font-bold text-bp-graphite">
            {batch.name}
          </h2>
          <p className="mt-1 break-all font-mono text-sm text-bp-muted">
            {batch.batchId}
          </p>
        </div>
        <span className="rounded-md bg-slate-100 px-3 py-1 text-xs font-bold text-bp-graphite">
          {batch.status}
        </span>
      </div>
      <dl className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <BatchDetailFact label={t("detail.fields.owner")} value={batch.owner} />
        <BatchDetailFact
          label={t("detail.fields.domain")}
          value={batch.domain}
        />
        <BatchDetailFact
          label={t("detail.fields.environment")}
          value={batch.environment}
        />
        <BatchDetailFact
          label={t("detail.fields.criticality")}
          value={batch.criticality}
        />
        <BatchDetailFact
          label={t("detail.fields.defaultBranch")}
          value={defaultBranch}
        />
        <BatchDetailFact
          label={t("detail.fields.labels")}
          value={batch.labels?.join(", ") || t("values.none")}
        />
      </dl>
      <div className="mt-5 grid gap-5 border-t border-slate-100 pt-5 lg:grid-cols-2">
        <section className="min-w-0">
          <h3 className="text-sm font-bold text-bp-graphite">
            {t("detail.workflow.title")}
          </h3>
          <dl className="mt-3 space-y-3 text-sm">
            <BatchDetailFact
              label={t("detail.workflow.runtime")}
              value={batch.executionTarget?.platformName ?? t("values.none")}
            />
            <BatchDetailFact
              label={t("detail.workflow.path")}
              value={batch.executionTarget?.targetName ?? t("values.none")}
            />
            <BatchDetailFact
              label={t("detail.workflow.ref")}
              value={batch.executionTarget?.targetRevision ?? t("values.none")}
            />
          </dl>
        </section>
        <BatchExecutionTarget batch={batch} />
      </div>
      <BatchSchedules schedules={batch.schedules ?? []} />
    </article>
  );
}
