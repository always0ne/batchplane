import { useTranslation } from "react-i18next";
import { StatusRow } from "../../ui/StatusRow";
import type { WorkspaceInspectionState } from "./useWorkspaceInspection";
import { formatWorkspaceError } from "./workspace-errors";

export function WorkspaceConnectionStatus({
  state,
}: {
  state: WorkspaceInspectionState;
}) {
  const { t } = useTranslation("settings");

  if (state.type === "loaded")
    return (
      <dl className="mt-5 space-y-3 text-sm">
        <StatusRow label={t("session.status")} value={t("session.connected")} />
        <StatusRow
          label={t("session.user")}
          value={state.data.connection.currentUser}
        />
        <StatusRow
          label={t("session.connectionLabel")}
          value={state.data.connection.label}
        />
        <StatusRow
          label={t("session.defaultRevision")}
          value={state.data.connection.defaultRevision}
        />
      </dl>
    );

  if (state.type === "checking")
    return (
      <p className="mt-5 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-bp-muted">
        {t("session.checking")}
      </p>
    );

  if (state.type === "error")
    return (
      <p
        role="alert"
        className="mt-5 break-words rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700"
      >
        {formatWorkspaceError(state.error, t)}
      </p>
    );

  return (
    <p className="mt-5 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-bp-muted">
      {t("session.empty")}
    </p>
  );
}
