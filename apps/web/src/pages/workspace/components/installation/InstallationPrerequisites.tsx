import { FilePlus2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../../components/Button";
import type { WorkspaceInspectionState } from "../../hooks/useWorkspaceInspection";
import { WorkspaceInstallationError } from "./WorkspaceInstallationError";

export function InstallationPrerequisites({
  inspection,
}: {
  inspection: Extract<WorkspaceInspectionState, { type: "idle" | "error" }>;
}) {
  const { t } = useTranslation("settings");

  return (
    <div className="mt-5 space-y-3">
      {inspection.type === "error" ? (
        <WorkspaceInstallationError error={inspection.error} />
      ) : (
        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-bp-muted">
          {t("installation.idle")}
        </p>
      )}
      <span className="block" title={t("installation.verifiedRequired")}>
        <Button variant="primary" className="w-full justify-center" disabled>
          <FilePlus2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t("installation.createRequest")}
        </Button>
      </span>
    </div>
  );
}
