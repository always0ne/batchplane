import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { formatInspectionError } from "../../../client/inspection-errors";
import { EmptyState } from "../../../components/EmptyState";
import { ErrorState } from "../../../components/ErrorState";
import { LoadingState } from "../../../components/LoadingState";
import type { DashboardState } from "../hooks/useDashboard";
import { LoadedDashboard } from "./LoadedDashboard";

export function DashboardContent({ state }: { state: DashboardState }) {
  const { t } = useTranslation("dashboard");

  if (state.type === "loading") {
    return <LoadingState message={t("states.loading")} />;
  }

  if (state.type === "no-session") {
    return (
      <EmptyState
        action={
          <Link
            className="font-semibold text-bp-control underline"
            to="/workspace"
          >
            {t("actions.openSetup")}
          </Link>
        }
        message={t("states.noSession")}
      />
    );
  }

  if (state.type === "error") {
    return (
      <ErrorState
        message={formatInspectionError(state.error, t, "states.error")}
      />
    );
  }

  return <LoadedDashboard summary={state.summary} />;
}
