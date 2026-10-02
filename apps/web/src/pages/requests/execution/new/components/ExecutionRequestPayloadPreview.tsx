import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { ExecutionRequestPreviewState } from "../hooks/useExecutionRequestPreview";

export function ExecutionRequestPayloadPreview({
  previewState,
}: {
  previewState: ExecutionRequestPreviewState;
}) {
  const { t } = useTranslation("executionRequests");
  const previewRequest =
    previewState.type === "ready" ? previewState.preview.request : null;
  return (
    <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-bp-graphite">
        {t("payload.title")}
      </h2>
      {previewState.type === "loading" ? (
        <p className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-bp-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {t("payload.loading")}
        </p>
      ) : null}
      {previewState.type === "error" ? (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
          {previewState.message || t("states.previewError")}
        </p>
      ) : null}
      {previewRequest?.evidence.canonicalPayload ? (
        <pre className="mt-4 max-h-96 max-w-full overflow-auto rounded-md bg-bp-graphite p-4 text-xs leading-6 text-white">
          <code>{previewRequest.evidence.canonicalPayload}</code>
        </pre>
      ) : null}
      {previewState.type === "idle" ? (
        <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold text-bp-muted">
          {t("payload.idle")}
        </p>
      ) : null}
    </article>
  );
}
