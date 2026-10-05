import { AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatWorkspaceError } from "../../workspace-errors";

export function WorkspaceInstallationError({ error }: { error: unknown }) {
  const { t } = useTranslation("settings");
  return (
    <div
      role="alert"
      className="flex gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 break-words font-semibold">
        {formatWorkspaceError(error, t)}
      </p>
    </div>
  );
}
