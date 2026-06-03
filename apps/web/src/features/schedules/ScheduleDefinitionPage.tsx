import type {
  BatchDefinition,
  BatchPlaneRuntimePorts,
  RepositoryPullRequest,
  ScheduleDefinition,
} from "@batchplane/domain";
import { Clock3, GitPullRequest, Loader2 } from "lucide-react";
import {
  type ChangeEvent,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useTranslation } from "react-i18next";

import type { GitHubSession } from "../lite-setup/github-session";
import { PageHeader } from "../../shared/components/PageHeader";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../shared/components/PageState";
import {
  createBatchPlaneRuntime,
  readRuntimeSession,
} from "../../runtime/runtime-fixtures";
import { formatRuntimeError } from "../../runtime/runtime-errors";
import {
  buildSchedulePullRequestBody,
  buildSchedulePullRequestTitle,
  createScheduleBranchName,
  defaultScheduleFormValues,
  serializeScheduleDefinitionYaml,
  toScheduleDefinition,
  toScheduleFormValues,
  validateScheduleRegistration,
  type ScheduleFormValues,
  type ScheduleRequestMode,
} from "./schedule-model";
import { getCronPreview } from "./cron-preview";

type ScheduleDefinitionPageProps = {
  createRuntime?: (session: GitHubSession) => BatchPlaneRuntimePorts;
  readSession?: () => GitHubSession | null;
};

type LoadState =
  | { type: "loading" }
  | { type: "no-session" }
  | { type: "batch-not-found"; batchId: string }
  | { type: "schedule-not-found"; scheduleId: string }
  | { type: "error"; message: string }
  | { type: "ready"; batch: BatchDefinition };

type SubmissionState =
  | { type: "idle" }
  | { type: "submitting" }
  | { type: "success"; pullRequest: RepositoryPullRequest }
  | { type: "error"; message: string };

