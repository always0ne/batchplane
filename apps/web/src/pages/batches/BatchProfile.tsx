import type { BatchDefinition } from "@batchplane/domain";
import type {
  BatchDetailDefinition,
  BatchScheduleDisplay,
} from "@batchplane/ui-client";
import { useTranslation } from "react-i18next";

import { BatchDetailFact } from "./BatchDetailFact";

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
              value={t("detail.workflow.runtimeGithubActions")}
            />
            <BatchDetailFact
              label={t("detail.workflow.path")}
              value={batch.workflow.path}
            />
            <BatchDetailFact
              label={t("detail.workflow.ref")}
              value={batch.workflow.ref}
            />
          </dl>
        </section>
        <BatchExecutionTarget batch={batch} />
      </div>
      <BatchSchedules schedules={batch.schedules ?? []} />
    </article>
  );
}

export function BatchExecutionTarget({ batch }: { batch: BatchDefinition }) {
  const { t } = useTranslation("batches");
  const execution = batch.execution;

  return (
    <section className="min-w-0">
      <h3 className="text-sm font-bold text-bp-graphite">
        {t("detail.executionSpec.title")}
      </h3>
      {execution ? (
        <dl className="mt-3 space-y-3 text-sm">
          <BatchDetailFact
            label={t("detail.executionSpec.runsOn")}
            value={
              Array.isArray(execution.runsOn)
                ? execution.runsOn.join(", ")
                : execution.runsOn
            }
          />
          <BatchDetailFact
            label={t("detail.executionSpec.artifactPath")}
            value={
              execution.artifactPath || t("detail.executionSpec.noArtifact")
            }
          />
          <div>
            <dt className="text-xs font-semibold uppercase text-bp-muted">
              {t("detail.executionSpec.command")}
            </dt>
            <dd className="mt-1">
              <pre className="max-h-36 overflow-auto whitespace-pre-wrap rounded-md bg-bp-graphite p-3 text-xs leading-5 text-white">
                {execution.command || t("detail.executionSpec.missing")}
              </pre>
            </dd>
          </div>
        </dl>
      ) : (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
          {t("detail.executionSpec.missing")}
        </p>
      )}
    </section>
  );
}

export function BatchSchedules({
  schedules,
}: {
  schedules: BatchScheduleDisplay[];
}) {
  const { t } = useTranslation("batches");

  return (
    <section className="mt-5 border-t border-slate-100 pt-5">
      <h3 className="text-sm font-bold text-bp-graphite">
        {t("detail.schedules.title")}
      </h3>
      <p className="mt-1 text-sm text-bp-muted">
        {t("detail.schedules.subtitle")}
      </p>
      <p className="mt-2 text-sm font-medium text-bp-muted">
        {t("detail.schedules.managementHint")}
      </p>
      {schedules.length === 0 ? (
        <p className="mt-4 text-sm text-bp-muted">
          {t("detail.schedules.empty")}
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {schedules.map((schedule) => (
            <li
              className="rounded-md border border-slate-200 bg-slate-50 p-4"
              key={schedule.scheduleId}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words text-sm font-bold text-bp-graphite">
                    {schedule.name}
                  </p>
                  <p className="mt-1 break-all font-mono text-xs text-bp-muted">
                    {schedule.scheduleId}
                  </p>
                </div>
                <span className="rounded-md bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-700">
                  {schedule.enabled
                    ? t("detail.schedules.enabled")
                    : t("detail.schedules.disabled")}
                </span>
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
                <BatchDetailFact
                  label={t("detail.schedules.fields.cron")}
                  value={schedule.cron}
                />
                <BatchDetailFact
                  label={t("detail.schedules.fields.timezone")}
                  value={schedule.timezone}
                />
                <BatchDetailFact
                  label={t("detail.schedules.fields.generatedCron")}
                  value={schedule.generatedCron}
                />
              </dl>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
