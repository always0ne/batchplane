import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../components/Button";
import { PageHeader } from "../../../components/PageHeader";
import { WorkspaceRequestsContent } from "./components/WorkspaceRequestsContent";
import { useWorkspaceRequests } from "./hooks/useWorkspaceRequests";

export function RequestListPage() {
  const { t } = useTranslation("requests");
  const requests = useWorkspaceRequests();

  return (
    <section>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <div className="mb-4 flex justify-end">
        <Button
          className="shadow-sm hover:border-bp-git"
          size="compact"
          disabled={requests.state.type === "loading"}
          onClick={requests.refresh}
          type="button"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {t("actions.refresh")}
        </Button>
      </div>
      <WorkspaceRequestsContent state={requests.state} />
    </section>
  );
}
