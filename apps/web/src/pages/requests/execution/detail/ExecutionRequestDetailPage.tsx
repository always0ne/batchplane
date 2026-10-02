import { useMemo } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { EmptyState } from "../../../../components/EmptyState";
import { ErrorState } from "../../../../components/ErrorState";
import { LoadingState } from "../../../../components/LoadingState";
import { ExecutionRequestContent } from "./components/ExecutionRequestContent";
import { ExecutionRequestDecision } from "./components/ExecutionRequestDecision";
import { ExecutionRequestEvidence } from "./components/ExecutionRequestEvidence";
import { ExecutionRequestDetailHeader } from "./components/ExecutionRequestDetailHeader";
import { ExecutionRequestDetailStatus } from "./components/ExecutionRequestDetailStatus";
import { useExecutionRequestDetail } from "./hooks/useExecutionRequestDetail";
import {
  initialRequestFrom,
  latestAttempt,
  postCreateErrorFrom,
} from "./execution-request-detail-view";

export function ExecutionRequestDetailPage() {
  const { requestLocator = "" } = useParams();
  const location = useLocation();
  const { t } = useTranslation("executionRequests");
  const initialRequest = useMemo(
    () => initialRequestFrom(location.state, requestLocator),
    [location.state, requestLocator],
  );
  const detail = useExecutionRequestDetail({
    initialRequest,
    requestLocator,
  });

  if (detail.state.type === "loading") {
    return <LoadingState message={t("detail.states.loading")} />;
  }
  if (detail.state.type === "workspace-not-connected") {
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
        message={t("detail.states.noSession")}
      />
    );
  }
  if (detail.state.type === "not-found") {
    return (
      <EmptyState
        action={
          <Link
            className="font-semibold text-bp-control underline"
            to="/approvals"
          >
            {t("detail.actions.backToApprovals")}
          </Link>
        }
        message={t("detail.states.notFound", { requestLocator })}
      />
    );
  }
  if (detail.state.type === "error") {
    return (
      <ErrorState message={detail.state.message || t("detail.states.error")} />
    );
  }

  const request = detail.state.request;
  const postCreateError = postCreateErrorFrom(location.state, request);
  const attempt = latestAttempt(request);
  const isBusy = Boolean(detail.runningAction);
  const scheduled = request.triggerType === "SCHEDULE";
  const canAct =
    !scheduled &&
    (request.capability.canApprove || request.capability.canReject);

  return (
    <section className="min-w-0">
      <ExecutionRequestDetailHeader
        attempt={attempt}
        isBusy={isBusy}
        onRefresh={detail.refresh}
        request={request}
      />
      <ExecutionRequestDetailStatus
        actionErrorMessage={
          detail.actionError ? detail.actionError.message : undefined
        }
        completedAction={detail.completedAction}
        pendingRead={detail.state.readState === "pending"}
        postCreateError={postCreateError}
        requestId={request.requestId}
        unavailableRead={detail.state.readState === "unavailable"}
      />

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_28rem]">
        <ExecutionRequestContent request={request} />
        <aside className="min-w-0 space-y-4">
          <ExecutionRequestEvidence attempt={attempt} request={request} />
          <ExecutionRequestDecision
            canAct={canAct}
            isBusy={isBusy}
            onAction={(action, reason) =>
              void detail.applyAction(action, reason)
            }
            request={request}
            runningAction={detail.runningAction}
            scheduled={scheduled}
          />
        </aside>
      </div>
    </section>
  );
}
