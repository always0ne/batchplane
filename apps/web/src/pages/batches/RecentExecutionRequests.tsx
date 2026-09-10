import type { BatchRecentExecutionRequestSummary } from "@batchplane/ui-client";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { BatchDetailFact } from "./BatchDetailFact";

export function RecentExecutionRequests({
  requests,
}: {
  requests: BatchRecentExecutionRequestSummary[];
}) {
  const { i18n, t } = useTranslation("batches");
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-bp-graphite">
        {t("detail.recentRuns.title")}
      </h2>
      {requests.length === 0 ? (
        <p className="mt-4 text-sm text-bp-muted">
          {t("detail.recentRuns.empty")}
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100">
          {requests.map((request) => (
            <li className="py-3 first:pt-0 last:pb-0" key={request.locator}>
              <Link
                className="break-words text-sm font-semibold text-bp-graphite hover:text-bp-control"
                to={`/execution-requests/${encodeURIComponent(request.locator)}`}
              >
                {request.title}
              </Link>
              <p className="mt-1 text-xs font-semibold text-bp-muted">
                {t(
                  `detail.recentRuns.status.${request.status.toLowerCase().replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())}`,
                )}
              </p>
              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                <BatchDetailFact
                  label={t("detail.recentRuns.fields.requestId")}
                  value={
                    request.requestId || t("detail.recentRuns.unknownValue")
                  }
                />
                <BatchDetailFact
                  label={t("detail.recentRuns.fields.requestedBy")}
                  value={request.requester}
                />
                <BatchDetailFact
                  label={t("detail.recentRuns.fields.requestedAt")}
                  value={formatTimestamp(request.requestedAt, i18n.language)}
                />
                <BatchDetailFact
                  label={t("detail.recentRuns.fields.requestDigest")}
                  value={
                    request.requestDigest || t("detail.recentRuns.unknownValue")
                  }
                />
              </dl>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function formatTimestamp(value: string, locale: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}
