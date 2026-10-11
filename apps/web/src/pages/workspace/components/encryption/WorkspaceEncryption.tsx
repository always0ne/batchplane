import { KeyRound, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../../components/Button";
import { useWorkspaceEncryption } from "../../hooks/useWorkspaceEncryption";
import type { WorkspaceInspectionState } from "../../hooks/useWorkspaceInspection";
import { formatWorkspaceError } from "../../workspace-errors";
import { WorkspaceEncryptionStatus } from "./WorkspaceEncryptionStatus";

export function WorkspaceEncryption({
  inspection,
}: {
  inspection: WorkspaceInspectionState;
}) {
  const { t } = useTranslation("workspaceEncryption");
  const { state, initializing, initialize } =
    useWorkspaceEncryption(inspection);
  const status = state.type === "loaded" ? state.status : undefined;
  let unavailable: string | undefined;
  if (inspection.type !== "loaded") unavailable = t("checkFirst");
  else if (initializing || state.type === "loading") unavailable = t("loading");
  else if (!status || (!status.canInitialize && !status.canRetryUpload))
    unavailable = t("unavailable");

  return (
    <section
      className="min-w-0 border-b border-slate-200 py-5"
      aria-labelledby="workspace-encryption-heading"
    >
      <div className="flex items-start justify-between gap-4">
        <h2
          id="workspace-encryption-heading"
          className="text-lg font-semibold text-bp-graphite"
        >
          {t("title")}
        </h2>
        <KeyRound className="h-5 w-5 shrink-0 text-bp-git" aria-hidden="true" />
      </div>
      <div className="mt-4 space-y-3">
        {state.type === "idle" && (
          <p className="text-sm text-bp-muted">{t("checkFirst")}</p>
        )}
        {state.type === "loading" && (
          <p role="status" className="text-sm text-bp-muted">
            {t("loading")}
          </p>
        )}
        {state.type === "error" && (
          <p role="alert" className="break-words text-sm text-rose-700">
            {formatWorkspaceError(state.error, (key) => t(key))}
          </p>
        )}
        {state.type === "loaded" && (
          <WorkspaceEncryptionStatus
            status={state.status}
            uploadError={state.uploadError}
            failureStage={state.failureStage}
          />
        )}
        <span className="block" title={unavailable}>
          <Button
            variant="primary"
            className="w-full justify-center whitespace-normal"
            disabled={Boolean(unavailable)}
            onClick={() => void initialize()}
          >
            {status?.canRetryUpload ? (
              <RefreshCw className="h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <KeyRound className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            {initializing
              ? t("initializing")
              : status?.canRetryUpload
                ? t("retry")
                : t("initialize")}
          </Button>
        </span>
      </div>
    </section>
  );
}
