import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../../../../../components/PageHeader";
import { EmptyState } from "../../../../../components/EmptyState";
import { ErrorState } from "../../../../../components/ErrorState";
import { LoadingState } from "../../../../../components/LoadingState";
import { useBatchChangeDraftLoader } from "../hooks/useBatchChangeDraftLoader";
import { batchChangeCopy } from "../batch-change-copy";
import { BatchChangeEditorSession } from "./BatchChangeEditorSession";

export function BatchRegistrationLoadBoundary({
  mode,
  targetBatchId,
}: {
  mode: "create" | "change" | "delete";
  targetBatchId: string;
}) {
  const { t } = useTranslation("registration");
  const loadState = useBatchChangeDraftLoader({ mode, targetBatchId });

  if (loadState.type === "loading") {
    return <LoadingState message={t("states.changeLoading")} />;
  }

  if (loadState.type === "error") {
    return (
      <ErrorState message={loadState.message || t("states.changeLoadError")} />
    );
  }

  if (loadState.type === "workspace-not-connected") {
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

  if (loadState.type === "blocked") {
    const detailPath =
      loadState.blocker.kind === "CHANGE_REQUEST"
        ? `/approvals/registration/${encodeURIComponent(loadState.blocker.requestLocator)}`
        : `/execution-requests/${encodeURIComponent(loadState.blocker.requestLocator)}`;

    return (
      <section>
        <PageHeader
          subtitle={t(batchChangeCopy[mode].subtitle)}
          title={t(batchChangeCopy[mode].title)}
        />
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
          <p className="font-semibold">{t("states.changeBlocked")}</p>
          <p className="mt-2">{loadState.blocker.title}</p>
          <Link
            className="mt-4 inline-block font-semibold text-bp-control underline"
            to={detailPath}
          >
            {t("states.openBlockingRequest")}
          </Link>
        </div>
      </section>
    );
  }

  return (
    <BatchChangeEditorSession
      key={`${mode}:${targetBatchId}:${loadState.draft.changeRequestId ?? ""}`}
      initialDraft={loadState.draft}
      mode={mode}
      targetBatchId={targetBatchId}
    />
  );
}
