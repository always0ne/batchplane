import { useTranslation } from "react-i18next";

import type { ExecutionRequestSubmissionState } from "../hooks/useExecutionRequestSubmission";

export function SubmissionMessage({
  state,
}: {
  state: ExecutionRequestSubmissionState;
}) {
  const { t } = useTranslation("executionRequests");

  if (state.type !== "error") return null;

  return (
    <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
      {state.message || t("states.submitError")}
    </p>
  );
}
