import type { WorkspaceApprovalMode } from "@batchplane/ui-client";
import { useTranslation } from "react-i18next";
import { StatusRow } from "../../../../components/StatusRow";

const approvalModes: WorkspaceApprovalMode[] = [
  "SELF_APPROVAL_BLOCKED",
  "SELF_APPROVAL_ALLOWED",
  "AUTO_APPROVE",
];

export function ApprovalModeSelection({
  selectedMode,
  currentMode,
  disabled,
  onSelect,
}: {
  selectedMode: WorkspaceApprovalMode;
  currentMode: WorkspaceApprovalMode | undefined;
  disabled: boolean;
  onSelect: (mode: WorkspaceApprovalMode) => void;
}) {
  const { t } = useTranslation("settings");

  return (
    <>
      <label className="block min-w-0 text-sm font-semibold text-bp-graphite">
        {t("workspacePolicy.modeLabel")}
        <select
          className="mt-2 w-full min-w-0 max-w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-bp-graphite outline-none focus:border-bp-git focus:ring-2 focus:ring-bp-git/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          disabled={disabled}
          onChange={(event) =>
            onSelect(event.target.value as WorkspaceApprovalMode)
          }
          value={selectedMode}
        >
          {approvalModes.map((approvalMode) => (
            <option key={approvalMode} value={approvalMode}>
              {t(`workspacePolicy.modes.${approvalMode}`)}
            </option>
          ))}
        </select>
      </label>
      {currentMode ? (
        <dl>
          <StatusRow
            label={t("workspacePolicy.currentMode")}
            value={t(`workspacePolicy.modes.${currentMode}`)}
          />
        </dl>
      ) : null}
      {selectedMode === "SELF_APPROVAL_ALLOWED" ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
          {t("workspacePolicy.selfApprovalNotice")}
        </p>
      ) : null}
      {selectedMode === "AUTO_APPROVE" ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
          {t("workspacePolicy.autoApproveNotice")}
        </p>
      ) : null}
    </>
  );
}
