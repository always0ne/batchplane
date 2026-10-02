import { useTranslation } from "react-i18next";
import { EmptyState } from "../../../../components/EmptyState";
import { ErrorState } from "../../../../components/ErrorState";
import { LoadingState } from "../../../../components/LoadingState";
import type { WorkspaceRequestsState } from "../hooks/useWorkspaceRequests";
import { LoadedWorkspaceRequests } from "./LoadedWorkspaceRequests";

export function WorkspaceRequestsContent({
  state,
}: {
  state: WorkspaceRequestsState;
}) {
  const { t } = useTranslation("requests");

  if (state.type === "loading") {
    return <LoadingState message={t("states.loading")} />;
  }

  if (state.type === "workspace-not-connected") {
    return <EmptyState message={t("states.noSession")} />;
  }

  if (state.type === "error") {
    return <ErrorState message={state.message || t("states.error")} />;
  }

  return <LoadedWorkspaceRequests items={state.inventory.requests} />;
}
