import type { RequestInventoryItem } from "@batchplane/ui-client";
import { ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ButtonLink } from "../../../components/ButtonLink";
import { ExecutionApprovalActions } from "../../requests/execution/components/ExecutionApprovalActions";
import type { ActionState, ExecutionAction } from "../approval-types";
import { approvalDisabledReason } from "../approval-display";
import { ApprovalMeta } from "./ApprovalMeta";

export function ExecutionApproval({
  actionState,
  actionsDisabled,
  item,
  onAction,
}: {
  actionState: ActionState;
  actionsDisabled: boolean;
  item: Extract<RequestInventoryItem, { kind: "EXECUTION" }>;
  onAction: ExecutionAction;
}) {
  const { t } = useTranslation("approvals");
  const request = item.request;
  const isRunning =
    actionState.type === "running" &&
    actionState.requestLocator === request.requestLocator;
  const approveDisabledReason = approvalDisabledReason(request, t);

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="break-words text-lg font-semibold text-bp-graphite">
            {request.title}
          </h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {request.sourceUrl ? (
            <a
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-bp-graphite hover:border-bp-git"
              href={request.sourceUrl}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              {t("actions.openIssue")}
            </a>
          ) : null}
          <ButtonLink
            className="h-10 justify-center hover:bg-bp-graphite"
            size="compact"
            to={`/execution-requests/${encodeURIComponent(request.requestLocator)}`}
            variant="primary"
          >
            {t("actions.viewDetails")}
          </ButtonLink>
        </div>
      </div>
      <h4 className="mt-5 text-base font-semibold text-bp-graphite">
        {t("context.executionTitle")}
      </h4>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <ApprovalMeta label={t("fields.batchId")} value={request.batchId} />
        <ApprovalMeta label={t("fields.requestId")} value={request.requestId} />
        <ApprovalMeta
          label={t("fields.requestedBy")}
          value={request.requestedBy || t("values.unknown")}
        />
        <ApprovalMeta
          label={t("fields.expiresAt")}
          value={request.expiresAt || t("values.unknown")}
        />
        <ApprovalMeta
          label={t("fields.requestDigest")}
          value={request.evidence.requestDigest || t("values.unknown")}
        />
        <ApprovalMeta
          label={t("fields.workflow")}
          value={
            request.executionTarget
              ? `${request.executionTarget.targetName}@${request.executionTarget.targetRevision}`
              : t("values.unknown")
          }
        />
        <ApprovalMeta
          label={t("fields.runsOn")}
          value={
            request.executionTarget?.executionEnvironment || t("values.unknown")
          }
        />
        <ApprovalMeta
          label={t("fields.command")}
          value={request.executionTarget?.command ?? t("values.unknown")}
        />
        <ApprovalMeta
          label={t("fields.gate")}
          value={
            request.batch.gateRequired
              ? t("values.gateRequired")
              : t("values.gateNonCompliant")
          }
        />
      </dl>
      <div className="mt-4 rounded-md bg-slate-50 p-3 text-sm text-bp-graphite">
        <p className="text-xs font-bold uppercase text-bp-muted">
          {t("fields.reason")}
        </p>
        <p className="mt-1 break-words">
          {request.reason || t("values.unknown")}
        </p>
      </div>
      <ExecutionApprovalActions
        approveDisabled={!request.capability.canApprove}
        approveDisabledReason={approveDisabledReason}
        approveLabel={t("actions.approveExecution")}
        disabled={actionsDisabled}
        isApproving={isRunning && actionState.action === "approve"}
        isRejecting={isRunning && actionState.action === "reject"}
        onApprove={() => void onAction(request, "approve")}
        onReject={(reason) => void onAction(request, "reject", reason)}
        rejectLabel={t("actions.reject")}
        rejectDisabled={!request.capability.canReject}
      />
    </article>
  );
}
