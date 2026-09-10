import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { PageHeader } from "../../ui/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "../../ui/PageState";
import { BatchChangeEditorSession } from "./BatchChangeEditorSession";
import { useBatchChangeDraftLoader } from "./useBatchChangeDraftLoader";

export function BatchRegistrationPage() {
  const [searchParams] = useSearchParams();
  const changeBatchId = searchParams.get("change")?.trim() ?? "";
  const deleteBatchId = searchParams.get("delete")?.trim() ?? "";
  const mode = deleteBatchId ? "delete" : changeBatchId ? "change" : "create";
  const targetBatchId = deleteBatchId || changeBatchId;

  return (
    <BatchRegistrationLoadBoundary
      key={`${mode}:${targetBatchId}`}
      mode={mode}
      targetBatchId={targetBatchId}
    />
  );
}

function BatchRegistrationLoadBoundary({
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
            to="/lite/setup"
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
      loadState.blocker.kind === "GOVERNED_CHANGE"
        ? `/approvals/registration/${encodeURIComponent(loadState.blocker.requestLocator)}`
        : `/execution-requests/${encodeURIComponent(loadState.blocker.requestLocator)}`;

    return (
      <section>
        <PageHeader
          subtitle={t(pageCopyKey(mode, "subtitle"))}
          title={t(pageCopyKey(mode, "title"))}
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
      key={`${mode}:${targetBatchId}:${loadState.draft.governedChangeId ?? ""}`}
      initialDraft={loadState.draft}
      mode={mode}
      targetBatchId={targetBatchId}
    />
  );
}

function pageCopyKey(
  mode: "create" | "change" | "delete",
  field: "title" | "subtitle",
): string {
  if (mode === "create") return field;
  return mode === "delete" ? `${field}Delete` : `${field}Change`;
}
