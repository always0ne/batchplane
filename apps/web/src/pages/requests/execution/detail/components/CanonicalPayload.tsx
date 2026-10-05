import type { ExecutionRequest } from "@batchplane/ui-client";
import { useTranslation } from "react-i18next";

export function CanonicalPayload({ request }: { request: ExecutionRequest }) {
  const { t } = useTranslation("executionRequests");
  return (
    <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-bp-graphite">
        {t("detail.payload.title")}
      </h2>
      <pre className="mt-4 max-h-96 max-w-full overflow-auto rounded-md bg-bp-graphite p-4 text-xs leading-6 text-white">
        <code>{request.evidence.canonicalPayload || "-"}</code>
      </pre>
    </article>
  );
}
