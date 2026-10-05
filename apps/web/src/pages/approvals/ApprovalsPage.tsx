import type { ExecutionRequest } from "@batchplane/ui-client";
import { Loader2, RefreshCw } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/Button";

import { useBatchPlaneClient } from "../../client/batch-plane-client-context";
import { PageHeader } from "../../components/PageHeader";
import { useApprovalRequests } from "./hooks/useApprovalRequests";
import { ApprovalContent } from "./components/ApprovalContent";
import type { ActionState } from "./approval-types";

export function ApprovalsPage() {
  const { t } = useTranslation("approvals");
  const client = useBatchPlaneClient();
  const approvals = useApprovalRequests();
  const [actionState, setActionState] = useState<ActionState>({ type: "idle" });
  const actionInFlight = useRef(false);

  async function applyExecutionAction(
    request: ExecutionRequest,
    action: "approve" | "reject",
    reason = "",
  ) {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setActionState({
      action,
      requestLocator: request.requestLocator,
      type: "running",
    });

    try {
      const updated =
        action === "approve"
          ? await client.approveExecutionRequest({
              requestLocator: request.requestLocator,
            })
          : await client.rejectExecutionRequest({
              reason,
              requestLocator: request.requestLocator,
            });
      setActionState({
        message:
          action === "approve"
            ? t("result.executionApproved", { requestId: updated.requestId })
            : t("result.executionRejected", { requestId: updated.requestId }),
        type: "success",
      });
      approvals.applyExecutionResult(updated);
    } catch (error) {
      setActionState({
        message: messageFrom(error) || t("states.error"),
        type: "error",
      });
    } finally {
      actionInFlight.current = false;
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title={t("title")} subtitle={t("subtitle")} />
        <div className="space-y-1 text-right">
          <Button
            disabled={
              approvals.state.type === "loading" ||
              actionState.type === "running"
            }
            onClick={approvals.refresh}
            type="button"
          >
            {approvals.state.type === "loading" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            )}
            {t("actions.refresh")}
          </Button>
          <p className="text-xs text-bp-muted">{t("states.githubLagHint")}</p>
        </div>
      </div>

      {actionState.type === "success" || actionState.type === "error" ? (
        <p
          className={[
            "mb-4 rounded-md border px-3 py-2 text-sm font-medium",
            actionState.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800",
          ].join(" ")}
          role={actionState.type === "error" ? "alert" : "status"}
        >
          {actionState.message}
        </p>
      ) : null}

      <ApprovalContent
        actionState={actionState}
        actionsDisabled={actionState.type === "running"}
        onExecutionAction={applyExecutionAction}
        state={approvals.state}
      />
    </section>
  );
}

function messageFrom(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : "";
}
