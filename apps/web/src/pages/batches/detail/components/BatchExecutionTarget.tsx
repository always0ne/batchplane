import type { BatchDetailDefinition } from "@batchplane/ui-client";
import { useTranslation } from "react-i18next";

import { BatchDetailFact } from "./BatchDetailFact";

export function BatchExecutionTarget({
  batch,
}: {
  batch: Pick<BatchDetailDefinition, "executionTarget">;
}) {
  const { t } = useTranslation("batches");
  const execution = batch.executionTarget;

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
              execution.executionEnvironment ??
              t("detail.executionSpec.missing")
            }
          />
          <BatchDetailFact
            label={t("detail.executionSpec.artifactPath")}
            value={
              execution.executionFile?.location ??
              t("detail.executionSpec.noArtifact")
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
