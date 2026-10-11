import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import type { WorkspaceEncryptionUnavailableReason } from "@batchplane/ui-client";

export function SensitiveInputReadiness({
  reason,
}: {
  reason?: WorkspaceEncryptionUnavailableReason;
}) {
  const { t } = useTranslation("parameters");
  return (
    <p className="text-sm text-bp-muted">
      {t(reason ? `unavailableReasons.${reason}` : "notReady")}{" "}
      <Link className="font-semibold text-bp-control underline" to="/workspace">
        {t("workspace")}
      </Link>
    </p>
  );
}
