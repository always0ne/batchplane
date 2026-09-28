import type { ExecutionRequest } from "@batchplane/ui-client";
import { useTranslation } from "react-i18next";

import { CheckRow } from "./CheckRow";

export function ControlChecks({ request }: { request: ExecutionRequest }) {
  const { t } = useTranslation("executionRequests");
  const gateRequired = request.batch.gateRequired === true;
  return (
    <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-bp-graphite">
        {t("detail.control.title")}
      </h2>
      <ul className="mt-4 space-y-2 text-sm">
        <CheckRow
          ok={gateRequired}
          text={
            gateRequired
              ? t("detail.control.gateRequired")
              : t("detail.control.gateMissing")
          }
        />
        <CheckRow
          ok={Boolean(request.evidence.requestDigest)}
          text={t("detail.control.digest")}
        />
        <CheckRow
          ok={request.requestedBy !== ""}
          text={t("detail.control.requester")}
        />
      </ul>
    </article>
  );
}
