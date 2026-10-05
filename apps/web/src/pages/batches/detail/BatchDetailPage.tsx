import { Loader2, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";

import { Button } from "../../../components/Button";
import { PageHeader } from "../../../components/PageHeader";
import { BatchDetailContent } from "./components/BatchDetailContent";
import { useBatchDetail } from "./hooks/useBatchDetail";

export function BatchDetailPage() {
  const { batchId = "" } = useParams();
  const { t } = useTranslation("batches");
  const detail = useBatchDetail(batchId, t("states.detailError"));

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title={t("detail.title")} subtitle={batchId} />
        <Button
          disabled={detail.state.type === "loading"}
          onClick={detail.refresh}
          variant="secondary"
        >
          {detail.state.type === "loading" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          )}
          {t("actions.refresh")}
        </Button>
      </div>
      <BatchDetailContent state={detail.state} />
    </section>
  );
}
