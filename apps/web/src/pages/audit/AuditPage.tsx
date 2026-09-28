import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../../components/PageHeader";
import { Button } from "../../components/Button";
import { AuditContent } from "./components/AuditContent";
import { useAuditTimeline } from "./hooks/useAuditTimeline";

export function AuditPage() {
  const { t } = useTranslation("audit");
  const { state, refresh } = useAuditTimeline();

  return (
    <section>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <div className="mb-4 flex justify-end">
        <Button
          className="shadow-sm hover:border-bp-git"
          size="compact"
          type="button"
          onClick={refresh}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {t("actions.refresh")}
        </Button>
      </div>
      <AuditContent state={state} />
    </section>
  );
}
