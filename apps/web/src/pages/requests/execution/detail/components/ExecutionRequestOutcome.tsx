import type { ExecutionRequest } from "@batchplane/ui-client";
import { FilePlus2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ButtonLink } from "../../../../../components/ButtonLink";
import { executionRequestStatusHelpKey } from "../execution-request-detail-view";

export function ExecutionRequestOutcome({
  request,
}: {
  request: ExecutionRequest;
}) {
  const { t } = useTranslation("executionRequests");
  const requiresNewRequest =
    request.status === "EXPIRED" || request.status === "DISPATCH_FAILED";
  const titleKey = requiresNewRequest
    ? "detail.actions.terminatedTitle"
    : "detail.actions.closedTitle";

  return (
    <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-bp-graphite">{t(titleKey)}</h2>
      <p className="mt-2 text-sm font-semibold text-bp-muted">
        {t(executionRequestStatusHelpKey(request))}
      </p>
      {requiresNewRequest && (
        <ButtonLink
          className="mt-4"
          to={`/batches/${encodeURIComponent(request.batchId)}/execution-requests/new`}
          variant="primary"
        >
          <FilePlus2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t("detail.actions.createNewRequest")}
        </ButtonLink>
      )}
    </article>
  );
}
