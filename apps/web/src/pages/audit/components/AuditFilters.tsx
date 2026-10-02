import { Filter } from "lucide-react";
import { useTranslation } from "react-i18next";

export function AuditFilters({
  batchFilter,
  batchOptions,
  onBatchChange,
  onRequestChange,
  requestFilter,
  requestOptions,
}: {
  batchFilter: string;
  batchOptions: string[];
  onBatchChange: (value: string) => void;
  onRequestChange: (value: string) => void;
  requestFilter: string;
  requestOptions: string[];
}) {
  const { t } = useTranslation(["audit", "common"]);
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex min-w-0 flex-wrap items-end gap-3">
        <div className="flex min-w-44 flex-1 items-center gap-2 text-sm font-semibold text-bp-muted">
          <Filter className="h-4 w-4 text-bp-git" aria-hidden="true" />
          {t("audit:filters.title")}
        </div>
        <label className="grid min-w-0 basis-56 flex-1 gap-1 text-xs font-semibold uppercase text-bp-muted">
          {t("audit:filters.batch")}
          <select
            className="w-full min-w-0 max-w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm normal-case text-bp-graphite"
            value={batchFilter}
            onChange={(event) => onBatchChange(event.target.value)}
          >
            <option value="">{t("audit:filters.allBatches")}</option>
            {batchOptions.map((batchId) => (
              <option key={batchId} value={batchId}>
                {batchId}
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-0 basis-64 flex-[2] gap-1 text-xs font-semibold uppercase text-bp-muted">
          {t("audit:filters.request")}
          <select
            className="w-full min-w-0 max-w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm normal-case text-bp-graphite"
            value={requestFilter}
            onChange={(event) => onRequestChange(event.target.value)}
          >
            <option value="">{t("audit:filters.allRequests")}</option>
            {requestOptions.map((requestId) => (
              <option key={requestId} value={requestId}>
                {requestId}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}
