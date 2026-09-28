import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { WorkspaceInspectionState } from "../../hooks/useWorkspaceInspection";
import type {
  InstallationRequestState,
  InstallationRequestVariant,
} from "../../hooks/useWorkspaceInstallation";
import { InstallationPrerequisites } from "./InstallationPrerequisites";
import { InstallationReadiness } from "./InstallationReadiness";
import { InstallationRequestResult } from "./InstallationRequestResult";
import { WorkspaceInstallationError } from "./WorkspaceInstallationError";

export function InstallationStatus({
  inspection,
  requestState,
  onCreateRequest,
}: {
  inspection: WorkspaceInspectionState;
  requestState: InstallationRequestState;
  onCreateRequest: (variant: InstallationRequestVariant) => Promise<void>;
}) {
  const { t } = useTranslation("settings");

  if (requestState.type === "success") {
    return (
      <InstallationRequestResult
        result={requestState.result}
        variant={requestState.variant}
      />
    );
  }

  if (requestState.type === "creating" || inspection.type === "checking") {
    const progressMessage = t(
      requestState.type === "creating"
        ? "installation.creating"
        : "installation.checking",
    );
    return (
      <p className="mt-5 inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-bp-muted">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
        {progressMessage}
      </p>
    );
  }

  if (inspection.type === "error") {
    return <InstallationPrerequisites inspection={inspection} />;
  }
  if (requestState.type === "error") {
    return <WorkspaceInstallationError error={requestState.error} />;
  }
  if (inspection.type !== "loaded") {
    return <InstallationPrerequisites inspection={inspection} />;
  }

  return (
    <InstallationReadiness
      inspection={inspection}
      onCreateRequest={onCreateRequest}
    />
  );
}
