import type { ChangeRequestDetail } from "@batchplane/ui-client";
import { useTranslation } from "react-i18next";
import { ChangeRequestPreviewPanel } from "../../components/ChangeRequestPreviewPanel";

export function ChangeEvidence({ detail }: { detail: ChangeRequestDetail }) {
  const { t } = useTranslation("approvals");

  return (
    <ChangeRequestPreviewPanel
      files={detail.files}
      labels={{
        binarySummary: t("registrationDetail.preview.binaryDigest"),
        emptyFile: t("registrationDetail.preview.emptyFile"),
        evidenceUnavailable: t(
          "registrationDetail.preview.evidenceUnavailable",
        ),
        preview: t("registrationDetail.preview.showDiff"),
        status: {
          ADDED: t("registrationDetail.preview.status.ADDED"),
          DELETED: t("registrationDetail.preview.status.DELETED"),
          MODIFIED: t("registrationDetail.preview.status.MODIFIED"),
          UNCHANGED: t("registrationDetail.preview.status.UNCHANGED"),
        },
        subtitle: t("registrationDetail.preview.subtitle"),
        title: t("registrationDetail.preview.title"),
      }}
    />
  );
}
