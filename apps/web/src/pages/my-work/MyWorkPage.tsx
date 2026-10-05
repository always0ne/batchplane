import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/PageHeader";
import { MyWorkContent } from "./components/MyWorkContent";
import { useMyWork } from "./hooks/useMyWork";

export function MyWorkPage() {
  const { t } = useTranslation("myWork");
  const myWork = useMyWork();

  return (
    <section>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <div className="mb-4 flex justify-end">
        <Button
          className="shadow-sm hover:border-bp-git"
          size="compact"
          disabled={myWork.state.type === "loading"}
          onClick={myWork.refresh}
          type="button"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {t("actions.refresh")}
        </Button>
      </div>
      <MyWorkContent state={myWork.state} />
    </section>
  );
}