export function ScheduleDefinitionPage({
  createRuntime = createBatchPlaneRuntime,
  readSession = readRuntimeSession,
}: ScheduleDefinitionPageProps = {}) {
  const { batchId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation("schedules");
  const decodedBatchId = decodeURIComponent(batchId);
  const changeScheduleId = searchParams.get("change")?.trim() ?? "";
  const mode: ScheduleRequestMode = changeScheduleId ? "change" : "create";
  const [values, setValues] = useState<ScheduleFormValues>(
    defaultScheduleFormValues,
  );
  const [loadState, setLoadState] = useState<LoadState>({ type: "loading" });
  const [submissionState, setSubmissionState] = useState<SubmissionState>({
    type: "idle",
  });

  const definition = useMemo(
    () => toScheduleDefinition(decodedBatchId, values),
    [decodedBatchId, values],
  );
  const cronPreview = useMemo(
    () => getCronPreview(values.cron, values.timezone),
    [values.cron, values.timezone],
  );
  const yaml = useMemo(
    () => serializeScheduleDefinitionYaml(definition),
    [definition],
  );
  const missingFields = useMemo(
    () => validateScheduleRegistration(definition),
    [definition],
  );
  const canSubmit =
    missingFields.length === 0 && submissionState.type !== "submitting";

  useEffect(() => {
    if (mode === "change") {
      return;
    }

    setValues(defaultScheduleFormValues);
    setSubmissionState({ type: "idle" });
  }, [mode]);

  useEffect(() => {
    let ignoreResult = false;

    async function loadBatchAndSchedule() {
      const session = readSession();

      if (!session) {
        setLoadState({ type: "no-session" });
        return;
      }

      setLoadState({ type: "loading" });

      try {
        const runtime = createRuntime(session);
        const repository = await runtime.settings.getRepository();
        const [batches, schedules] = await Promise.all([
          runtime.batches.listBatchDefinitions({
            ref: repository.defaultBranch,
          }),
          runtime.schedules.listScheduleDefinitions({
            batchId: decodedBatchId,
            ref: repository.defaultBranch,
          }),
        ]);
        const batch = batches.find(
          (candidate) => candidate.batchId === decodedBatchId,
        );

        if (!batch) {
          if (!ignoreResult) {
            setLoadState({ type: "batch-not-found", batchId: decodedBatchId });
          }
          return;
        }

        if (mode === "change") {
          const schedule = schedules.find(
            (candidate) => candidate.scheduleId === changeScheduleId,
          );

          if (!schedule) {
            if (!ignoreResult) {
              setLoadState({
                type: "schedule-not-found",
                scheduleId: changeScheduleId,
              });
            }
            return;
          }

          if (!ignoreResult) {
            setValues(toScheduleFormValues(schedule));
          }
        }

        if (!ignoreResult) {
          setLoadState({ type: "ready", batch });
        }
      } catch (error) {
        if (!ignoreResult) {
          setLoadState({
            type: "error",
            message: formatRuntimeError(error, t("states.loadError")),
          });
        }
      }
    }

    void loadBatchAndSchedule();

    return () => {
      ignoreResult = true;
    };
  }, [changeScheduleId, createRuntime, decodedBatchId, mode, readSession, t]);

  async function submitSchedulePullRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (missingFields.length > 0) {
      setSubmissionState({
        type: "error",
        message: t("errors.required", {
          fields: missingFields.join(", "),
        }),
      });
      return;
    }

    const session = readSession();

    if (!session) {
      setSubmissionState({
        type: "error",
        message: t("errors.noSession"),
      });
      return;
    }

    setSubmissionState({ type: "submitting" });

    try {
      const runtime = createRuntime(session);
      const repository = await runtime.settings.getRepository();
      const target = await runtime.schedules.checkScheduleDefinitionTarget({
        baseBranch: repository.defaultBranch,
        scheduleDefinitionPath: definition.definitionPath,
      });

      if (mode === "create" && target.scheduleDefinitionExists) {
        setSubmissionState({
          type: "error",
          message: t("errors.alreadyExists", {
            path: definition.definitionPath,
          }),
        });
        return;
      }

      if (mode === "change" && !target.scheduleDefinitionExists) {
        setSubmissionState({
          type: "error",
          message: t("errors.changeMissingDefinition", {
            path: definition.definitionPath,
          }),
        });
        return;
      }

      const branch = createScheduleBranchName(definition.scheduleId, mode);
      const title = buildSchedulePullRequestTitle(definition, mode);
      const pullRequest =
        await runtime.schedules.createScheduleDefinitionPullRequest({
          baseBranch: repository.defaultBranch,
          body: buildSchedulePullRequestBody(definition, mode),
          branch,
          scheduleDefinitionPath: definition.definitionPath,
          scheduleDefinitionYaml: yaml,
          title,
        });

      setSubmissionState({ type: "success", pullRequest });
      navigate(`/approvals/registration/${pullRequest.number}`);
    } catch (error) {
      setSubmissionState({
        type: "error",
        message: formatRuntimeError(error, t("errors.unknown")),
      });
    }
  }

  const pageTitle = t(mode === "change" ? "titleChange" : "title");
  const pageSubtitle =
    loadState.type === "ready"
      ? t(mode === "change" ? "subtitleChange" : "subtitle", {
          batchId: loadState.batch.batchId,
          batchName: loadState.batch.name,
        })
      : t("subtitleFallback", { batchId: decodedBatchId });

  if (loadState.type === "loading") {
    return (
      <section>
        <PageHeader subtitle={pageSubtitle} title={pageTitle} />
        <LoadingState message={t("states.loading")} />
      </section>
    );
  }

  if (loadState.type === "no-session") {
    return (
      <section>
        <PageHeader subtitle={pageSubtitle} title={pageTitle} />
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
      </section>
    );
  }

  if (loadState.type === "batch-not-found") {
    return (
      <section>
        <PageHeader subtitle={pageSubtitle} title={pageTitle} />
        <ErrorState
          message={t("states.batchNotFound", { batchId: loadState.batchId })}
        />
      </section>
    );
  }

  if (loadState.type === "schedule-not-found") {
    return (
      <section>
        <PageHeader subtitle={pageSubtitle} title={pageTitle} />
        <ErrorState
          message={t("states.scheduleNotFound", {
            scheduleId: loadState.scheduleId,
          })}
        />
      </section>
    );
  }

  if (loadState.type === "error") {
    return (
      <section>
        <PageHeader subtitle={pageSubtitle} title={pageTitle} />
        <ErrorState message={loadState.message} />
      </section>
    );
  }

  return (
    <section>
      <PageHeader subtitle={pageSubtitle} title={pageTitle} />
      <form
        className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]"
        onSubmit={(event) => void submitSchedulePullRequest(event)}
      >
        <div className="space-y-4">
          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-bp-graphite">
              {t("form.definition")}
            </h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {mode === "change" ? (
                <ReadOnlyField
                  label={t("form.scheduleId")}
                  value={values.scheduleId}
                />
              ) : (
                <TextField
                  label={t("form.scheduleId")}
                  onChange={updateTextField("scheduleId", setValues)}
                  placeholder="payment.daily-close-daily"
                  value={values.scheduleId}
                />
              )}
              <ReadOnlyField label={t("form.batchId")} value={decodedBatchId} />
              <TextField
                label={t("form.name")}
                onChange={updateTextField("name", setValues)}
                placeholder="Daily settlement window"
                value={values.name}
              />
            </div>
          </article>

          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-bp-graphite">
              {t("form.schedule")}
            </h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <TextField
                label={t("form.cron")}
                onChange={updateTextField("cron", setValues)}
                placeholder="0 5 * * *"
                value={values.cron}
              />
              <TextField
                label={t("form.timezone")}
                onChange={updateTextField("timezone", setValues)}
                placeholder="Asia/Seoul"
                value={values.timezone}
              />
            </div>
            <CronPreviewBlock
              invalidLabel={t("form.cronPreviewInvalid")}
              nextLabel={t("form.cronPreviewNext")}
              preview={cronPreview}
              title={t("form.cronPreviewTitle")}
            />
            <label className="mt-5 inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-bp-graphite">
              <input
                checked={values.enabled}
                className="h-4 w-4 rounded border-slate-300 text-bp-control focus:ring-bp-control"
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    enabled: event.target.checked,
                  }))
                }
                type="checkbox"
              />
              {t("form.enabled")}
            </label>
          </article>

          <SubmissionBanner mode={mode} state={submissionState} />
        </div>

        <aside className="space-y-4">
          <ReviewPanel
            batch={loadState.batch}
            canSubmit={canSubmit}
            definition={definition}
            missingFields={missingFields}
            mode={mode}
            submissionState={submissionState}
          />
          <YamlPreviewPanel path={definition.definitionPath} yaml={yaml} />
        </aside>
      </form>
    </section>
  );
}

