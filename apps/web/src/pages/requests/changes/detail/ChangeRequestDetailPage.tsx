import { Link, useParams } from "react-router";
import { useTranslation } from "react-i18next";

import { EmptyState } from "../../../../components/EmptyState";
import { ErrorState } from "../../../../components/ErrorState";
import { LoadingState } from "../../../../components/LoadingState";
import { ChangeRequestDetailContent } from "./components/ChangeRequestDetailContent";
import { ChangeRequestDetailHeader } from "./components/ChangeRequestDetailHeader";
import { useChangeRequestDetail } from "./hooks/useChangeRequestDetail";

export function ChangeRequestDetailPage() {
  const { requestLocator = "" } = useParams();
  const { t } = useTranslation("approvals");
  const change = useChangeRequestDetail(requestLocator);

  if (change.detailState.type === "loading") {
    return <LoadingState message={t("registrationDetail.states.loading")} />;
  }

  if (change.detailState.type === "not-found") {
    return (
      <EmptyState
        action={
          <Link
            className="font-semibold text-bp-control underline"
            to="/approvals"
          >
            {t("registrationDetail.actions.backToApprovals")}
          </Link>
        }
        message={t("registrationDetail.states.notFound", { requestLocator })}
      />
    );
  }

  if (change.detailState.type === "workspace-not-connected") {
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
        message={t("registrationDetail.states.noSession")}
      />
    );
  }

  if (change.detailState.type === "error") {
    return (
      <ErrorState
        message={
          change.detailState.message || t("registrationDetail.states.error")
        }
      />
    );
  }

  const detail = change.detailState.detail;

  return (
    <section>
      <ChangeRequestDetailHeader
        detail={detail}
        onRefresh={change.refresh}
        runningAction={change.runningAction}
      />
      {change.actionError ? (
        <p
          className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800"
          role="alert"
        >
          {change.actionError || t("registrationDetail.actions.actionFailed")}
        </p>
      ) : null}
      <ChangeRequestDetailContent
        detail={detail}
        onAction={change.applyAction}
        runningAction={change.runningAction}
      />
    </section>
  );
}
