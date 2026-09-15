import type { ExecutionAttempt, ExecutionRequest } from "@batchplane/ui-client";
import { useMemo } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { EmptyState, ErrorState, LoadingState } from "../../ui/PageState";
import { ExecutionRequestContent } from "./ExecutionRequestContent";
import { ExecutionRequestDecision } from "./ExecutionRequestDecision";
import { ExecutionRequestEvidence } from "./ExecutionRequestEvidence";
import { ExecutionRequestDetailHeader } from "./ExecutionRequestDetailHeader";
import { ExecutionRequestDetailStatus } from "./ExecutionRequestDetailStatus";
import { useExecutionRequestDetail } from "./useExecutionRequestDetail";

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
            to="/lite/setup"
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

function initialRequestFrom(
  state: unknown,
  requestLocator: string,
): ExecutionRequest | null {
  if (!state || typeof state !== "object") return null;
  const request = (state as { createdExecutionRequest?: unknown })
    .createdExecutionRequest;
  if (!request || typeof request !== "object") return null;
  const candidate = request as Partial<ExecutionRequest>;
  return candidate.requestLocator === requestLocator &&
    typeof candidate.requestId === "string" &&
    typeof candidate.evidence?.requestDigest === "string"
    ? (candidate as ExecutionRequest)
    : null;
}

function postCreateErrorFrom(
  state: unknown,
  request: ExecutionRequest,
): boolean {
  if (!state || typeof state !== "object") return false;
  const error = (state as { executionRequestPostCreateError?: unknown })
    .executionRequestPostCreateError;
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    code?: unknown;
    requestDigest?: unknown;
    requestId?: unknown;
    requestLocator?: unknown;
  };
  return (
    candidate.code === "AUTO_APPROVAL_RECORDING_FAILED" &&
    candidate.requestDigest === request.evidence.requestDigest &&
    candidate.requestId === request.requestId &&
    candidate.requestLocator === request.requestLocator
  );
}

function latestAttempt(request: ExecutionRequest): ExecutionAttempt | null {
  if (request.attempts.type !== "loaded") return null;

  return (
    [...request.attempts.attempts].sort((left, right) => {
      const chronology = attemptTimestamp(right) - attemptTimestamp(left);
      if (chronology !== 0) return chronology;
      return right.attempt - left.attempt;
    })[0] ?? null
  );
}

function attemptTimestamp(attempt: ExecutionAttempt): number {
  const value = attempt.completedAt ?? attempt.startedAt;
  const timestamp = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(timestamp) ? 0 : timestamp;
}