function ReviewPanel({
  batch,
  canSubmit,
  definition,
  missingFields,
  mode,
  submissionState,
}: {
  batch: BatchDefinition;
  canSubmit: boolean;
  definition: ScheduleDefinition;
  missingFields: string[];
  mode: ScheduleRequestMode;
  submissionState: SubmissionState;
}) {
  const { t } = useTranslation("schedules");
  const isSubmitting = submissionState.type === "submitting";

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-bp-graphite">
        {t("review.title")}
      </h2>
      <dl className="mt-4 grid gap-3 text-sm">
        <DetailMeta
          label={t("review.batch")}
          value={`${batch.name} (${batch.batchId})`}
        />
        <DetailMeta
          label={t("review.requestType")}
          value={mode.toUpperCase()}
        />
        <DetailMeta
          label={t("review.definitionPath")}
          value={definition.definitionPath}
        />
      </dl>

      {missingFields.length > 0 ? (
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
          {t("review.missingFields", { fields: missingFields.join(", ") })}
        </p>
      ) : (
        <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
          {t("review.ready")}
        </p>
      )}

      <button
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-bp-control px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
        disabled={!canSubmit}
        type="submit"
      >
        {isSubmitting ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <GitPullRequest className="h-4 w-4" aria-hidden="true" />
        )}
        {t(
          mode === "change"
            ? "actions.requestChange"
            : "actions.requestRegister",
        )}
      </button>
    </article>
  );
}

function YamlPreviewPanel({ path, yaml }: { path: string; yaml: string }) {
  const { t } = useTranslation("schedules");

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-bp-graphite">
        {t("preview.title")}
      </h2>
      <p className="mt-2 font-mono text-xs text-bp-muted">{path}</p>
      <pre className="mt-4 max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-md bg-bp-graphite p-4 text-xs leading-5 text-white">
        {yaml}
      </pre>
    </article>
  );
}

function SubmissionBanner({
  mode,
  state,
}: {
  mode: ScheduleRequestMode;
  state: SubmissionState;
}) {
  const { t } = useTranslation("schedules");

  if (state.type === "success") {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
        {t(mode === "change" ? "result.changeCreated" : "result.created", {
          number: state.pullRequest.number,
        })}
      </div>
    );
  }

  if (state.type === "error") {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
        {state.message}
      </div>
    );
  }

  return null;
}

function DetailMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 px-3 py-2">
      <dt className="text-xs font-semibold uppercase text-bp-muted">{label}</dt>
      <dd className="mt-1 break-all font-mono text-xs text-bp-graphite">
        {value || "-"}
      </dd>
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="text-sm font-semibold text-bp-graphite">{label}</label>
      <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-bp-graphite">
        {value || "-"}
      </div>
    </div>
  );
}

function TextField({
  description,
  label,
  onChange,
  placeholder,
  value,
}: {
  description?: string;
  label: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-bp-graphite">{label}</span>
      <input
        aria-label={label}
        className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-bp-graphite shadow-sm focus:border-bp-control focus:outline-none focus:ring-2 focus:ring-bp-control/20"
        onChange={onChange}
        placeholder={placeholder}
        type="text"
        value={value}
      />
      {description ? (
        <p className="mt-2 text-xs font-normal leading-5 text-bp-muted">
          {description}
        </p>
      ) : null}
    </label>
  );
}

function CronPreviewBlock({
  invalidLabel,
  nextLabel,
  preview,
  title,
}: {
  invalidLabel: string;
  nextLabel: string;
  preview: ReturnType<typeof getCronPreview>;
  title: string;
}) {
  const { i18n } = useTranslation();
  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language || undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [i18n.language],
  );

  return (
    <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm">
      <div className="flex items-center gap-2 font-semibold text-bp-graphite">
        <Clock3 className="h-4 w-4 text-bp-muted" aria-hidden="true" />
        <span>{title}</span>
      </div>
      {preview.ok ? (
        <ul className="mt-2 space-y-1 text-bp-graphite">
          {preview.dates.map((date, index) => (
            <li key={`${date.toISOString()}-${index}`}>
              {nextLabel} {index + 1}: {formatter.format(date)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-amber-800">
          {invalidLabel}: {preview.error}
        </p>
      )}
    </div>
  );
}

function updateTextField(
  field: Exclude<keyof ScheduleFormValues, "enabled">,
  setValues: Dispatch<SetStateAction<ScheduleFormValues>>,
) {
  return (event: ChangeEvent<HTMLInputElement>) => {
    setValues((current) => ({
      ...current,
      [field]: event.target.value,
    }));
  };
}
