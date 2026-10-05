import { useTranslation } from "react-i18next";
import { EmptyState } from "../../../components/EmptyState";
import { ErrorState } from "../../../components/ErrorState";
import { LoadingState } from "../../../components/LoadingState";
import { formatInspectionError } from "../../../client/inspection-errors";
import type { AuditTimelineState } from "../hooks/useAuditTimeline";
import { LoadedAudit } from "./LoadedAudit";

export function AuditContent({ state }: { state: AuditTimelineState }) {
  const { t } = useTranslation("audit");

  if (state.type === "loading") {
    return <LoadingState message={t("states.loading")} />;
  }

  if (state.type === "no-session") {
    return <EmptyState message={t("states.noSession")} />;
  }

  if (state.type === "error") {
    return (
      <ErrorState
        message={formatInspectionError(state.error, t, "states.error")}
      />
    );
  }

  return <LoadedAudit items={state.items} />;
}
