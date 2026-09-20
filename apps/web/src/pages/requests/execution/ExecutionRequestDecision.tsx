import type {
  ExecutionRequest,
  ExecutionRequestCapability,
} from "@batchplane/ui-client";
import { useTranslation } from "react-i18next";

import { ExecutionApprovalActions } from "./ExecutionApprovalActions";

export function ExecutionRequestDecision({
  canAct,
  isBusy,
  onAction,
  request,
  runningAction,
  scheduled,
}: {
  canAct: boolean;
  isBusy: boolean;
  onAction: (action: "approve" | "reject", reason?: string) => void;
  request: ExecutionRequest;
  runningAction: "approve" | "reject" | undefined;
  scheduled: boolean;
}) {
  const { t } = useTranslation("executionRequests");

  if (canAct) {
    return (
      <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-bp-graphite">
          {t("detail.actions.title")}
        </h2>
        <p className="mt-2 text-sm text-bp-muted">{t("detail.actions.note")}</p>
        {request.approvalNotice?.kind === "SELF_APPROVAL_ALLOWED" ? (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
            {t("detail.values.selfApprovalAllowed", {
              mode: request.approvalNotice.mode,
            })}
          </p>
        ) : null}
        <ExecutionApprovalActions
          approveDisabled={!request.capability.canApprove}
          approveDisabledReason={approvalUnavailableReason(
            request.capability,
            t,
          )}
          approveLabel={t("detail.actions.approve")}
          disabled={isBusy}
          isApproving={runningAction === "approve"}
          isRejecting={runningAction === "reject"}
          onApprove={() => onAction("approve")}
          onReject={(reason) => onAction("reject", reason)}
          rejectDisabled={!request.capability.canReject}
          rejectLabel={t("detail.actions.reject")}
        />
      </article>
    );
  }

  if (!scheduled) {
    return (
      <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-bp-graphite">
          {t("detail.actions.closedTitle")}
        </h2>
        <p className="mt-2 text-sm font-semibold text-bp-muted">
          {t(`detail.statusHelp.${request.status}`)}
        </p>
      </article>
    );
  }

  return null;
}

function approvalUnavailableReason(
  capability: ExecutionRequestCapability,
  t: (key: string) => string,
): string {
  return capability.approveUnavailableReason === "SELF_APPROVAL_BLOCKED"
    ? t("detail.values.selfApprovalBlocked")
    : "";
}
