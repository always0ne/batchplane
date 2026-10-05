import { AlertCircle, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PolicyRequestState } from "../../hooks/useWorkspacePolicy";
import type { WorkspaceInspectionState } from "../../hooks/useWorkspaceInspection";
import { formatWorkspaceError } from "../../workspace-errors";
import { PolicyChangeRequestResult } from "./PolicyChangeRequestResult";

export function WorkspacePolicyStatus({
  inspection,
  requestState,
}: {
  inspection: WorkspaceInspectionState;
  requestState: PolicyRequestState;
}) {
  const { t } = useTranslation("settings");
  const error = workspacePolicyError(requestState, inspection);
  const createdRequest =
    requestState.type === "success" ? requestState.result : undefined;

  let progressMessage: string | undefined;
  if (requestState.type === "creating") {
    progressMessage = t("workspacePolicy.creating");
  } else if (inspection.type === "checking") {
    progressMessage = t("workspacePolicy.checking");
  }

  return (
    <>
      {inspection.type === "idle" ? (
        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-bp-muted">
          {t("workspacePolicy.idle")}
        </p>
      ) : null}
      {progressMessage !== undefined ? (
        <p className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-bp-muted">
          <Loader2
            className="h-4 w-4 shrink-0 animate-spin"
            aria-hidden="true"
          />
          {progressMessage}
        </p>
      ) : null}
      {createdRequest ? (
        <PolicyChangeRequestResult result={createdRequest} />
      ) : null}
      {error ? (
        <div
          role="alert"
          className="flex gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="min-w-0 break-words font-semibold">
            {formatWorkspaceError(error, t)}
          </p>
        </div>
      ) : null}
    </>
  );
}

function workspacePolicyError(
  requestState: PolicyRequestState,
  inspection: WorkspaceInspectionState,
): unknown | undefined {
  if (requestState.type === "error") {
    return requestState.error;
  }

  if (inspection.type === "error") {
    return inspection.error;
  }

  return undefined;
}
