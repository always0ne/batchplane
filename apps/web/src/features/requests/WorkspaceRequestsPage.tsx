import type {
  BatchPlaneRuntimePorts,
  RepositoryIssue,
  RepositoryIssueComment,
  RepositoryPullRequest,
} from "@batchplane/domain";
import { ExternalLink, FileText, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import {
  getGovernedChangeRequestKind,
  parseExecutionRequestDetail,
  type ExecutionApprovalRequest,
  type ExecutionRequestDisplayStatus,
} from "../approvals/approval-model";
import {
  deriveRegistrationReviewState,
  parseRegistrationApprovalDecision,
  parseRegistrationRequestSummary,
  type RegistrationRequestBodySummary,
  type RegistrationReviewState,
} from "../approvals/registration-approval-model";
import type { GitHubSession } from "../lite-setup/github-session";
import { PageHeader } from "../../ui/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "../../ui/PageState";
import { formatRuntimeError } from "../../runtime/runtime-errors";
import {
  createBatchPlaneRuntime,
  readRuntimeSession,
} from "../../runtime/runtime-fixtures";

type WorkspaceRequestsPageProps = {
  createRuntime?: (session: GitHubSession) => BatchPlaneRuntimePorts;
  readSession?: () => GitHubSession | null;
};

type WorkspaceRequestsState =
  | { type: "loading" }
  | { type: "no-session" }
  | { type: "error"; message: string }
  | { type: "loaded"; items: WorkspaceRequestItem[] };

type WorkspaceRequestKind = "governed-change" | "execution";
type WorkspaceRequestStatus =
  | RegistrationReviewState
  | ExecutionRequestDisplayStatus;

type WorkspaceRequestItem = {
  actor: string;
  detailTo: string;
  id: string;
  kind: WorkspaceRequestKind;
  sourceLabel: string;
  sourceUrl: string;
  status: WorkspaceRequestStatus;
  target: string;
  title: string;
  typeLabelKey: string;
  updatedAt: string;
};

const requestKindFilters = ["all", "governed-change", "execution"] as const;

type RequestKindFilter = (typeof requestKindFilters)[number];

const requestStatusFilters = [
  "all",
  "OPEN",
  "APPROVED_PENDING_MERGE",
  "MERGED",
  "REJECTED",
  "CLOSED",
  "REQUESTED",
  "APPROVED",
  "DISPATCHING",
  "DISPATCHED",
  "DISPATCH_FAILED",
  "GATE_BLOCKED",
] as const;

type RequestStatusFilter = (typeof requestStatusFilters)[number];

export function WorkspaceRequestsPage({
  createRuntime = createBatchPlaneRuntime,
  readSession = readRuntimeSession,
}: WorkspaceRequestsPageProps = {}) {
  const { t } = useTranslation("requests");
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<WorkspaceRequestsState>({
    type: "loading",
  });

  useEffect(() => {
    let ignoreResult = false;

    async function loadRequests() {
      const session = readSession();

      if (!session) {
        setState({ type: "no-session" });
        return;
      }

      setState({ type: "loading" });

      try {
        const runtime = createRuntime(session);
        const repository = await runtime.settings.getRepository();
        const [pullRequests, issues] = await Promise.all([
          runtime.approvals.listRegistrationRequests({
            baseBranch: repository.defaultBranch,
            state: "all",
          }),
          runtime.approvals.listExecutionRequestIssues({ state: "all" }),
        ]);
        const [pullRequestComments, issueComments] = await Promise.all([
          Promise.all(
            pullRequests.map((pullRequest) =>
              runtime.approvals.listExecutionRequestComments({
                issueNumber: pullRequest.number,
              }),
            ),
          ),
          Promise.all(
            issues.map((issue) =>
              runtime.approvals.listExecutionRequestComments({
                issueNumber: issue.number,
              }),
            ),
          ),
        ]);

        if (!ignoreResult) {
          setState({
            items: createWorkspaceRequestItems({
              issueComments,
              issues,
              pullRequestComments,
              pullRequests,
            }),
            type: "loaded",
          });
        }
      } catch (error) {
        if (!ignoreResult) {
          setState({
            message: formatRuntimeError(error, t("states.error")),
            type: "error",
          });
        }
      }
    }

    void loadRequests();

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
      <WorkspaceRequestsContent state={state} />
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

  if (state.type === "no-session") {
    return <EmptyState message={t("states.noSession")} />;
  }

  if (state.type === "error") {
    return <ErrorState message={state.message} />;
  }

  return <LoadedWorkspaceRequests items={state.items} />;
}

function LoadedWorkspaceRequests({ items }: { items: WorkspaceRequestItem[] }) {
  const { t } = useTranslation("requests");
  const [kindFilter, setKindFilter] = useState<RequestKindFilter>("all");
  const [statusFilter, setStatusFilter] = useState<RequestStatusFilter>("all");
  const [query, setQuery] = useState("");
  const counts = useMemo(() => countRequests(items), [items]);
  const filteredItems = useMemo(
    () =>
      items.filter((item) =>
        matchesRequestFilters(item, {
          kindFilter,
          query,
          statusFilter,
        }),
      ),
    [items, kindFilter, query, statusFilter],
  );

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_16rem_14rem]">
          <div>
            <label className="text-xs font-bold uppercase text-bp-muted">
              {t("filters.search")}
              <span className="mt-1 flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2">
                <Search className="h-4 w-4 text-bp-muted" aria-hidden />
                <input
                  className="min-w-0 flex-1 bg-transparent text-sm text-bp-graphite outline-none"
                  placeholder={t("filters.searchPlaceholder")}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </span>
            </label>
          </div>
          <label className="text-xs font-bold uppercase text-bp-muted">
            {t("filters.type")}
            <select
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bp-graphite"
              value={kindFilter}
              onChange={(event) =>
                setKindFilter(event.target.value as RequestKindFilter)
              }
            >
              {requestKindFilters.map((filter) => (
                <option key={filter} value={filter}>
                  {t(`filters.kinds.${filter}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold uppercase text-bp-muted">
            {t("filters.status")}
            <select
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bp-graphite"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as RequestStatusFilter)
              }
            >
              {requestStatusFilters.map((filter) => (
                <option key={filter} value={filter}>
                  {filter === "all"
                    ? t("filters.statuses.all")
                    : t(`statuses.${filter}`)}
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
            {t("counts.governedChange", { count: counts["governed-change"] })}
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
              <WorkspaceRequestRow item={item} key={item.id} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function WorkspaceRequestRow({ item }: { item: WorkspaceRequestItem }) {
  const { t } = useTranslation("requests");

  return (
    <li className="grid gap-3 p-4 xl:grid-cols-[minmax(0,1fr)_11rem_10rem_9rem]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-bp-muted">
            <FileText className="h-3.5 w-3.5" aria-hidden />
            {t(`types.${item.typeLabelKey}`)}
          </span>
          <span className={statusClassName(item.status)}>
            {t(`statuses.${item.status}`)}
          </span>
          <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-bp-graphite">
            {item.sourceLabel}
          </span>
        </div>
        <p className="mt-2 break-words text-sm font-bold text-bp-graphite">
          {item.title}
        </p>
        <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
          <div>
            <dt className="font-bold uppercase text-bp-muted">
              {t("fields.target")}
            </dt>
            <dd className="mt-1 break-words font-semibold text-bp-graphite">
              {item.target || t("values.unknown")}
            </dd>
          </div>
          <div>
            <dt className="font-bold uppercase text-bp-muted">
              {t("fields.actor")}
            </dt>
            <dd className="mt-1 break-words font-semibold text-bp-graphite">
              {item.actor || t("values.unknown")}
            </dd>
          </div>
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
        to={item.detailTo}
      >
        {t("actions.openDetail")}
      </Link>
      <a
        className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-bp-graphite hover:border-bp-git"
        href={item.sourceUrl}
        rel="noreferrer"
        target="_blank"
      >
        <ExternalLink className="h-4 w-4" aria-hidden />
        {t("actions.openSource")}
      </a>
    </li>
  );
}

function createWorkspaceRequestItems({
  issueComments,
  issues,
  pullRequestComments,
  pullRequests,
}: {
  issueComments: RepositoryIssueComment[][];
  issues: RepositoryIssue[];
  pullRequestComments: RepositoryIssueComment[][];
  pullRequests: RepositoryPullRequest[];
}): WorkspaceRequestItem[] {
  return [
    ...pullRequests.flatMap((pullRequest, index) =>
      toGovernedChangeRequestItem(
        pullRequest,
        pullRequestComments[index] ?? [],
      ),
    ),
    ...issues.flatMap((issue, index) =>
      toExecutionRequestItem(issue, issueComments[index] ?? []),
    ),
  ].sort(compareRequestItems);
}

function toGovernedChangeRequestItem(
  pullRequest: RepositoryPullRequest,
  comments: RepositoryIssueComment[],
): WorkspaceRequestItem[] {
  const kind = getGovernedChangeRequestKind(pullRequest);

  if (!kind) {
    return [];
  }

  const summary = safeParseRegistrationSummary(pullRequest);

  if (!summary) {
    return [];
  }

  const decision = parseRegistrationApprovalDecision(comments);
  const status = deriveRegistrationReviewState(pullRequest, decision);

  return [
    {
      actor: pullRequest.author,
      detailTo: `/approvals/registration/${pullRequest.number}`,
      id: `governed-change-${pullRequest.number}`,
      kind: "governed-change",
      sourceLabel: `PR #${pullRequest.number}`,
      sourceUrl: pullRequest.url,
      status,
      target: formatRegistrationTarget(summary),
      title: pullRequest.title,
      typeLabelKey:
        summary.kind === "schedule"
          ? "scheduleChange"
          : `batch${capitalizeLower(summary.requestType)}`,
      updatedAt: pullRequest.updatedAt ?? pullRequest.createdAt ?? "",
    },
  ];
}

function toExecutionRequestItem(
  issue: RepositoryIssue,
  comments: RepositoryIssueComment[],
): WorkspaceRequestItem[] {
  const request = parseExecutionRequestDetail(issue, comments);

  if (!request) {
    return [];
  }

  return [
    {
      actor: request.requestedBy || issue.author,
      detailTo: `/execution-requests/${issue.number}`,
      id: `execution-${issue.number}`,
      kind: "execution",
      sourceLabel: `Issue #${issue.number}`,
      sourceUrl: issue.url,
      status: request.status,
      target: formatExecutionTarget(request),
      title: issue.title,
      typeLabelKey:
        request.triggerType === "SCHEDULE"
          ? "scheduledExecution"
          : "manualExecution",
      updatedAt: issue.updatedAt ?? request.requestedAt ?? issue.createdAt,
    },
  ];
}

function safeParseRegistrationSummary(
  pullRequest: RepositoryPullRequest,
): RegistrationRequestBodySummary | null {
  try {
    return parseRegistrationRequestSummary(pullRequest);
  } catch {
    return null;
  }
}

function formatRegistrationTarget(summary: RegistrationRequestBodySummary) {
  return summary.kind === "schedule"
    ? [summary.batchId, summary.scheduleId].filter(Boolean).join(" / ")
    : summary.batchId;
}

function formatExecutionTarget(request: ExecutionApprovalRequest) {
  return request.schedule
    ? [request.batchId, request.schedule.scheduleId].filter(Boolean).join(" / ")
    : request.batchId;
}

function matchesRequestFilters(
  item: WorkspaceRequestItem,
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

  return (
    (kindFilter === "all" || item.kind === kindFilter) &&
    (statusFilter === "all" || item.status === statusFilter) &&
    (!normalizedQuery ||
      [item.title, item.target, item.actor, item.sourceLabel]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery))
  );
}

function countRequests(
  items: WorkspaceRequestItem[],
): Record<WorkspaceRequestKind, number> {
  return {
    execution: items.filter((item) => item.kind === "execution").length,
    "governed-change": items.filter((item) => item.kind === "governed-change")
      .length,
  };
}

function compareRequestItems(
  left: WorkspaceRequestItem,
  right: WorkspaceRequestItem,
): number {
  return requestTimestamp(right.updatedAt) - requestTimestamp(left.updatedAt);
}

function requestTimestamp(value: string): number {
  const timestamp = Date.parse(value);

  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function formatRequestTime(value: string, fallback: string) {
  const timestamp = Date.parse(value);

  if (Number.isNaN(timestamp)) {
    return fallback;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function capitalizeLower(value: string) {
  const lower = value.toLowerCase();

  return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
}

function statusClassName(status: WorkspaceRequestStatus) {
  const warningStatuses: WorkspaceRequestStatus[] = [
    "OPEN",
    "REQUESTED",
    "APPROVED_PENDING_MERGE",
    "APPROVED",
    "DISPATCHING",
  ];
  const successStatuses: WorkspaceRequestStatus[] = ["MERGED", "DISPATCHED"];

  if (successStatuses.includes(status)) {
    return "rounded-md bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-800";
  }

  if (warningStatuses.includes(status)) {
    return "rounded-md bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800";
  }

  return "rounded-md bg-red-50 px-2 py-1 text-xs font-bold text-red-700";
}
