import { useTranslation } from "react-i18next";
import { PageHeader } from "../../components/PageHeader";
import { DashboardContent } from "./DashboardContent";
import { useDashboard } from "./useDashboard";

export function DashboardPage() {
  const { t } = useTranslation("dashboard");
  const { state } = useDashboard();
  return (
    <section>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <DashboardContent state={state} />
    </section>
  );
}
