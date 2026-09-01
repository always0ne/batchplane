import { useTranslation } from "react-i18next";

import { PageHeader } from "../../ui/PageHeader";
import { BatchListContent } from "./BatchListContent";
import { BatchListToolbar } from "./BatchListToolbar";
import { useBatchList } from "./useBatchList";

export function BatchesPage() {
  const { t } = useTranslation("batches");
  const batchList = useBatchList(t("states.error"));

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title={t("title")} subtitle={t("subtitle")} />
        <BatchListToolbar
          isLoading={batchList.state.type === "loading"}
          onRefresh={batchList.refresh}
        />
      </div>
      <BatchListContent state={batchList.state} />
    </section>
  );
}
