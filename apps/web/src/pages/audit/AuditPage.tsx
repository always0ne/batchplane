import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../../components/PageHeader";
import { AuditContent } from "./AuditTimeline";
import { useAuditTimeline } from "./useAuditTimeline";

export function AuditPage() {
  const { t } = useTranslation("audit");
  const { state, refresh } = useAuditTimeline();

  return (
    <section>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <div className="mb-4 flex justify-end">
        <button
          className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bp-graphite shadow-sm hover:border-bp-git"
          type="button"
          onClick={refresh}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {t("actions.refresh")}
        </button>
      </div>
      <AuditContent state={state} />
    </section>
  );
}
