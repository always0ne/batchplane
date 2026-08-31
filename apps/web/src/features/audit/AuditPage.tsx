import type {
  AuditTimelineItem,
  BatchPlaneRuntimePorts,
} from "@batchplane/domain";
import { ExternalLink, Filter, History, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { formatRuntimeError } from "../../runtime/runtime-errors";
import {
  createBatchPlaneRuntime,
  readRuntimeSession,
} from "../../runtime/runtime-fixtures";
import { PageHeader } from "../../shared/components/PageHeader";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../shared/components/PageState";
import type { GitHubSession } from "../lite-setup/github-session";

type AuditPageProps = {
  createRuntime?: (session: GitHubSession) => BatchPlaneRuntimePorts;
  readSession?: () => GitHubSession | null;
};

type AuditPageState =
  | { type: "loading" }
  | { type: "no-session" }
  | { type: "error"; message: string }
  | { type: "loaded"; items: AuditTimelineItem[] };

export function AuditPage({
  createRuntime = createBatchPlaneRuntime,
  readSession = readRuntimeSession,
}: AuditPageProps = {}) {
  const { t } = useTranslation("audit");
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<AuditPageState>({ type: "loading" });

  useEffect(() => {
    let ignoreResult = false;

    async function loadAuditTimeline() {
      const session = readSession();

      if (!session) {
        setState({ type: "no-session" });
        return;
      }

      setState({ type: "loading" });

      try {
        const runtime = createRuntime(session);
        const items = await runtime.audit.listAuditTimeline({ limit: 100 });

        if (!ignoreResult) {
          setState({ type: "loaded", items });
        }
      } catch (error) {
        if (!ignoreResult) {
          setState({
            type: "error",
            message: formatRuntimeError(error, t("states.error")),
          });
        }
      }
    }

    void loadAuditTimeline();

    return () => {
      ignoreResult = true;
    };
  }, [createRuntime, readSession, reloadToken, t]);

  return (
    <section>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <div className="mb-4 flex justify-end">
        <button
          className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bp-graphite shadow-sm hover:border-bp-git"
          type="button"
          onClick={() => setReloadToken((value) => value + 1)}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {t("actions.refresh")}
        </button>
      </div>
      <AuditContent state={state} />
    </section>
  );
}

function AuditContent({ state }: { state: AuditPageState }) {
  const { t } = useTranslation("audit");

  if (state.type === "loading") {
    return <LoadingState message={t("states.loading")} />;
  }

  if (state.type === "no-session") {
    return <EmptyState message={t("states.noSession")} />;
  }

  if (state.type === "error") {
    return <ErrorState message={state.message} />;
  }

  return <LoadedAudit items={state.items} />;
}

function LoadedAudit({ items }: { items: AuditTimelineItem[] }) {
  const { t } = useTranslation(["audit", "common"]);
  const [batchFilter, setBatchFilter] = useState("");
  const [requestFilter, setRequestFilter] = useState("");
  const batchOptions = useMemo(
    () => uniqueMetadataValues(items, "batchId"),
    [items],
  );
  const requestOptions = useMemo(
    () => uniqueMetadataValues(items, "requestId"),
    [items],
  );
  const filteredItems = items.filter((item) => {
    const batchId = String(item.metadata?.batchId ?? "");
    const requestId = String(item.metadata?.requestId ?? "");

    return (
      (!batchFilter || batchId === batchFilter) &&
      (!requestFilter || requestId === requestFilter)
    );
  });

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-44 flex-1 items-center gap-2 text-sm font-semibold text-bp-muted">
            <Filter className="h-4 w-4 text-bp-git" aria-hidden="true" />
            {t("audit:filters.title")}
          </div>
          <label className="grid min-w-56 flex-1 gap-1 text-xs font-semibold uppercase text-bp-muted">
            {t("audit:filters.batch")}
            <select
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm normal-case text-bp-graphite"
              value={batchFilter}
              onChange={(event) => setBatchFilter(event.target.value)}
            >
              <option value="">{t("audit:filters.allBatches")}</option>
              {batchOptions.map((batchId) => (
                <option key={batchId} value={batchId}>
                  {batchId}
                </option>
              ))}
            </select>
          </label>
          <label className="grid min-w-64 flex-[2] gap-1 text-xs font-semibold uppercase text-bp-muted">
            {t("audit:filters.request")}
            <select
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm normal-case text-bp-graphite"
              value={requestFilter}
              onChange={(event) => setRequestFilter(event.target.value)}
            >
              <option value="">{t("audit:filters.allRequests")}</option>
              {requestOptions.map((requestId) => (
                <option key={requestId} value={requestId}>
                  {requestId}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {filteredItems.length === 0 ? (
        <EmptyState message={t("audit:states.empty")} />
      ) : (
        <ol className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white shadow-sm">
          {filteredItems.map((item) => (
            <li
              className="grid gap-3 p-4 md:grid-cols-[10rem_minmax(0,1fr)_auto]"
              key={item.itemId}
            >
              <div className="flex items-start gap-2">
                <span className="mt-0.5 rounded-md bg-slate-100 p-1.5 text-bp-git">
                  <History className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-bold text-bp-graphite">
                    {t(`common:status.auditTimelineType.${item.type}`)}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-bp-muted">
                    {formatAuditTime(
                      item.occurredAt,
                      t("audit:values.unknownTime"),
                    )}
                  </p>
                </div>
              </div>
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold text-bp-graphite">
                  {t(`audit:summaries.${item.type}`, {
                    ...toAuditSummaryValues(item, t),
                    defaultValue: item.summary,
                  })}
                </p>
                <p className="mt-1 break-words text-xs font-semibold text-bp-muted">
                  {t("audit:values.actor", {
                    actor: item.actor || t("audit:values.unknownActor"),
                  })}
                </p>
                <AuditMetadata item={item} />
              </div>
              {item.sourceUrl ? (
                <a
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-semibold text-bp-graphite hover:border-bp-git"
                  href={item.sourceUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  {t("audit:actions.openSource")}
                </a>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function AuditMetadata({ item }: { item: AuditTimelineItem }) {
  const { t } = useTranslation("audit");
  const entries = [
    ["batchId", item.metadata?.batchId],
    ["requestId", item.metadata?.requestId],
    ["runId", item.metadata?.runId],
    ["gateResult", item.metadata?.gateResult],
    ["status", item.metadata?.status],
    ["reasonCode", item.metadata?.reasonCode],
  ].filter((entry): entry is [string, string | number | boolean] =>
    Boolean(entry[1]),
  );

  if (entries.length === 0) {
    return null;
  }

  return (
    <dl className="mt-3 flex flex-wrap gap-2">
      {entries.map(([key, value]) => (
        <div
          className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1"
          key={`${item.itemId}-${key}`}
        >
          <dt className="text-[0.65rem] font-bold uppercase text-bp-muted">
            {t(`metadata.${key}`)}
          </dt>
          <dd className="max-w-72 break-all text-xs font-semibold text-bp-graphite">
            {formatAuditMetadataValue(key, value, t)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function uniqueMetadataValues(
  items: AuditTimelineItem[],
  key: string,
): string[] {
  return [
    ...new Set(
      items
        .map((item) => item.metadata?.[key])
        .filter((value): value is string | number => Boolean(value))
        .map(String),
    ),
  ].sort((left, right) => left.localeCompare(right));
}

function toAuditSummaryValues(
  item: AuditTimelineItem,
  translate: (key: string) => string,
): Record<string, string | number> {
  const gateResult = String(item.metadata?.gateResult ?? "");

  return {
    batchId: String(item.metadata?.batchId ?? item.subjectId),
    conclusion: String(item.metadata?.conclusion ?? ""),
    decision: String(item.metadata?.decision ?? ""),
    followUpId: String(item.metadata?.followUpId ?? ""),
    gateResult: gateResult ? translate(`values.gateResult.${gateResult}`) : "",
    pullNumber: Number(item.metadata?.pullNumber ?? 0),
    reasonCode: String(item.metadata?.reasonCode ?? ""),
    requestId: String(item.metadata?.requestId ?? item.subjectId),
    reviewId: String(item.metadata?.reviewId ?? ""),
    reviewStatus: String(item.metadata?.reviewStatus ?? ""),
    runId: Number(item.metadata?.runId ?? 0),
    selfReview: String(item.metadata?.selfReview ?? ""),
    status: String(item.metadata?.status ?? ""),
  };
}

function formatAuditMetadataValue(
  key: string,
  value: string | number | boolean,
  translate: (key: string) => string,
): string {
  if (key === "gateResult") {
    return translate(`values.gateResult.${String(value)}`);
  }

  return String(value);
}

function formatAuditTime(value: string, fallback: string): string {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? fallback : date.toLocaleString();
}
