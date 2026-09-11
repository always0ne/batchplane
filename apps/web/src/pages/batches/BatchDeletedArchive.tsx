import type { BatchDetailArchiveResult } from "@batchplane/ui-client";
import { useTranslation } from "react-i18next";

import { ButtonLink } from "../../ui/Button";
import { BatchDetailFact } from "./BatchDetailFact";
import { BatchExecutionTarget, BatchSchedules } from "./BatchProfile";

export function BatchDeletedArchive({
  archive,
  defaultBranch,
}: {
  archive: BatchDetailArchiveResult;
  defaultBranch: string;
}) {
  const { t } = useTranslation("batches");
  const sourcePath = `/approvals/registration/${encodeURIComponent(archive.sourceRequest.locator)}`;

  if (archive.status === "UNAVAILABLE") {
    return (
      <article className="rounded-lg border border-amber-200 bg-white p-5 shadow-sm">
        <ArchiveHeader
          description={t("detail.deleted.evidenceUnavailableDescription")}
          sourcePath={sourcePath}
          sourceRequest={archive.sourceRequest}
          title={t("detail.deleted.evidenceUnavailableTitle")}
        />
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950">
          <span className="font-bold">
            {t("detail.deleted.evidenceUnavailableReasonLabel")}:
          </span>{" "}
          {t(`detail.deleted.unavailableReasons.${archive.unavailableReason}`)}
        </p>
      </article>
    );
  }

  return (
    <article className="min-w-0 rounded-lg border border-red-200 bg-white p-5 shadow-sm">
      <ArchiveHeader
        batchId={archive.batch.batchId}
        description={t("detail.deleted.description")}
        sourcePath={sourcePath}
        sourceRequest={archive.sourceRequest}
        title={archive.batch.name}
      />
      <dl className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <BatchDetailFact
          label={t("detail.fields.owner")}
          value={archive.batch.owner}
        />
        <BatchDetailFact
          label={t("detail.fields.domain")}
          value={archive.batch.domain}
        />
        <BatchDetailFact
          label={t("detail.fields.environment")}
          value={archive.batch.environment}
        />
        <BatchDetailFact
          label={t("detail.fields.criticality")}
          value={archive.batch.criticality}
        />
        <BatchDetailFact
          label={t("detail.fields.defaultBranch")}
          value={defaultBranch}
        />
      </dl>
      <div className="mt-5 grid gap-5 border-t border-slate-100 pt-5 lg:grid-cols-2">
        <section>
          <h3 className="text-sm font-bold text-bp-graphite">
            {t("detail.workflow.title")}
          </h3>
          <dl className="mt-3 space-y-3 text-sm">
            <BatchDetailFact
              label={t("detail.workflow.path")}
              value={archive.batch.workflow.path}
            />
            <BatchDetailFact
              label={t("detail.workflow.ref")}
              value={archive.batch.workflow.ref}
            />
          </dl>
        </section>
        <BatchExecutionTarget batch={archive.batch} />
      </div>
      <BatchSchedules schedules={archive.batch.schedules ?? []} />
    </article>
  );
}

function ArchiveHeader({
  batchId,
  description,
  sourcePath,
  sourceRequest,
  title,
}: {
  batchId?: string;
  description: string;
  sourcePath: string;
  sourceRequest: BatchDetailArchiveResult["sourceRequest"];
  title: string;
}) {
  const { t } = useTranslation("batches");
  const locator =
    sourceRequest.number === undefined
      ? sourceRequest.locator
      : `#${sourceRequest.number}`;
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="break-words text-xl font-bold text-bp-graphite">
            {title}
          </h2>
          <span className="rounded-md bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700">
            {t("detail.deleted.badge")}
          </span>
        </div>
        {batchId ? (
          <p className="mt-1 break-all font-mono text-sm text-bp-muted">
            {batchId}
          </p>
        ) : null}
        <p className="mt-2 text-sm text-bp-muted">{description}</p>
      </div>
      <ButtonLink to={sourcePath} variant="secondary">
        {t("detail.deleted.openRequest", { locator })}
      </ButtonLink>
    </div>
  );
}
