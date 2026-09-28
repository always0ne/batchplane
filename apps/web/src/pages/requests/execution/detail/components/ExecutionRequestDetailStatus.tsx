import { useTranslation } from "react-i18next";

export function ExecutionRequestDetailStatus({
  actionErrorMessage,
  completedAction,
  pendingRead,
  postCreateError,
  requestId,
  unavailableRead,
}: {
  actionErrorMessage?: string;
  completedAction?: "approve" | "reject";
  pendingRead: boolean;
  postCreateError: boolean;
  requestId: string;
  unavailableRead: boolean;
}) {
  const { t } = useTranslation("executionRequests");

  return (
    <>
      {completedAction ? (
        <p
          className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800"
          role="status"
        >
          {t(
            `detail.result.${completedAction === "approve" ? "approved" : "rejected"}`,
            { requestId },
          )}
        </p>
      ) : null}
      {actionErrorMessage !== undefined ? (
        <p
          className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800"
          role="alert"
        >
          {actionErrorMessage || t("detail.result.failed")}
        </p>
      ) : null}
      {postCreateError ? (
        <p
          className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900"
          role="alert"
        >
          {t("states.autoApprovalEvidenceMissing")}
        </p>
      ) : null}
      {pendingRead ? (
        <p className="mt-4 text-sm font-medium text-amber-800" role="status">
          {t("detail.states.pending")}
        </p>
      ) : null}
      {unavailableRead ? (
        <p className="mt-4 text-sm font-medium text-red-800" role="alert">
          {t("detail.states.unavailable")}
        </p>
      ) : null}
    </>
  );
}
