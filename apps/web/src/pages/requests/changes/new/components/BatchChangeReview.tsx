import type { BatchChangeDraft } from "@batchplane/ui-client";
import { useTranslation } from "react-i18next";
import { ChangeRequestPreviewPanel } from "../../components/ChangeRequestPreviewPanel";
import type { BatchChangePreviewState } from "../hooks/useBatchChangePreview";
import { BatchChangeSubmissionReview } from "./BatchChangeSubmissionReview";

export function BatchChangeReview({
  artifactBlockedReason,
  missingFields,
  mode,
  previewState,
  showSubmissionProgress,
}: {
  artifactBlockedReason?: string;
  missingFields: string[];
  mode: BatchChangeDraft["mode"];
  previewState: BatchChangePreviewState;
  showSubmissionProgress: boolean;
}) {
  const { t } = useTranslation("registration");

  return (
    <aside className="min-w-0 space-y-4">
      <BatchChangeSubmissionReview
        artifactBlockedReason={artifactBlockedReason}
        missingFields={missingFields}
        mode={mode}
        previewState={previewState}
        showSubmissionProgress={showSubmissionProgress}
      />
      {previewState.type === "ready" ? (
        <ChangeRequestPreviewPanel
          files={previewState.preview.files}
          labels={{
            binarySummary: t("diff.binaryDigest"),
            emptyFile: t("diff.empty"),
            evidenceUnavailable: t("diff.evidenceUnavailable"),
            preview: t("diff.preview"),
            status: {
              ADDED: t("diff.status.ADDED"),
              DELETED: t("diff.status.DELETED"),
              MODIFIED: t("diff.status.MODIFIED"),
              UNCHANGED: t("diff.status.UNCHANGED"),
            },
            subtitle: t("diff.subtitle"),
            title: t("diff.title"),
          }}
        />
      ) : null}
    </aside>
  );
}
