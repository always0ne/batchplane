import type {
  BatchPlaneRuntimePorts,
  ExecutionRun,
  RepositoryPullRequest,
} from "@batchplane/domain";
import {
  AlertTriangle,
  GitPullRequest,
  ListChecks,
  RefreshCw,
  UserCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import {
  isRegistrationApprovalRequest,
  parseExecutionRequestDetail,
  type ExecutionApprovalRequest,
} from "../approvals/approval-model";
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

type MyWorkPageProps = {
  createRuntime?: (session: GitHubSession) => BatchPlaneRuntimePorts;
  readSession?: () => GitHubSession | null;
};

type MyWorkPageState =
  | { type: "loading" }
  | { type: "no-session" }
  | { type: "error"; message: string }
  | { type: "loaded"; items: MyWorkItem[]; login: string };

type MyWorkItemKind =
  | "approval"
  | "registration"
  | "request"
  | "failureFollowUp";

type MyWorkItem = {
  itemId: string;
  kind: MyWorkItemKind;
  labelKey?: string;
  actionKey: string;
  title: string;
  descriptionKey: string;
  descriptionValues?: Record<string, string>;
  actor: string;
  occurredAt: string;
  priority: "high" | "normal";
  to: string;
};

export function MyWorkPage({
  createRuntime = createBatchPlaneRuntime,
  readSession = readRuntimeSession,
}: MyWorkPageProps = {}) {
  const { t } = useTranslation("myWork");
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<MyWorkPageState>({ type: "loading" });

  useEffect(() => {
    let ignoreResult = false;

    async function loadMyWork() {
      const session = readSession();

      if (!session) {
        setState({ type: "no-session" });
        return;
      }

      setState({ type: "loading" });

      try {
        const runtime = createRuntime(session);
        const [user, repository] = await Promise.all([
          runtime.settings.getCurrentUser(),
          runtime.settings.getRepository(),
        ]);
        const [pullRequests, issues, runs] = await Promise.all([
          runtime.approvals.listRegistrationRequests({
            baseBranch: repository.defaultBranch,
            state: "all",
          }),
          runtime.approvals.listExecutionRequestIssues({ state: "all" }),
          runtime.executions.listExecutionRuns({ limit: 100 }),
        ]);
        const issueComments = await Promise.all(
          issues.map((issue) =>
            runtime.approvals.listExecutionRequestComments({
              issueNumber: issue.number,
            }),
          ),
        );
        const executionRequests = issues
          .map((issue, index) =>
            parseExecutionRequestDetail(issue, issueComments[index] ?? []),
          )
          .filter(
            (request): request is ExecutionApprovalRequest => request !== null,
          );

        if (!ignoreResult) {
          setState({
            type: "loaded",
            items: createMyWorkItems({
              executionRequests,
              login: user.login,
              pullRequests,
              runs,
            }),
            login: user.login,
          });
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

    void loadMyWork();

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
      <MyWorkContent state={state} />
    </section>
  );
}

function MyWorkContent({ state }: { state: MyWorkPageState }) {
  const { t } = useTranslation("myWork");

  if (state.type === "loading") {
    return <LoadingState message={t("states.loading")} />;
  }

  if (state.type === "no-session") {
    return <EmptyState message={t("states.noSession")} />;
  }

  if (state.type === "error") {
    return <ErrorState message={state.message} />;
  }

  return <LoadedMyWork items={state.items} login={state.login} />;
}

function LoadedMyWork({
  items,
  login,
}: {
  items: MyWorkItem[];
  login: string;
}) {
  const { t } = useTranslation("myWork");
  const [kindFilter, setKindFilter] = useState<MyWorkItemKind | "all">("all");
  const counts = useMemo(() => countWorkItems(items), [items]);
  const filteredItems = items.filter(
    (item) => kindFilter === "all" || item.kind === kindFilter,
  );

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
        <div className="flex flex-wrap gap-2" role="group">
          <button
            className={[
              "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition",
              kindFilter === "all"
                ? "bg-bp-control text-white"
                : "text-bp-muted hover:bg-slate-100 hover:text-bp-graphite",
            ].join(" ")}
            type="button"
            onClick={() => setKindFilter("all")}
          >
            {t("filters.all")}
            <span
              className={[
                "rounded px-1.5 py-0.5 text-xs",
                kindFilter === "all"
                  ? "bg-white/20"
                  : "bg-slate-200 text-bp-graphite",
              ].join(" ")}
            >
              {items.length}
            </span>
          </button>
          {workKinds.map((kind) => (
            <button
              className={[
                "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition",
                kindFilter === kind
                  ? "bg-bp-control text-white"
                  : "text-bp-muted hover:bg-slate-100 hover:text-bp-graphite",
              ].join(" ")}
              key={kind}
              type="button"
              onClick={() => setKindFilter(kind)}
            >
              {t(`kinds.${kind}`)}
              <span
                className={[
                  "rounded px-1.5 py-0.5 text-xs",
                  kindFilter === kind
                    ? "bg-white/20"
                    : "bg-slate-200 text-bp-graphite",
                ].join(" ")}
              >
                {counts[kind]}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
          <div>
            <h2 className="text-lg font-semibold text-bp-graphite">
              {t("queue.title")}
            </h2>
            <p className="mt-1 text-sm text-bp-muted">
              {t("queue.subtitle", { login })}
            </p>
          </div>
          {kindFilter !== "all" ? (
            <button
              className="text-sm font-semibold text-bp-control underline"
              type="button"
              onClick={() => setKindFilter("all")}
            >
              {t("actions.showAll")}
            </button>
          ) : null}
        </div>

        {filteredItems.length === 0 ? (
          <div className="p-4">
            <EmptyState message={t("states.empty")} />
          </div>
        ) : (
          <ul className="divide-y divide-slate-200">
            {filteredItems.map((item) => (
              <li
                className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto]"
                key={item.itemId}
              >
                <div className="flex min-w-0 gap-3">
                  <WorkIcon kind={item.kind} priority={item.priority} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-bp-muted">
                        {t(`itemLabels.${item.labelKey ?? item.kind}`)}
                      </span>
                      {item.priority === "high" ? (
                        <span className="rounded-md bg-red-50 px-2 py-1 text-xs font-bold text-red-700">
                          {t("values.highPriority")}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 break-words text-sm font-bold text-bp-graphite">
                      {item.title}
                    </p>
                    <p className="mt-1 break-words text-sm text-bp-muted">
                      {t(`itemDescriptions.${item.descriptionKey}`, {
                        ...(item.descriptionValues ?? {}),
                      })}
                    </p>
                    <p className="mt-2 text-xs font-semibold text-bp-muted">
                      {t("values.actorTime", {
                        actor: item.actor || t("values.unknownActor"),
                        time: formatWorkTime(
                          item.occurredAt,
                          t("values.unknownTime"),
                        ),
                      })}
                    </p>
                  </div>
                </div>
                <Link
                  className="inline-flex h-10 items-center justify-center rounded-md bg-bp-control px-3 text-sm font-semibold text-white hover:bg-bp-graphite"
                  to={item.to}
                >
                  {t(`itemActions.${item.actionKey}`)}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function WorkIcon({
  kind,
  priority,
}: {
  kind: MyWorkItemKind;
  priority: MyWorkItem["priority"];
}) {
  const iconClassName = priority === "high" ? "text-red-700" : "text-bp-git";
  const Icon = {
    approval: UserCheck,
    failureFollowUp: AlertTriangle,
    registration: GitPullRequest,
    request: ListChecks,
  }[kind];

  return (
    <span className="mt-1 rounded-md bg-slate-100 p-2">
      <Icon className={`h-4 w-4 ${iconClassName}`} aria-hidden="true" />
    </span>
  );
}

const workKinds: MyWorkItemKind[] = [
  "approval",
  "registration",
  "request",
  "failureFollowUp",
];

function createMyWorkItems({
  executionRequests,
  login,
  pullRequests,
  runs,
}: {
  executionRequests: ExecutionApprovalRequest[];
  login: string;
  pullRequests: RepositoryPullRequest[];
  runs: ExecutionRun[];
}): MyWorkItem[] {
  const executionRequestByRequestId = new Map(
    executionRequests.map((request) => [request.requestId, request]),
  );

  return [
    ...pullRequests.flatMap((pullRequest) =>
      toRegistrationWorkItems(pullRequest, login),
    ),
    ...executionRequests.flatMap((request) =>
      toExecutionRequestWorkItems(request, login),
    ),
    ...runs.flatMap((run) =>
      toFailureFollowUpWorkItems(
        run,
        login,
        executionRequestByRequestId.get(run.requestId),
      ),
    ),
  ].sort(compareWorkItems);
}

function toRegistrationWorkItems(
  pullRequest: RepositoryPullRequest,
  login: string,
): MyWorkItem[] {
  if (!isRegistrationWorkPullRequest(pullRequest)) {
    return [];
  }

  const mine = pullRequest.author === login;
  const openReview = isRegistrationApprovalRequest(pullRequest) && !mine;

  return [
    ...(mine
      ? [
          {
            actionKey: "viewRegistration",
            actor: pullRequest.author,
            descriptionKey: "registrationMine",
            itemId: `registration-mine-${pullRequest.number}`,
            kind: "registration" as const,
            labelKey: "registration",
            occurredAt: pullRequest.updatedAt ?? pullRequest.createdAt ?? "",
            priority: "normal" as const,
            title: `#${pullRequest.number} ${pullRequest.title}`,
            to: `/approvals/registration/${pullRequest.number}`,
          },
        ]
      : []),
    ...(openReview
      ? [
          {
            actionKey: "reviewApproval",
            actor: pullRequest.author,
            descriptionKey: "registrationReview",
            itemId: `registration-review-${pullRequest.number}`,
            kind: "approval" as const,
            labelKey: "registrationApproval",
            occurredAt: pullRequest.updatedAt ?? pullRequest.createdAt ?? "",
            priority: "high" as const,
            title: `#${pullRequest.number} ${pullRequest.title}`,
            to: `/approvals/registration/${pullRequest.number}`,
          },
        ]
      : []),
  ];
}

function isRegistrationWorkPullRequest(
  pullRequest: RepositoryPullRequest,
): boolean {
  return (
    pullRequest.head.startsWith("batchplane/register/") ||
    pullRequest.head.startsWith("batchtrail/register/") ||
    pullRequest.title.startsWith("Register batch ")
  );
}

function toExecutionRequestWorkItems(
  request: ExecutionApprovalRequest,
  login: string,
): MyWorkItem[] {
  const mine = request.requestedBy === login;
  const needsApproval = request.status === "REQUESTED" && !mine;

  return [
    ...(mine
      ? [
          {
            actionKey: "viewRequest",
            actor: request.requestedBy,
            descriptionKey: "executionMine",
            itemId: `execution-request-mine-${request.requestId}`,
            kind: "request" as const,
            labelKey: "request",
            occurredAt: request.requestedAt || request.issue.updatedAt || "",
            priority:
              request.status === "DISPATCH_FAILED" ||
              request.status === "GATE_BLOCKED"
                ? ("high" as const)
                : ("normal" as const),
            title: `${request.batchId} - ${request.requestId}`,
            to: `/execution-requests/${request.issue.number}`,
          },
        ]
      : []),
    ...(needsApproval
      ? [
          {
            actionKey: "reviewApproval",
            actor: request.requestedBy,
            descriptionKey: "executionApproval",
            itemId: `execution-request-approval-${request.requestId}`,
            kind: "approval" as const,
            labelKey: "executionApproval",
            occurredAt: request.requestedAt || request.issue.updatedAt || "",
            priority: "high" as const,
            title: `${request.batchId} - ${request.requestId}`,
            to: `/execution-requests/${request.issue.number}`,
          },
        ]
      : []),
  ];
}

function toFailureFollowUpWorkItems(
  run: ExecutionRun,
  login: string,
  request?: ExecutionApprovalRequest,
): MyWorkItem[] {
  if (run.status !== "FAILED" && run.status !== "BLOCKED") {
    return [];
  }

  const openFollowUps = (run.failureFollowUps ?? []).filter((followUp) =>
    ["OPEN", "INVESTIGATING"].includes(followUp.status),
  );
  const assignedToMe = openFollowUps.some(
    (followUp) => followUp.owner === login || followUp.author === login,
  );
  const requestedByMe = request?.requestedBy === login;

  if (!assignedToMe && !requestedByMe) {
    return [];
  }

  const gateBlocked = run.status === "BLOCKED";

  return [
    {
      actionKey: gateBlocked ? "reviewGateEvidence" : "writeFollowUp",
      actor: run.actor ?? "",
      descriptionKey:
        gateBlocked && openFollowUps.length === 0
          ? "gateBlockedMine"
          : gateBlocked && assignedToMe
            ? "gateBlockedAssigned"
            : openFollowUps.length === 0
              ? "failureMissing"
              : assignedToMe
                ? "failureAssigned"
                : "failureOpen",
      itemId: `failure-follow-up-${run.runId}`,
      kind: "failureFollowUp",
      labelKey: gateBlocked ? "gateBlocked" : "businessFailure",
      occurredAt: run.completedAt ?? run.startedAt ?? "",
      priority: openFollowUps.length === 0 || assignedToMe ? "high" : "normal",
      title: `${run.batchId || run.workflowName || `Run ${run.runId}`} - Run ${run.runId}`,
      to: `/execution-runs/${run.runId}`,
    },
  ];
}

function countWorkItems(items: MyWorkItem[]): Record<MyWorkItemKind, number> {
  return {
    approval: items.filter((item) => item.kind === "approval").length,
    failureFollowUp: items.filter((item) => item.kind === "failureFollowUp")
      .length,
    registration: items.filter((item) => item.kind === "registration").length,
    request: items.filter((item) => item.kind === "request").length,
  };
}

function compareWorkItems(left: MyWorkItem, right: MyWorkItem): number {
  if (left.priority !== right.priority) {
    return left.priority === "high" ? -1 : 1;
  }

  return workTimestamp(right.occurredAt) - workTimestamp(left.occurredAt);
}

function workTimestamp(value: string): number {
  const timestamp = Date.parse(value);

  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function formatWorkTime(value: string, fallback: string): string {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? fallback : date.toLocaleString();
}
