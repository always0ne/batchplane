import { useTranslation } from "react-i18next";
import { EmptyState } from "../../../components/EmptyState";
import { ErrorState } from "../../../components/ErrorState";
import { LoadingState } from "../../../components/LoadingState";
import type { MyWorkState } from "../hooks/useMyWork";
import { toWorkRow } from "../work-rows";
import { LoadedMyWork } from "./LoadedMyWork";

export function MyWorkContent({ state }: { state: MyWorkState }) {
  const { t } = useTranslation("myWork");

  if (state.type === "loading") {
    return <LoadingState message={t("states.loading")} />;
  }

  if (state.type === "workspace-not-connected") {
    return <EmptyState message={t("states.noSession")} />;
  }

  if (state.type === "error") {
    return <ErrorState message={state.message || t("states.error")} />;
  }

  return (
    <LoadedMyWork
      currentUser={state.inventory.currentUser}
      items={state.inventory.items.map(toWorkRow)}
    />
  );
}
