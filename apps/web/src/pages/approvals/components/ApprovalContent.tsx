import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { EmptyState } from "../../../components/EmptyState";
import { ErrorState } from "../../../components/ErrorState";
import { LoadingState } from "../../../components/LoadingState";
import type { ApprovalRequestsState } from "../hooks/useApprovalRequests";
import type { ActionState, ExecutionAction } from "../approval-types";
import { ApprovalSection } from "./ApprovalSection";
import { ChangeRequestApproval } from "./ChangeRequestApproval";
import { ExecutionApproval } from "./ExecutionApproval";

export function ApprovalContent({
  actionState,
  actionsDisabled,
  onExecutionAction,
  state,
}: {
  actionState: ActionState;
  actionsDisabled: boolean;
  onExecutionAction: ExecutionAction;
  state: ApprovalRequestsState;
}) {
  const { t } = useTranslation("approvals");

  if (state.type === "loading") {
    return <LoadingState message={t("states.loading")} />;
  }

  if (state.type === "workspace-not-connected") {
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

  if (state.type === "error") {
    return <ErrorState message={state.message || t("states.error")} />;
  }

  const changeRequests = state.inventory.requests.filter(
    (item) => item.kind === "CHANGE_REQUEST",
  );
  const executionRequests = state.inventory.requests.filter(
    (item) => item.kind === "EXECUTION",
  );

  if (changeRequests.length === 0 && executionRequests.length === 0) {
    return (
      <EmptyState
        message={t("states.empty", {
          branch: state.inventory.workspaceDefaultBranch,
        })}
      />
    );
  }

  return (
    <div className="space-y-6">
      {changeRequests.length > 0 ? (
        <ApprovalSection title={t("sections.registration")}>
          {changeRequests.map((item) => (
            <ChangeRequestApproval
              key={item.request.requestLocator}
              item={item}
            />
          ))}
        </ApprovalSection>
      ) : null}
      {executionRequests.length > 0 ? (
        <ApprovalSection title={t("sections.execution")}>
          {executionRequests.map((item) => (
            <ExecutionApproval
              actionState={actionState}
              actionsDisabled={actionsDisabled}
              item={item}
              key={item.request.requestLocator}
              onAction={onExecutionAction}
            />
          ))}
        </ApprovalSection>
      ) : null}
    </div>
  );
}
