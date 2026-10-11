import type {
  BatchListError,
  WorkspaceEncryptionStatus as EncryptionStatus,
  WorkspaceEncryptionSetupResult,
} from "@batchplane/ui-client";
import { useTranslation } from "react-i18next";
import { StatusRow } from "../../../../components/StatusRow";

export function WorkspaceEncryptionStatus({
  status,
  uploadError,
  failureStage,
}: {
  status: EncryptionStatus;
  uploadError?: BatchListError;
  failureStage?: WorkspaceEncryptionSetupResult["failureStage"];
}) {
  const { t } = useTranslation("workspaceEncryption");
  return (
    <div className="min-w-0 space-y-3 text-sm">
      <p role="status" className="font-semibold text-bp-graphite">
        {t(`states.${status.state}`)}
      </p>
      <dl>
        <StatusRow
          label={t("publicConfiguration")}
          value={t(
            status.configurationPublished
              ? "published"
              : status.state === "STATUS_UNAVAILABLE"
                ? "notVerified"
                : "notPublished",
          )}
        />
        <StatusRow
          label={t("privateKey")}
          value={
            status.privateKeyStored === "PRESENT"
              ? t("maskedSaved")
              : t(`privateKeyStates.${status.privateKeyStored}`)
          }
        />
      </dl>
      {status.privateKeyStored === "PRESENT" && (
        <p className="text-bp-muted">{t("setupEvidenceOnly")}</p>
      )}
      {status.state === "INCOMPLETE" && (
        <p className="text-amber-800">
          {t(status.canRetryUpload ? "retrySameKey" : "adminResolution")}
        </p>
      )}
      {status.state === "INVALID_CONFIGURATION" && (
        <p className="text-rose-700">{t("adminResolution")}</p>
      )}
      {status.state === "STATUS_UNAVAILABLE" && (
        <p className="text-bp-muted">{t("statusUnavailable")}</p>
      )}
      {uploadError && (
        <p role="alert" className="break-words text-rose-700">
          {t(
            failureStage === "STATUS_CHECK"
              ? "statusCheckFailed"
              : "uploadFailed",
          )}{" "}
          {uploadError.type !== "message" &&
            t(`settings:errors.${uploadError.type}`)}
        </p>
      )}
      {status.request && (
        <a
          href={status.request.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex max-w-full break-words font-semibold text-bp-git underline [overflow-wrap:anywhere]"
        >
          {status.request.label}
        </a>
      )}
    </div>
  );
}
