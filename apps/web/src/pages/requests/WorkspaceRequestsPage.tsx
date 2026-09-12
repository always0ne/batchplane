import type { RequestInventoryItem } from "@batchplane/ui-client";
import { ExternalLink, FileText, RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { PageHeader } from "../../ui/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "../../ui/PageState";
import {
  type WorkspaceRequestsState,
  useWorkspaceRequests,
} from "./useWorkspaceRequests";

type RequestKindFilter = "all" | "governed-change" | "execution";

const statusFilters = [
  "all",
  "OPEN",
  "APPROVED_PENDING_MERGE",
  "MERGED",
  "REJECTED",
  "CLOSED",
  "SCHEDULE_RECORDED",
  "REQUESTED",
  "APPROVED",
  "DISPATCHING",
  "DISPATCHED",
  "DISPATCH_FAILED",
  "GATE_BLOCKED",
] as const;

type RequestStatusFilter = (typeof statusFilters)[number];

export function WorkspaceRequestsPage() {
  const { t } = useTranslation("requests");
  const requests = useWorkspaceRequests();

  return (
    <section>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <div className="mb-4 flex justify-end">
        <button
          className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bp-graphite shadow-sm hover:border-bp-git disabled:cursor-not-allowed disabled:text-slate-400"
          disabled={requests.state.type === "loading"}
          onClick={requests.refresh}
          type="button"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {t("actions.refresh")}
        </button>
      </div>
      <WorkspaceRequestsContent state={requests.state} />
    </section>
  );
}

function WorkspaceRequestsContent({
  state,
}: {
  state: WorkspaceRequestsState;
}) {
  const { t } = useTranslation("requests");

  if (state.type === "loading") {
    return <LoadingState message={t("states.loading")} />;
  }

  if (state.type === "workspace-not-connected") {
    return <EmptyState message={t("states.noSession")} />;
  }

  if (state.type === "error") {
    return <ErrorState message={state.message || t("states.error")} />;
  }

  return <LoadedWorkspaceRequests items={state.inventory.requests} />;
}

function LoadedWorkspaceRequests({ items }: { items: RequestInventoryItem[] }) {
  const { t } = useTranslation("requests");
  const [kindFilter, setKindFilter] = useState<RequestKindFilter>("all");
  const [statusFilter, setStatusFilter] = useState<RequestStatusFilter>("all");
  const [query, setQuery] = useState("");
  const counts = useMemo(() => countRequests(items), [items]);
  const filteredItems = useMemo(
    () =>
      items.filter((item) =>
        matchesRequestFilters(item, { kindFilter, query, statusFilter }),
      ),
    [items, kindFilter, query, statusFilter],
  );

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_16rem_14rem]">
          <label className="text-xs font-bold uppercase text-bp-muted">
            {t("filters.search")}
            <span className="mt-1 flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2">
              <Search className="h-4 w-4 text-bp-muted" aria-hidden="true" />
              <input
                className="min-w-0 flex-1 bg-transparent text-sm text-bp-graphite outline-none"
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("filters.searchPlaceholder")}
                value={query}
              />
            </span>
          </label>
          <label className="text-xs font-bold uppercase text-bp-muted">
            {t("filters.type")}
            <select
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bp-graphite"
              onChange={(event) =>
                setKindFilter(event.target.value as RequestKindFilter)
              }
              value={kindFilter}
            >
              {(["all", "governed-change", "execution"] as const).map(
                (filter) => (
                  <option key={filter} value={filter}>
                    {t(`filters.kinds.${filter}`)}
                  </option>
                ),
              )}
            </select>
          </label>
          <label className="text-xs font-bold uppercase text-bp-muted">
            {t("filters.status")}
            <select
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bp-graphite"
              onChange={(event) =>
                setStatusFilter(event.target.value as RequestStatusFilter)
              }
              value={statusFilter}
            >
              {statusFilters.map((filter) => (
                <option key={filter} value={filter}>
                  {statusLabel(filter, t)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-bp-muted">
          <span className="rounded-md bg-slate-100 px-2 py-1">
            {t("counts.total", { count: items.length })}
          </span>
          <span className="rounded-md bg-slate-100 px-2 py-1">
            {t("counts.governedChange", { count: counts.governedChange })}
          </span>
          <span className="rounded-md bg-slate-100 px-2 py-1">
            {t("counts.execution", { count: counts.execution })}
          </span>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4">
          <h2 className="text-lg font-semibold text-bp-graphite">
            {t("list.title")}
          </h2>
          <p className="mt-1 text-sm text-bp-muted">
            {t("list.subtitle", { count: filteredItems.length })}
          </p>
        </div>
        {filteredItems.length === 0 ? (
          <div className="p-4">
            <EmptyState message={t("states.empty")} />
          </div>
        ) : (
          <ul className="divide-y divide-slate-200">
            {filteredItems.map((item) => (
              <WorkspaceRequestRow item={item} key={requestKey(item)} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function WorkspaceRequestRow({ item }: { item: RequestInventoryItem }) {
  const { t } = useTranslation("requests");
  const request = item.request;
  const sourceUrl = request.sourceUrl;

  return (
    <li className="grid gap-3 p-4 xl:grid-cols-[minmax(0,1fr)_11rem_10rem_9rem]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-bp-muted">
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            {requestTypeLabel(item, t)}
          </span>
          <span className={statusClassName(requestStatus(item))}>
            {statusLabel(requestStatus(item), t)}
          </span>
          <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-bp-graphite">
            {request.sourceLabel}
          </span>
        </div>
        <p className="mt-2 break-words text-sm font-bold text-bp-graphite">
          {item.title}
        </p>
        <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
          <RequestFact
            label={t("fields.target")}
            value={item.targetLabel || t("values.unknown")}
          />
          <RequestFact
            label={t("fields.actor")}
            value={item.actor || t("values.unknown")}
          />
        </dl>
      </div>
      <div>
        <p className="text-xs font-bold uppercase text-bp-muted">
          {t("fields.updated")}
        </p>
        <p className="mt-1 text-sm font-semibold text-bp-graphite">
          {formatRequestTime(item.updatedAt, t("values.unknownTime"))}
        </p>
      </div>
      <Link
        className="inline-flex h-10 items-center justify-center rounded-md bg-bp-control px-3 text-sm font-semibold text-white hover:bg-bp-graphite"
        to={detailRoute(item)}
      >
        {t("actions.openDetail")}
      </Link>
      {sourceUrl ? (
        <a
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-bp-graphite hover:border-bp-git"
          href={sourceUrl}
          rel="noreferrer"
          target="_blank"
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          {t("actions.openSource")}
        </a>
      ) : null}
    </li>
  );
}

function RequestFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-bold uppercase text-bp-muted">{label}</dt>
      <dd className="mt-1 break-words font-semibold text-bp-graphite">
        {value}
      </dd>
    </div>
  );
}

function matchesRequestFilters(
  item: RequestInventoryItem,
  {
    kindFilter,
    query,
    statusFilter,
  }: {
    kindFilter: RequestKindFilter;
    query: string;
    statusFilter: RequestStatusFilter;
  },
) {
  const normalizedQuery = query.trim().toLowerCase();
  const kind =
    item.kind === "GOVERNED_CHANGE" ? "governed-change" : "execution";
  const status = requestStatus(item);

  return (
    (kindFilter === "all" || kindFilter === kind) &&
    (statusFilter === "all" || statusFilter === status) &&
    (!normalizedQuery ||
      [item.title, item.targetLabel, item.actor, item.request.sourceLabel]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery))
  );
}

function countRequests(items: RequestInventoryItem[]) {
  return {
    execution: items.filter((item) => item.kind === "EXECUTION").length,
    governedChange: items.filter((item) => item.kind === "GOVERNED_CHANGE")
      .length,
  };
}

function detailRoute(item: RequestInventoryItem) {
  const requestLocator = encodeURIComponent(item.request.requestLocator);
  return item.kind === "GOVERNED_CHANGE"
    ? `/approvals/registration/${requestLocator}`
    : `/execution-requests/${requestLocator}`;
}

function requestKey(item: RequestInventoryItem) {
  return `${item.kind}-${item.request.requestLocator}`;
}

function requestStatus(item: RequestInventoryItem) {
  return item.kind === "GOVERNED_CHANGE"
    ? item.request.reviewState
    : item.request.triggerType === "SCHEDULE"
      ? "SCHEDULE_RECORDED"
      : item.request.status;
}

function requestTypeLabel(
  item: RequestInventoryItem,
  t: (key: string) => string,
) {
  if (item.kind === "EXECUTION") {
    return t(
      `types.${item.request.triggerType === "SCHEDULE" ? "scheduledExecution" : "manualExecution"}`,
    );
  }

  const typeKey = {
    BATCH_CHANGE: "batchChange",
    BATCH_DELETE: "batchDelete",
    BATCH_REGISTER: "batchRegister",
    SCHEDULE_CHANGE: "scheduleChange",
    SCHEDULE_REGISTER: "scheduleChange",
  }[item.changeKind];

  return t(`types.${typeKey}`);
}

function statusLabel(status: string, t: (key: string) => string) {
  if (status === "all") return t("filters.statuses.all");
  const requestLabel = t(`statuses.${status}`);
  return requestLabel === `statuses.${status}`
    ? t(`approvals:registrationDetail.review.states.${status}`)
    : requestLabel;
}

function statusClassName(status: string) {
  if (status === "SCHEDULE_RECORDED") {
    return "rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700";
  }
  if (
    status === "REJECTED" ||
    status === "DISPATCH_FAILED" ||
    status === "GATE_BLOCKED"
  ) {
    return "rounded-md bg-red-50 px-2 py-1 text-xs font-bold text-red-700";
  }
  if (status === "REQUESTED" || status === "OPEN") {
    return "rounded-md bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800";
  }
  return "rounded-md bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700";
}

function formatRequestTime(value: string, fallback: string) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return fallback;

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}
