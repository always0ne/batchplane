import { ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useWorkspaceInstallation } from "../../hooks/useWorkspaceInstallation";
import type { WorkspaceInspectionState } from "../../hooks/useWorkspaceInspection";
import { InstallationStatus } from "./InstallationStatus";

export function WorkspaceInstallation({
  inspection,
}: {
  inspection: WorkspaceInspectionState;
}) {
  const { t } = useTranslation("settings");
  const { requestState, createRequest } = useWorkspaceInstallation(inspection);
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-bp-graphite">
            {t("installation.title")}
          </h2>
          <p className="mt-2 text-sm text-bp-muted">
            {t("installation.subtitle")}
          </p>
        </div>
        <ShieldCheck
          className="h-5 w-5 shrink-0 text-bp-git"
          aria-hidden="true"
        />
      </div>
      <InstallationStatus
        inspection={inspection}
        requestState={requestState}
        onCreateRequest={createRequest}
      />
    </article>
  );
}
