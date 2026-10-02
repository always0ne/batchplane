import type { BatchDetailArchiveResult } from "@batchplane/ui-client";
import { useTranslation } from "react-i18next";

import { ButtonLink } from "../../../../components/ButtonLink";

export function ArchiveHeader({
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
