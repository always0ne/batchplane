import type { ExecutionRequestDraft } from "@batchplane/ui-client";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

export function ParameterWorkflowReadiness({
  draft,
}: {
  draft: ExecutionRequestDraft;
}) {
  const { t } = useTranslation("parameters");
  if (
    !draft.creationCapability.unavailableReasons.includes(
      "PARAMETER_WORKFLOW_UPDATE_REQUIRED",
    )
  )
    return null;
  return (
    <p className="mt-4 text-sm text-amber-900">
      {t("workflowUpdate")}{" "}
      <Link
        className="font-semibold text-bp-control underline"
        to={`/batches/new?change=${encodeURIComponent(draft.batch.batchId)}`}
      >
        {t("updateBatch")}
      </Link>
    </p>
  );
}
