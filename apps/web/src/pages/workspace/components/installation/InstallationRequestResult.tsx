import type { WorkspaceInstallationRequest } from "@batchplane/ui-client";
import { useTranslation } from "react-i18next";
import type { InstallationRequestVariant } from "../../hooks/useWorkspaceInstallation";

export function InstallationRequestResult({
  result,
  variant,
}: {
  result: WorkspaceInstallationRequest;
  variant: InstallationRequestVariant;
}) {
  const { t } = useTranslation("settings");
  const resultMessage = t(
    variant === "update"
      ? "installation.updateSuccess"
      : "installation.installSuccess",
  );

  return (
    <div className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
      <p className="font-semibold">{t("installation.success")}</p>
      <p className="mt-1 font-semibold">{resultMessage}</p>
      <a
        className="mt-2 inline-flex break-words font-semibold underline"
        href={result.request.sourceUrl}
        rel="noreferrer"
        target="_blank"
      >
        {result.request.label}
      </a>
    </div>
  );
}
