import type { WorkspaceApprovalMode } from "@batchplane/ui-client";
import type { TFunction } from "i18next";
import { FilePlus2, SlidersHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../../components/Button";
import {
  useWorkspacePolicy,
  type PolicyRequestState,
} from "../../hooks/useWorkspacePolicy";
import type { WorkspaceInspectionState } from "../../hooks/useWorkspaceInspection";
import { ApprovalModeSelection } from "./ApprovalModeSelection";
import { WorkspacePolicyStatus } from "./WorkspacePolicyStatus";

export function WorkspacePolicy({
  inspection,
}: {
  inspection: WorkspaceInspectionState;
}) {
  const { t } = useTranslation("settings");
  const policy = useWorkspacePolicy(inspection);
  const { requestState, selectedMode, currentPolicy } = policy;
  const currentMode = currentPolicy?.approval.mode;
  const unavailable = policyActionUnavailableMessage(
    inspection,
    requestState,
    selectedMode,
    currentMode,
    t,
  );

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-bp-graphite">
            {t("workspacePolicy.title")}
          </h2>
          <p className="mt-2 text-sm text-bp-muted">
            {t("workspacePolicy.subtitle")}
          </p>
        </div>
        <SlidersHorizontal
          className="h-5 w-5 shrink-0 text-bp-git"
          aria-hidden="true"
        />
      </div>
      <div className="mt-5 space-y-4">
        <ApprovalModeSelection
          selectedMode={selectedMode}
          currentMode={currentMode}
          disabled={inspection.type !== "loaded"}
          onSelect={policy.setSelectedMode}
        />
        <WorkspacePolicyStatus
          inspection={inspection}
          requestState={requestState}
        />
        <span className="block" title={unavailable}>
          <Button
            variant="primary"
            className="w-full justify-center"
            disabled={Boolean(unavailable)}
            onClick={() => void policy.createRequest()}
          >
            <FilePlus2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t("workspacePolicy.createRequest")}
          </Button>
        </span>
      </div>
    </article>
  );
}

function policyActionUnavailableMessage(
  inspection: WorkspaceInspectionState,
  requestState: PolicyRequestState,
  selectedMode: WorkspaceApprovalMode,
  currentMode: WorkspaceApprovalMode | undefined,
  translate: TFunction,
): string | undefined {
  if (inspection.type !== "loaded") {
    return translate("workspacePolicy.checkFirst");
  }

  if (requestState.type === "creating") {
    return translate("workspacePolicy.creating");
  }

  if (requestState.type === "success") {
    return translate("workspacePolicy.pendingRequest");
  }

  if (selectedMode === currentMode) {
    return translate("workspacePolicy.chooseDifferentMode");
  }

  return undefined;
}
