import type {
  BatchDefinition,
  BatchSchedule,
  BatchPlaneRuntimePorts,
  DeletedBatchArchiveResult,
  DeletedBatchArchiveSourceRequest,
  RepositoryIssue,
  RepositoryIssueComment,
} from "@batchplane/domain";
import {
  GitPullRequest,
  Loader2,
  Play,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { parseExecutionRequestDetail } from "../approvals/approval-model";
import type { GitHubSession } from "../lite-setup/github-session";
import { PageHeader } from "../../ui/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "../../ui/PageState";
import { formatGeneratedScheduleCrons } from "../registration/registration-model";
import {
  getChangeRequestBlockerDetailPath,
  loadBatchChangeRequestBlockers,
  type ChangeRequestBlocker,
} from "../registration/change-request-guard";
import {
  createBatchPlaneRuntime,
  readRuntimeSession,
} from "../../runtime/runtime-fixtures";
import { formatRuntimeError } from "../../runtime/runtime-errors";

type BatchDetailState =
  | { type: "loading" }
  | { type: "no-session" }
  | { type: "not-found"; batchId: string }
  | {
      type: "loaded";
      batch: BatchDefinition;
      changeRequestBlockers: ChangeRequestBlocker[];
      defaultBranch: string;
      recentIssues: RecentExecutionIssue[];
      schedules: BatchSchedule[];
    }
  | {
      type: "deleted";
      archive: DeletedBatchArchiveResult;
      defaultBranch: string;
      recentIssues: RecentExecutionIssue[];
    }
  | { type: "error"; message: string };

type RecentExecutionIssue = {
  comments: RepositoryIssueComment[];
  issue: RepositoryIssue;
};

type BatchDetailPageProps = {
  createRuntime?: (session: GitHubSession) => BatchPlaneRuntimePorts;
  readSession?: () => GitHubSession | null;
};

export function BatchDetailPage({
  createRuntime = createBatchPlaneRuntime,
  readSession = readRuntimeSession,
}: BatchDetailPageProps = {}) {
  const { batchId = "" } = useParams();
  const { t } = useTranslation("batches");
  const [state, setState] = useState<BatchDetailState>({ type: "loading" });
  const decodedBatchId = decodeURIComponent(batchId);

  useEffect(() => {
    let ignoreResult = false;

    async function loadBatch() {
      const session = readSession();

      if (!session) {
        setState({ type: "no-session" });
        return;
      }

      setState({ type: "loading" });

      try {
        const runtime = createRuntime(session);
        const repository = await runtime.settings.getRepository();
        const [batches, issues, changeRequestBlockers] = await Promise.all([
          runtime.batches.listBatchDefinitions({
            ref: repository.defaultBranch,
          }),
          runtime.approvals.listExecutionRequestIssues({ state: "all" }),
          loadBatchChangeRequestBlockers({
            baseBranch: repository.defaultBranch,
            batchId: decodedBatchId,
            runtime,
          }),
        ]);
        const batch = batches.find(
          (candidate) => candidate.batchId === decodedBatchId,
        );
        const recentIssues = issues
          .filter((issue) => issueContainsBatch(issue, decodedBatchId))
          .sort((left, right) => right.number - left.number)
          .slice(0, 5);
        const recentIssuesWithComments = await Promise.all(
          recentIssues.map(async (issue) => ({
            comments: await runtime.approvals.listExecutionRequestComments({
              issueNumber: issue.number,
            }),
            issue,
          })),
        );

        if (!batch) {
          const archive = await loadDeletedBatchArchive({
            batchId: decodedBatchId,
            ref: repository.defaultBranch,
            runtime,
          });

          if (ignoreResult) {
            return;
          }

          if (archive) {
            setState({
              type: "deleted",
              archive,
              defaultBranch: repository.defaultBranch,
              recentIssues: recentIssuesWithComments,
            });
            return;
          }

          setState({ type: "not-found", batchId: decodedBatchId });
          return;
        }

        if (ignoreResult) {
          return;
        }

        setState({
          type: "loaded",
          batch,
          changeRequestBlockers,
          defaultBranch: repository.defaultBranch,
          recentIssues: recentIssuesWithComments,
          schedules: batch.schedules ?? [],
        });
      } catch (error) {
        if (!ignoreResult) {
          setState({
            type: "error",
            message: formatRuntimeError(error, t("states.detailError")),
          });
        }
      }
    }

    void loadBatch();

    return () => {
      ignoreResult = true;
    };
  }, [createRuntime, decodedBatchId, readSession, t]);

  return (
    <section>
      <PageHeader title={t("detail.title")} subtitle={decodedBatchId} />
      <BatchDetailContent state={state} />
    </section>
  );
}

function BatchDetailContent({ state }: { state: BatchDetailState }) {
  const { t } = useTranslation("batches");

  if (state.type === "loading") {
    return <LoadingState message={t("states.detailLoading")} />;
  }

  if (state.type === "no-session") {
    return (
      <EmptyState
        action={
          <Link
            className="font-semibold text-bp-control underline"
            to="/lite/setup"
          >
            {t("actions.openSetup")}
          </Link>
        }
        message={t("states.noSession")}
      />
    );
  }

  if (state.type === "not-found") {
    return (
      <EmptyState
        action={
          <Link
            className="font-semibold text-bp-control underline"
            to="/batches"
          >
            {t("actions.backToBatches")}
          </Link>
        }
        message={t("states.detailNotFound", { batchId: state.batchId })}
      />
    );
  }

  if (state.type === "error") {
    return <ErrorState message={state.message} />;
  }

  if (state.type === "deleted") {
    return (
      <div className="space-y-4">
        <DeletedBatchArchiveCard
          archive={state.archive}
          defaultBranch={state.defaultBranch}
        />
        <RecentExecutionEvidence issues={state.recentIssues} />
      </div>
    );
  }

  const canRequestExecution =
    state.batch.status === "ACTIVE" &&
    state.batch.gateRequired &&
    Boolean(state.batch.execution?.command.trim());

  return (
    <div className="space-y-4">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <BatchProfileCard
          batch={state.batch}
          defaultBranch={state.defaultBranch}
          schedules={state.schedules}
        />
        <RequestActionsCard
          batch={state.batch}
          canRequestExecution={canRequestExecution}
          changeRequestBlockers={state.changeRequestBlockers}
        />
      </section>
      <RecentExecutionEvidence issues={state.recentIssues} />
    </div>
  );
}

function BatchProfileCard({
  batch,
  defaultBranch,
  schedules,
}: {
  batch: BatchDefinition;
  defaultBranch: string;
  schedules: BatchSchedule[];
}) {
  const { t } = useTranslation("batches");

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-bp-graphite">{batch.name}</h2>
          <p className="mt-1 font-mono text-sm text-bp-muted">
            {batch.batchId}
          </p>
        </div>
        <span className="rounded-md bg-slate-100 px-3 py-1 text-xs font-bold text-bp-graphite">
          {batch.status}
        </span>
      </div>

      <dl className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <DetailFact label={t("detail.fields.owner")} value={batch.owner} />
        <DetailFact label={t("detail.fields.domain")} value={batch.domain} />
        <DetailFact
          label={t("detail.fields.environment")}
          value={batch.environment}
        />
        <DetailFact
          label={t("detail.fields.criticality")}
          value={batch.criticality}
        />
        <DetailFact
          label={t("detail.fields.defaultBranch")}
          value={defaultBranch}
        />
        <DetailFact
          label={t("detail.fields.labels")}
          value={batch.labels?.join(", ") || t("values.none")}
        />
      </dl>

      <div className="mt-5 grid gap-5 border-t border-slate-100 pt-5 lg:grid-cols-2">
        <section>
          <h3 className="text-sm font-bold text-bp-graphite">
            {t("detail.workflow.title")}
          </h3>
          <dl className="mt-3 space-y-3 text-sm">
            <DetailFact
              label={t("detail.workflow.runtime")}
              value={t("detail.workflow.runtimeGithubActions")}
            />
            <DetailFact
              label={t("detail.workflow.path")}
              value={batch.workflow.path}
            />
            <DetailFact
              label={t("detail.workflow.ref")}
              value={batch.workflow.ref}
            />
          </dl>
        </section>

        <section>
          <h3 className="text-sm font-bold text-bp-graphite">
            {t("detail.executionSpec.title")}
          </h3>
          {batch.execution ? (
            <dl className="mt-3 space-y-3 text-sm">
              <DetailFact
                label={t("detail.executionSpec.runsOn")}
                value={formatRunnerLabel(batch.execution.runsOn)}
              />
              <DetailFact
                label={t("detail.executionSpec.artifactPath")}
                value={
                  batch.execution.artifactPath ||
                  t("detail.executionSpec.noArtifact")
                }
              />
              <div>
                <dt className="text-xs font-semibold uppercase text-bp-muted">
                  {t("detail.executionSpec.command")}
                </dt>
                <dd className="mt-1">
                  <pre className="max-h-36 overflow-auto whitespace-pre-wrap rounded-md bg-bp-graphite p-3 text-xs leading-5 text-white">
                    {batch.execution.command ||
                      t("detail.executionSpec.missing")}
                  </pre>
                </dd>
              </div>
            </dl>
          ) : (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
              {t("detail.executionSpec.missing")}
            </p>
          )}
        </section>
      </div>

      <section className="mt-5 border-t border-slate-100 pt-5">
        <div>
          <div>
            <h3 className="text-sm font-bold text-bp-graphite">
              {t("detail.schedules.title")}
            </h3>
            <p className="mt-1 text-sm text-bp-muted">
              {t("detail.schedules.subtitle")}
            </p>
            <p className="mt-2 text-sm font-medium text-bp-muted">
              {t("detail.schedules.managementHint")}
            </p>
          </div>
        </div>

        {schedules.length === 0 ? (
          <p className="mt-4 text-sm text-bp-muted">
            {t("detail.schedules.empty")}
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {schedules.map((schedule) => (
              <li
                className="rounded-md border border-slate-200 bg-slate-50 p-4"
                key={schedule.scheduleId}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold text-bp-graphite">
                        {schedule.name}
                      </p>
                      <span
                        className={[
                          "rounded-md px-2 py-1 text-xs font-semibold",
                          schedule.enabled
                            ? "bg-emerald-50 text-emerald-800"
                            : "bg-slate-200 text-slate-700",
                        ].join(" ")}
                      >
                        {schedule.enabled
                          ? t("detail.schedules.enabled")
                          : t("detail.schedules.disabled")}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-xs text-bp-muted">
                      {schedule.scheduleId}
                    </p>
                  </div>
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
                  <DetailFact
                    label={t("detail.schedules.fields.cron")}
                    value={schedule.cron}
                  />
                  <DetailFact
                    label={t("detail.schedules.fields.timezone")}
                    value={schedule.timezone}
                  />
                  <DetailFact
                    label={t("detail.schedules.fields.generatedCron")}
                    value={formatGeneratedScheduleCrons(schedule)}
                  />
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}

function DeletedBatchArchiveCard({
  archive,
  defaultBranch,
}: {
  archive: DeletedBatchArchiveResult;
  defaultBranch: string;
}) {
  return archive.status === "VERIFIED" ? (
    <VerifiedDeletedBatchArchiveCard
      archive={archive}
      defaultBranch={defaultBranch}
    />
  ) : (
    <UnavailableDeletedBatchArchiveCard archive={archive} />
  );
}

function VerifiedDeletedBatchArchiveCard({
  archive,
  defaultBranch,
}: {
  archive: Extract<DeletedBatchArchiveResult, { status: "VERIFIED" }>;
  defaultBranch: string;
}) {
  const { t } = useTranslation("batches");
  const { batch, sourceRequest } = archive;
  const schedules = batch.schedules ?? [];

  return (
    <article className="rounded-lg border border-red-200 bg-white p-5 shadow-sm">
      <DeletedArchiveHeader
        batchId={batch.batchId}
        description={t("detail.deleted.description")}
        sourceRequest={sourceRequest}
        title={batch.name}
      />

      <dl className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <DetailFact label={t("detail.fields.owner")} value={batch.owner} />
        <DetailFact label={t("detail.fields.domain")} value={batch.domain} />
        <DetailFact
          label={t("detail.fields.environment")}
          value={batch.environment}
        />
        <DetailFact
          label={t("detail.fields.criticality")}
          value={batch.criticality}
        />
        <DetailFact
          label={t("detail.fields.defaultBranch")}
          value={defaultBranch}
        />
      </dl>

      <div className="mt-5 grid gap-5 border-t border-slate-100 pt-5 lg:grid-cols-2">
        <section>
          <h3 className="text-sm font-bold text-bp-graphite">
            {t("detail.workflow.title")}
          </h3>
          <dl className="mt-3 space-y-3 text-sm">
            <DetailFact
              label={t("detail.workflow.runtime")}
              value={t("detail.workflow.runtimeGithubActions")}
            />
            <DetailFact
              label={t("detail.workflow.path")}
              value={batch.workflow.path}
            />
            <DetailFact
              label={t("detail.workflow.ref")}
              value={batch.workflow.ref}
            />
          </dl>
        </section>

        <section>
          <h3 className="text-sm font-bold text-bp-graphite">
            {t("detail.executionSpec.title")}
          </h3>
          {batch.execution ? (
            <dl className="mt-3 space-y-3 text-sm">
              <DetailFact
                label={t("detail.executionSpec.runsOn")}
                value={formatRunnerLabel(batch.execution.runsOn)}
              />
              <DetailFact
                label={t("detail.executionSpec.artifactPath")}
                value={
                  batch.execution.artifactPath ||
                  t("detail.executionSpec.noArtifact")
                }
              />
              <div>
                <dt className="text-xs font-semibold uppercase text-bp-muted">
                  {t("detail.executionSpec.command")}
                </dt>
                <dd className="mt-1">
                  <pre className="max-h-36 overflow-auto whitespace-pre-wrap rounded-md bg-bp-graphite p-3 text-xs leading-5 text-white">
                    {batch.execution.command ||
                      t("detail.executionSpec.missing")}
                  </pre>
                </dd>
              </div>
            </dl>
          ) : (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
              {t("detail.executionSpec.missing")}
            </p>
          )}
        </section>
      </div>

      <section className="mt-5 border-t border-slate-100 pt-5">
        <h3 className="text-sm font-bold text-bp-graphite">
          {t("detail.schedules.title")}
        </h3>
        {schedules.length === 0 ? (
          <p className="mt-3 text-sm text-bp-muted">
            {t("detail.schedules.empty")}
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {schedules.map((schedule) => (
              <li
                className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
                key={schedule.scheduleId}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-bp-graphite">
                      {schedule.name}
                    </p>
                    <p className="mt-1 font-mono text-xs text-bp-muted">
                      {schedule.scheduleId}
                    </p>
                  </div>
                  <span className="rounded-md bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-700">
                    {schedule.enabled
                      ? t("detail.schedules.enabled")
                      : t("detail.schedules.disabled")}
                  </span>
                </div>
                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
                  <DetailFact
                    label={t("detail.schedules.fields.cron")}
                    value={schedule.cron}
                  />
                  <DetailFact
                    label={t("detail.schedules.fields.timezone")}
                    value={schedule.timezone}
                  />
                  <DetailFact
                    label={t("detail.schedules.fields.generatedCron")}
                    value={formatGeneratedScheduleCrons(schedule)}
                  />
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}

function UnavailableDeletedBatchArchiveCard({
  archive,
}: {
  archive: Extract<DeletedBatchArchiveResult, { status: "UNAVAILABLE" }>;
}) {
  const { t } = useTranslation("batches");

  return (
    <article className="rounded-lg border border-amber-200 bg-white p-5 shadow-sm">
      <DeletedArchiveHeader
        description={t("detail.deleted.evidenceUnavailableDescription")}
        sourceRequest={archive.sourceRequest}
        title={t("detail.deleted.evidenceUnavailableTitle")}
      />
      <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950">
        <span className="font-bold">
          {t("detail.deleted.evidenceUnavailableReasonLabel")}:
        </span>{" "}
        {getDeletedArchiveUnavailableReasonLabel(archive.unavailableReason, t)}
      </p>
    </article>
  );
}

function DeletedArchiveHeader({
  batchId,
  description,
  sourceRequest,
  title,
}: {
  batchId?: string;
  description: string;
  sourceRequest: DeletedBatchArchiveSourceRequest;
  title: string;
}) {
  const { t } = useTranslation("batches");

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-bold text-bp-graphite">{title}</h2>
          <span className="rounded-md bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700">
            {t("detail.deleted.badge")}
          </span>
        </div>
        {batchId ? (
          <p className="mt-1 font-mono text-sm text-bp-muted">{batchId}</p>
        ) : null}
        <p className="mt-2 text-sm text-bp-muted">{description}</p>
      </div>
      <SourceRequestLink sourceRequest={sourceRequest} />
    </div>
  );
}

function SourceRequestLink({
  sourceRequest,
}: {
  sourceRequest: DeletedBatchArchiveSourceRequest;
}) {
  const { t } = useTranslation("batches");

  return (
    <a
      className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bp-graphite"
      href={sourceRequest.url}
      rel="noreferrer"
      target="_blank"
    >
      <GitPullRequest className="h-4 w-4" aria-hidden="true" />
      {t("detail.deleted.openRequest", {
        locator: getSourceRequestLocator(sourceRequest),
      })}
    </a>
  );
}

function getSourceRequestLocator(
  sourceRequest: DeletedBatchArchiveSourceRequest,
): string {
  return sourceRequest.number === undefined
    ? sourceRequest.locator
    : `#${sourceRequest.number}`;
}

function getDeletedArchiveUnavailableReasonLabel(
  reason: Extract<
    DeletedBatchArchiveResult,
    { status: "UNAVAILABLE" }
  >["unavailableReason"],
  translate: (key: string) => string,
): string {
  switch (reason) {
    case "LEGACY_OR_MALFORMED_EVIDENCE":
      return translate(
        "detail.deleted.unavailableReasons.LEGACY_OR_MALFORMED_EVIDENCE",
      );
    case "REQUEST_EVIDENCE_MISMATCH":
      return translate(
        "detail.deleted.unavailableReasons.REQUEST_EVIDENCE_MISMATCH",
      );
    case "REQUEST_EVIDENCE_UNVERIFIED":
      return translate(
        "detail.deleted.unavailableReasons.REQUEST_EVIDENCE_UNVERIFIED",
      );
    case "BASE_REVISION_UNAVAILABLE":
      return translate(
        "detail.deleted.unavailableReasons.BASE_REVISION_UNAVAILABLE",
      );
    case "BATCH_DEFINITION_NOT_FOUND":
      return translate(
        "detail.deleted.unavailableReasons.BATCH_DEFINITION_NOT_FOUND",
      );
    case "BATCH_DEFINITION_DIGEST_MISMATCH":
      return translate(
        "detail.deleted.unavailableReasons.BATCH_DEFINITION_DIGEST_MISMATCH",
      );
    case "BATCH_DEFINITION_MALFORMED":
      return translate(
        "detail.deleted.unavailableReasons.BATCH_DEFINITION_MALFORMED",
      );
    default:
      return translate("detail.deleted.unavailableReasons.unknown");
  }
}

function RequestActionsCard({
  batch,
  canRequestExecution,
  changeRequestBlockers,
}: {
  batch: BatchDefinition;
  canRequestExecution: boolean;
  changeRequestBlockers: ChangeRequestBlocker[];
}) {
  const { t } = useTranslation("batches");
  const navigate = useNavigate();
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deletePanelOpen, setDeletePanelOpen] = useState(false);
  const [deleteRequestState, setDeleteRequestState] = useState<
    { type: "idle" } | { type: "running" } | { type: "error"; message: string }
  >({ type: "idle" });
  const executionRequestPath = `/batches/${encodeURIComponent(
    batch.batchId,
  )}/execution-requests/new`;
  const changeRequestBlocked = changeRequestBlockers.length > 0;
  const canConfirmDelete = deleteConfirmation.trim() === batch.batchId;

  async function createDeleteRequest() {
    if (!canConfirmDelete || deleteRequestState.type === "running") {
      return;
    }

    setDeleteRequestState({ type: "running" });
    navigate(`/batches/new?delete=${encodeURIComponent(batch.batchId)}`);
  }

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-bp-graphite">
          {t("detail.requests.title")}
        </h2>
        <span>
          <span
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${
              batch.gateRequired
                ? "bg-emerald-50 text-emerald-800"
                : "bg-amber-50 text-amber-900"
            }`}
            title={
              batch.gateRequired
                ? t("detail.gate.required")
                : t("detail.gate.nonCompliant")
            }
          >
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            {batch.gateRequired
              ? t("detail.gate.requiredShort")
              : t("detail.gate.nonCompliantShort")}
          </span>
          <span
            className="ml-2 inline-flex rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-bp-muted"
            title={t("detail.approvalPolicy.default")}
          >
            {t("detail.approvalPolicy.short")}
          </span>
        </span>
      </div>

      <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
        <h3 className="text-sm font-bold text-bp-graphite">
          {t("detail.execution.title")}
        </h3>
        {canRequestExecution ? (
          <Link
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-bp-control px-4 py-2 text-sm font-semibold text-white"
            to={executionRequestPath}
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            {t("actions.requestRun")}
          </Link>
        ) : (
          <button
            className="inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-md bg-slate-300 px-4 py-2 text-sm font-semibold text-white"
            disabled
            title={t("detail.execution.unavailable")}
            type="button"
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            {t("actions.requestRun")}
          </button>
        )}
      </div>

      <div className="mt-5 border-t border-slate-100 pt-5">
        <h3 className="text-sm font-bold text-bp-graphite">
          {t("detail.change.title")}
        </h3>
        <p className="mt-2 text-sm text-bp-muted">
          {t("detail.change.description")}
        </p>
        {changeRequestBlocked ? (
          <div className="mt-4 space-y-3">
            <button
              className="inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-500"
              disabled
              title={t("detail.change.blocked")}
              type="button"
            >
              <GitPullRequest className="h-4 w-4" aria-hidden="true" />
              {t("actions.requestChange")}
            </button>
            <ChangeRequestBlockerList blockers={changeRequestBlockers} />
          </div>
        ) : (
          <Link
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bp-graphite"
            to={`/batches/new?change=${encodeURIComponent(batch.batchId)}`}
          >
            <GitPullRequest className="h-4 w-4" aria-hidden="true" />
            {t("actions.requestChange")}
          </Link>
        )}
      </div>

      <div className="mt-5 border-t border-slate-100 pt-5">
        <h3 className="text-sm font-bold text-red-700">
          {t("detail.delete.title")}
        </h3>
        <p className="mt-2 text-sm text-bp-muted">
          {t("detail.delete.description")}
        </p>
        {deletePanelOpen ? (
          <div className="mt-4 space-y-3 rounded-md border border-red-200 bg-red-50 p-3">
            <label className="block text-xs font-semibold uppercase text-red-700">
              {t("detail.delete.confirmationLabel")}
              <input
                className="mt-1 w-full rounded-md border border-red-200 bg-white px-3 py-2 font-mono text-sm text-bp-graphite outline-none focus:border-red-500"
                onChange={(event) => {
                  setDeleteConfirmation(event.target.value);
                  setDeleteRequestState({ type: "idle" });
                }}
                placeholder={batch.batchId}
                value={deleteConfirmation}
              />
            </label>
            {deleteRequestState.type === "error" ? (
              <p className="text-sm font-semibold text-red-700">
                {deleteRequestState.message}
              </p>
            ) : (
              <p className="text-xs text-red-700">
                {t("detail.delete.blocked")}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={
                  !canConfirmDelete || deleteRequestState.type === "running"
                }
                onClick={() => void createDeleteRequest()}
                type="button"
              >
                {deleteRequestState.type === "running" ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Trash2 className="h-4 w-4" aria-hidden />
                )}
                {t("actions.createDeleteRequest")}
              </button>
              <button
                className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bp-graphite"
                disabled={deleteRequestState.type === "running"}
                onClick={() => {
                  setDeletePanelOpen(false);
                  setDeleteConfirmation("");
                  setDeleteRequestState({ type: "idle" });
                }}
                type="button"
              >
                {t("actions.cancel")}
              </button>
            </div>
          </div>
        ) : (
          <button
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700"
            onClick={() => setDeletePanelOpen(true)}
            type="button"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {t("actions.requestDelete")}
          </button>
        )}
      </div>
    </article>
  );
}

function ChangeRequestBlockerList({
  blockers,
}: {
  blockers: ChangeRequestBlocker[];
}) {
  const { t } = useTranslation("batches");

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
      <p className="text-xs font-semibold text-amber-950">
        {t("detail.change.blocked")}
      </p>
      <ul className="mt-2 space-y-1.5">
        {blockers.map((blocker) => (
          <li
            className="flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900"
            key={`${blocker.type}-${blocker.number}`}
          >
            <span className="font-semibold">
              {blocker.type === "governed-change"
                ? t("detail.change.blockedByPr", {
                    number: blocker.number,
                  })
                : t("detail.change.blockedByIssue", {
                    number: blocker.number,
                  })}
            </span>
            <Link
              className="font-semibold text-amber-950 underline"
              to={getChangeRequestBlockerDetailPath(blocker)}
            >
              {blocker.type === "governed-change"
                ? t("detail.change.openBlockingPr")
                : t("detail.change.openBlockingIssue")}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RecentExecutionEvidence({
  issues,
}: {
  issues: RecentExecutionIssue[];
}) {
  const { t } = useTranslation("batches");

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-bp-graphite">
        {t("detail.recentRuns.title")}
      </h2>
      {issues.length === 0 ? (
        <p className="mt-4 text-sm text-bp-muted">
          {t("detail.recentRuns.empty")}
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100">
          {issues.map(({ comments, issue }) => {
            const evidence = getExecutionIssueEvidence(issue);

            return (
              <li className="py-3 first:pt-0 last:pb-0" key={issue.number}>
                <Link
                  className="text-sm font-semibold text-bp-graphite hover:text-bp-control"
                  to={`/execution-requests/${issue.number}`}
                >
                  #{issue.number} {issue.title}
                </Link>
                <p className="mt-1 text-xs font-semibold text-bp-muted">
                  {getExecutionIssueStatusLabel(issue, comments, t)}
                </p>
                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                  <DetailFact
                    label={t("detail.recentRuns.fields.requestId")}
                    value={
                      evidence.requestId || t("detail.recentRuns.unknownValue")
                    }
                  />
                  <DetailFact
                    label={t("detail.recentRuns.fields.requestedBy")}
                    value={
                      evidence.requestedBy ||
                      t("detail.recentRuns.unknownValue")
                    }
                  />
                  <DetailFact
                    label={t("detail.recentRuns.fields.requestedAt")}
                    value={
                      evidence.requestedAt ||
                      t("detail.recentRuns.unknownValue")
                    }
                  />
                  <DetailFact
                    label={t("detail.recentRuns.fields.requestDigest")}
                    value={
                      evidence.requestDigest ||
                      t("detail.recentRuns.unknownValue")
                    }
                  />
                </dl>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}

function DetailFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-bp-muted">{label}</dt>
      <dd className="mt-1 break-words text-sm font-bold text-bp-graphite">
        {value}
      </dd>
    </div>
  );
}

function issueContainsBatch(issue: RepositoryIssue, batchId: string): boolean {
  return (
    issue.title.includes(batchId) || issue.body.includes(`batchId=${batchId}`)
  );
}

async function loadDeletedBatchArchive({
  batchId,
  ref,
  runtime,
}: {
  batchId: string;
  ref: string;
  runtime: BatchPlaneRuntimePorts;
}): Promise<DeletedBatchArchiveResult | null> {
  return runtime.batches.getDeletedBatchArchive({ batchId, ref });
}

function formatRunnerLabel(
  runsOn: NonNullable<BatchDefinition["execution"]>["runsOn"],
) {
  return Array.isArray(runsOn) ? runsOn.join(", ") : runsOn;
}

function getExecutionIssueEvidence(issue: RepositoryIssue) {
  return {
    requestDigest: readMarkdownField(issue.body, "Request digest"),
    requestedAt: readMarkdownField(issue.body, "Requested at"),
    requestedBy: readMarkdownField(issue.body, "Requested by"),
    requestId: readMarkdownField(issue.body, "Request ID"),
  };
}

function readMarkdownField(body: string, label: string): string {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = body.match(new RegExp(`- ${escapedLabel}:\\s*(.+)`));
  const value = match?.[1]?.trim() ?? "";

  return value.replace(/^`|`$/g, "").trim();
}

function getExecutionIssueStatusLabel(
  issue: RepositoryIssue,
  comments: RepositoryIssueComment[],
  t: (key: string) => string,
): string {
  const request = parseExecutionRequestDetail(issue, comments);

  switch (request?.status) {
    case "APPROVED":
      return t("detail.recentRuns.status.approved");
    case "DISPATCH_FAILED":
      return t("detail.recentRuns.status.dispatchFailed");
    case "DISPATCHING":
      return t("detail.recentRuns.status.dispatching");
    case "DISPATCHED":
      return t("detail.recentRuns.status.dispatched");
    case "GATE_BLOCKED":
      return t("detail.recentRuns.status.gateBlocked");
    case "REJECTED":
      return t("detail.recentRuns.status.rejected");
    case "REQUESTED":
      return t("detail.recentRuns.status.requested");
    default:
      return t("detail.recentRuns.status.unknown");
  }
}
