import type { WorkspaceApprovalMode } from "@batchplane/ui-client";
import {
  AlertCircle,
  FilePlus2,
  Loader2,
  SlidersHorizontal,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui/Button";
import { StatusRow } from "../../ui/StatusRow";
import type { WorkspaceInspectionState } from "./useWorkspaceInspection";
import { useWorkspacePolicy } from "./useWorkspacePolicy";
import { formatWorkspaceError } from "./workspace-errors";

const approvalModes: WorkspaceApprovalMode[] = [
  "SELF_APPROVAL_BLOCKED",
  "SELF_APPROVAL_ALLOWED",
  "AUTO_APPROVE",
];

export function WorkspacePolicy({
  inspection,
  prepareRequest,
}: {
  inspection: WorkspaceInspectionState;
  prepareRequest: () => void;
}) {
  const { t } = useTranslation("settings");
  const policy = useWorkspacePolicy(inspection, prepareRequest);
  const { state, mode, currentPolicy } = policy;
  const currentMode = currentPolicy?.approval.mode;
  const unavailable =
    inspection.type !== "loaded"
      ? t("workspacePolicy.checkFirst")
      : state.type === "creating"
        ? t("workspacePolicy.creating")
        : state.type === "success"
          ? t("workspacePolicy.pendingRequest")
          : mode === currentMode
            ? t("workspacePolicy.chooseDifferentMode")
            : undefined;
  const error =
    state.type === "error"
      ? state.error
      : inspection.type === "error"
        ? inspection.error
        : undefined;

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
        <label className="block min-w-0 text-sm font-semibold text-bp-graphite">
          {t("workspacePolicy.modeLabel")}
          <select
            className="mt-2 w-full min-w-0 max-w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-bp-graphite outline-none focus:border-bp-git focus:ring-2 focus:ring-bp-git/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            disabled={
              inspection.type === "idle" || inspection.type === "checking"
            }
            onChange={(event) =>
              policy.setMode(event.target.value as WorkspaceApprovalMode)
            }
            value={mode}
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
        {state.type === "success" ? (
          <dl>
            <StatusRow
              label={t("workspacePolicy.requestedMode")}
              value={t(
                `workspacePolicy.modes.${state.result.requestedPolicy.approval.mode}`,
              )}
            />
          </dl>
        ) : null}
        {inspection.type === "idle" ? (
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-bp-muted">
            {t("workspacePolicy.idle")}
          </p>
        ) : null}
        {inspection.type === "checking" || state.type === "creating" ? (
          <p className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-bp-muted">
            <Loader2
              className="h-4 w-4 shrink-0 animate-spin"
              aria-hidden="true"
            />
            {t(
              state.type === "creating"
                ? "workspacePolicy.creating"
                : "workspacePolicy.checking",
            )}
          </p>
        ) : null}
        {mode === "SELF_APPROVAL_ALLOWED" ? (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
            {t("workspacePolicy.selfApprovalNotice")}
          </p>
        ) : null}
        {mode === "AUTO_APPROVE" ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
            {t("workspacePolicy.autoApproveNotice")}
          </p>
        ) : null}
        {state.type === "success" ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            <p className="font-semibold">{t("workspacePolicy.success")}</p>
            <a
              className="mt-2 inline-flex break-words font-semibold underline"
              href={state.result.request.sourceUrl}
              rel="noreferrer"
              target="_blank"
            >
              {state.result.request.label}
            </a>
          </div>
        ) : null}
        {error ? (
          <div
            role="alert"
            className="flex gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            <AlertCircle
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            />
            <p className="min-w-0 break-words font-semibold">
              {formatWorkspaceError(error, t)}
            </p>
          </div>
        ) : null}
        <span className="block" title={unavailable}>
          <Button
            variant="primary"
            className="w-full justify-center"
            disabled={Boolean(unavailable)}
            onClick={() => void policy.request()}
          >
            <FilePlus2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t("workspacePolicy.createRequest")}
          </Button>
        </span>
      </div>
    </article>
  );
}
