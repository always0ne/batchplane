import { FilePlus2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../../components/Button";
import type { WorkspaceInspectionState } from "../../hooks/useWorkspaceInspection";
import type { InstallationRequestVariant } from "../../hooks/useWorkspaceInstallation";

export function InstallationReadiness({
  inspection,
  onCreateRequest,
}: {
  inspection: Extract<WorkspaceInspectionState, { type: "loaded" }>;
  onCreateRequest: (variant: InstallationRequestVariant) => Promise<void>;
}) {
  const { t } = useTranslation("settings");
  const installation = inspection.data.installation;

  if (installation.installed && installation.availableRequest === null) {
    return (
      <p className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
        {t("installation.installed")}
      </p>
    );
  }

  const variant =
    installation.availableRequest === "UPDATE" ? "update" : "install";
  const evidence = installation.installed
    ? installation.outdatedEvidence
    : installation.missingEvidence;
  const readinessMessage = t(
    installation.installed ? "installation.outdated" : "installation.missing",
  );
  const actionLabel = t(
    variant === "update"
      ? "installation.createUpdateRequest"
      : "installation.createRequest",
  );

  return (
    <div className="mt-5 space-y-4">
      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        <p className="font-semibold">{readinessMessage}</p>
        <ul className="mt-2 space-y-1 font-mono text-xs">
          {evidence.map((label) => (
            <li className="break-all" key={label}>
              {label}
            </li>
          ))}
        </ul>
      </div>
      {installation.availableRequest ? (
        <span className="block">
          <Button
            variant="primary"
            className="w-full justify-center"
            disabled={inspection.type !== "loaded"}
            onClick={() => void onCreateRequest(variant)}
          >
            <FilePlus2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            {actionLabel}
          </Button>
        </span>
      ) : null}
    </div>
  );
}
