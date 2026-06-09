import type {
  BatchDefinition,
  BatchPlaneRuntimePorts,
  BatchStatus,
  Criticality,
  RepositoryPullRequest,
  RunnerLabel,
  ScheduleDefinition,
} from "@batchplane/domain";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  FileCode2,
  FileText,
  GitPullRequest,
  Loader2,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { PageHeader } from "../../shared/components/PageHeader";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../shared/components/PageState";
import { GovernedChangePreviewPanel } from "../../shared/components/GovernedChangePreviewPanel";
import {
  hasNoGovernedFileChanges,
  type GovernedChangePreviewState,
} from "../../shared/components/governed-change-preview";
import {
  createBatchPlaneRuntime,
  readRuntimeSession,
} from "../../runtime/runtime-fixtures";
import { formatRuntimeError } from "../../runtime/runtime-errors";
import { approveGovernedChangeIfAutoApprovalEnabled } from "../approvals/governed-change-auto-approval";
import type { GitHubSession } from "../lite-setup/github-session";
import {
  buildBatchWorkflowYaml,
  buildRegistrationPullRequestBody,
  buildRegistrationPullRequestTitle,
  createRegistrationBranchName,
  defaultBatchRegistrationValues,
  getBatchArtifactPath,
  getBatchDefinitionPath,
  serializeBatchDefinitionYaml,
  toBatchRegistrationFormValues,
  toBatchDefinition,
  validateBatchRegistration,
  type BatchRegistrationFormValues,
  type RegistrationRequestMode,
} from "./registration-model";
import {
  getChangeRequestBlockerDetailPath,
  loadBatchChangeRequestBlockers,
  type ChangeRequestBlocker,
} from "./change-request-guard";
import {
  defaultScheduleFormValues,
  toBatchSchedule,
  toDerivedScheduleDefinition,
  toScheduleFormValues,
  validateScheduleRegistration,
  type ScheduleFormValues,
} from "../schedules/schedule-model";
import { getCronPreview } from "../schedules/cron-preview";

type SubmissionState =
  | { type: "idle" }
  | { type: "submitting" }
  | { type: "success"; pullRequest: RepositoryPullRequest }
  | { type: "error"; message: string };

type UploadedExecutionFile = {
  contentBase64: string;
  name: string;
};

type ScheduleDraft = {
  key: string;
  source: "existing" | "new";
  status: "active" | "deleted";
  values: ScheduleFormValues;
};

type BatchRegistrationPageProps = {
  createRuntime?: (session: GitHubSession) => BatchPlaneRuntimePorts;
  readSession?: () => GitHubSession | null;
};

type PrefillState =
  | { type: "ready" }
  | { type: "loading" }
  | { type: "no-session" }
  | { type: "not-found"; batchId: string }
  | { type: "blocked"; batchId: string; blockers: ChangeRequestBlocker[] }
  | { type: "error"; message: string };

const criticalityOptions: Criticality[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const statusOptions: BatchStatus[] = ["ACTIVE", "INACTIVE"];
const runnerOptions = [
  "ubuntu-latest",
  "ubuntu-24.04",
  "windows-latest",
  "macos-latest",
  "self-hosted",
] as const;
let scheduleDraftSequence = 0;

export function BatchRegistrationPage({
  createRuntime = createBatchPlaneRuntime,
  readSession = readRuntimeSession,
}: BatchRegistrationPageProps = {}) {
  const { t } = useTranslation("registration");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [values, setValues] = useState<BatchRegistrationFormValues>(
    defaultBatchRegistrationValues,
  );
  const [prefillState, setPrefillState] = useState<PrefillState>({
    type: "ready",
  });
  const [submissionState, setSubmissionState] = useState<SubmissionState>({
    type: "idle",
  });
  const [previewState, setPreviewState] = useState<GovernedChangePreviewState>({
    type: "idle",
  });
  const [uploadedFile, setUploadedFile] =
    useState<UploadedExecutionFile | null>(null);
  const [scheduleDrafts, setScheduleDrafts] = useState<ScheduleDraft[]>([]);
  const [autoFileCommand, setAutoFileCommand] = useState<string | null>(null);
  const [existingArtifactPath, setExistingArtifactPath] = useState<
    string | null
  >(null);
  const changeBatchId = searchParams.get("change")?.trim() ?? "";
  const mode: RegistrationRequestMode = changeBatchId ? "change" : "create";
  const pageTitle = t(mode === "change" ? "titleChange" : "title");
  const pageSubtitle = t(mode === "change" ? "subtitleChange" : "subtitle");

  const baseDefinition = useMemo(() => toBatchDefinition(values), [values]);
  const uploadedFilePath =
    uploadedFile && baseDefinition.batchId
      ? existingArtifactPath ||
        getBatchArtifactPath(baseDefinition.batchId, uploadedFile.name)
      : null;
  const resolvedArtifactPath = uploadedFilePath ?? existingArtifactPath;
  const activeScheduleDrafts = useMemo(
    () => scheduleDrafts.filter((draft) => draft.status === "active"),
    [scheduleDrafts],
  );
  const activeBatchSchedules = useMemo(
    () => activeScheduleDrafts.map((draft) => toBatchSchedule(draft.values)),
    [activeScheduleDrafts],
  );
  const definition = useMemo(
    () =>
      toBatchDefinition(values, {
        artifactPath: resolvedArtifactPath,
        schedules: activeBatchSchedules,
      }),
    [activeBatchSchedules, resolvedArtifactPath, values],
  );
  const deletedScheduleDrafts = useMemo(
    () =>
      scheduleDrafts.filter(
        (draft) => draft.source === "existing" && draft.status === "deleted",
      ),
    [scheduleDrafts],
  );
  const batchPath = getBatchDefinitionPath(
    definition.batchId || changeBatchId || baseDefinition.batchId,
  );
  const scheduleDefinitions = useMemo(
    () =>
      activeBatchSchedules.map((schedule) =>
        toDerivedScheduleDefinition(definition.batchId, batchPath, schedule),
      ),
    [activeBatchSchedules, batchPath, definition.batchId],
  );
  const deletedScheduleDefinitions = useMemo(
    () =>
      deletedScheduleDrafts.map((draft) =>
        toDerivedScheduleDefinition(
          definition.batchId,
          batchPath,
          toBatchSchedule(draft.values),
        ),
      ),
    [batchPath, definition.batchId, deletedScheduleDrafts],
  );
  const yaml = useMemo(
    () => serializeBatchDefinitionYaml(definition),
    [definition],
  );
  const generatedWorkflowYaml = useMemo(
    () =>
      buildBatchWorkflowYaml(definition, values.runCommand, values.runnerLabel),
    [definition, values.runCommand, values.runnerLabel],
  );
  const workflowPath = definition.workflow.path;
  const previewFiles = useMemo(
    () =>
      batchPath && workflowPath
        ? [
            { content: yaml, path: batchPath },
            { content: generatedWorkflowYaml, path: workflowPath },
          ]
        : [],
    [batchPath, generatedWorkflowYaml, workflowPath, yaml],
  );
  const missingFields = useMemo(() => {
    const fields = validateBatchRegistration(definition);

    if (!values.runCommand.trim()) {
      fields.push("runCommand");
    }

    if (!values.runnerLabel.trim()) {
      fields.push("runnerLabel");
    }

    const scheduleIdToIndexes = new Map<string, number[]>();
    scheduleDefinitions.forEach((schedule, index) => {
      validateScheduleRegistration(schedule)
        .filter((field) => field !== "batchId")
        .forEach((field) => fields.push(`schedule[${index + 1}].${field}`));

      if (!schedule.scheduleId) {
        return;
      }

      const existingIndexes =
        scheduleIdToIndexes.get(schedule.scheduleId) ?? [];
      existingIndexes.push(index + 1);
      scheduleIdToIndexes.set(schedule.scheduleId, existingIndexes);
    });

    for (const [scheduleId, indexes] of scheduleIdToIndexes.entries()) {
      if (indexes.length > 1) {
        indexes.forEach((index) =>
          fields.push(
            `schedule[${index}].scheduleId duplicate (${scheduleId})`,
          ),
        );
      }
    }

    return fields;
  }, [definition, scheduleDefinitions, values.runCommand, values.runnerLabel]);
  const nextAutoFileCommand = resolvedArtifactPath
    ? buildExecutionFileCommand(resolvedArtifactPath)
    : null;
  const selectedRunner = runnerOptions.includes(
    values.runnerLabel as (typeof runnerOptions)[number],
  )
    ? values.runnerLabel
    : "custom";
  const noGovernedFileChanges = hasNoGovernedFileChanges(previewState);
  const canSubmit =
    missingFields.length === 0 &&
    generatedWorkflowYaml.trim().length > 0 &&
    previewState.type === "ready" &&
    !noGovernedFileChanges &&
    submissionState.type !== "submitting";

  useEffect(() => {
    if (!autoFileCommand || !nextAutoFileCommand) {
      return;
    }

    setValues((current) =>
      current.runCommand === autoFileCommand
        ? { ...current, runCommand: nextAutoFileCommand }
        : current,
    );
    setAutoFileCommand(nextAutoFileCommand);
  }, [autoFileCommand, nextAutoFileCommand]);

  useEffect(() => {
    let ignoreResult = false;

    async function loadPreview() {
      if (
        previewFiles.length === 0 ||
        !definition.batchId ||
        !batchPath ||
        !workflowPath
      ) {
        setPreviewState({ type: "idle" });
        return;
      }

      const session = readSession();

      if (!session) {
        setPreviewState({ type: "no-session" });
        return;
      }

      setPreviewState({ type: "loading" });

      try {
        const runtime = createRuntime(session);
        const repository = await runtime.settings.getRepository();
        const files = await runtime.registration.previewGovernedChangeFiles({
          baseBranch: repository.defaultBranch,
          files: previewFiles,
        });

        if (!ignoreResult) {
          setPreviewState({ files, type: "ready" });
        }
      } catch (error) {
        if (!ignoreResult) {
          setPreviewState({
            type: "error",
            message: formatRuntimeError(error, t("errors.previewFailed")),
          });
        }
      }
    }

    void loadPreview();

    return () => {
      ignoreResult = true;
    };
  }, [
    batchPath,
    createRuntime,
    definition.batchId,
    previewFiles,
    readSession,
    t,
    workflowPath,
  ]);

  useEffect(() => {
    if (mode === "change") {
      return;
    }

    setPrefillState({ type: "ready" });
    setExistingArtifactPath(null);
    setUploadedFile(null);
    setScheduleDrafts([]);
    setAutoFileCommand(null);
    setValues(defaultBatchRegistrationValues);
  }, [mode]);

  useEffect(() => {
    if (mode !== "change") {
      return;
    }

    let ignoreResult = false;

    async function loadChangeTarget() {
      const session = readSession();

      if (!session) {
        if (!ignoreResult) {
          setPrefillState({ type: "no-session" });
        }
        return;
      }

      setPrefillState({ type: "loading" });

      try {
        const runtime = createRuntime(session);
        const repository = await runtime.settings.getRepository();
        const [batches, schedules] = await Promise.all([
          runtime.batches.listBatchDefinitions({
            ref: repository.defaultBranch,
          }),
          runtime.schedules.listScheduleDefinitions({
            batchId: changeBatchId,
            ref: repository.defaultBranch,
          }),
        ]);
        const batch = batches.find(
          (candidate) => candidate.batchId === changeBatchId,
        );

        if (!batch) {
          if (!ignoreResult) {
            setPrefillState({ type: "not-found", batchId: changeBatchId });
          }
          return;
        }

        const blockers = await loadBatchChangeRequestBlockers({
          baseBranch: repository.defaultBranch,
          batchId: batch.batchId,
          runtime,
        });

        if (blockers.length > 0) {
          if (!ignoreResult) {
            setPrefillState({
              batchId: batch.batchId,
              blockers,
              type: "blocked",
            });
          }
          return;
        }

        if (!ignoreResult) {
          applyPrefill(batch, schedules);
        }
      } catch (error) {
        if (!ignoreResult) {
          setPrefillState({
            type: "error",
            message: formatRegistrationError(
              error,
              t("states.changeLoadError"),
            ),
          });
        }
      }
    }

    void loadChangeTarget();

    return () => {
      ignoreResult = true;
    };
  }, [changeBatchId, createRuntime, mode, readSession, t]);

  function applyPrefill(
    batch: BatchDefinition,
    schedules: ScheduleDefinition[] = [],
  ) {
    setValues(toBatchRegistrationFormValues(batch));
    setExistingArtifactPath(batch.execution?.artifactPath ?? null);
    setUploadedFile(null);
    setScheduleDrafts(
      schedules.map((schedule) => ({
        key: nextScheduleDraftKey(),
        source: "existing",
        status: "active",
        values: toScheduleFormValues(schedule),
      })),
    );
    setAutoFileCommand(null);
    setSubmissionState({ type: "idle" });
    setPrefillState({ type: "ready" });
  }

  function addScheduleDraft() {
    setScheduleDrafts((current) => [
      ...current,
      {
        key: nextScheduleDraftKey(),
        source: "new",
        status: "active",
        values: { ...defaultScheduleFormValues },
      },
    ]);
  }

  function removeScheduleDraft(key: string) {
    setScheduleDrafts((current) =>
      current.flatMap((draft) => {
        if (draft.key !== key) {
          return [draft];
        }

        if (draft.source === "new") {
          return [];
        }

        return [{ ...draft, status: "deleted" as const }];
      }),
    );
  }

  function restoreScheduleDraft(key: string) {
    setScheduleDrafts((current) =>
      current.map((draft) =>
        draft.key === key ? { ...draft, status: "active" } : draft,
      ),
    );
  }

  function updateScheduleDraft(
    key: string,
    updater: (values: ScheduleFormValues) => ScheduleFormValues,
  ) {
    setScheduleDrafts((current) =>
      current.map((draft) =>
        draft.key === key ? { ...draft, values: updater(draft.values) } : draft,
      ),
    );
  }

  function updateTextField(
    field: keyof Omit<
      BatchRegistrationFormValues,
      "criticality" | "runCommand" | "status"
    >,
  ) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      setValues((current) => ({
        ...current,
        [field]: event.target.value,
      }));
    };
  }

  async function createRegistrationPullRequest(
    event: FormEvent<HTMLFormElement>,
  ) {
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

    if (previewState.type !== "ready") {
      setSubmissionState({
        type: "error",
        message: t("errors.previewNotReady"),
      });
      return;
    }

    if (noGovernedFileChanges) {
      setSubmissionState({
        type: "error",
        message: t("errors.noChanges"),
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
      const [registrationTargets, existingSchedules] = await Promise.all([
        runtime.registration.checkRegistrationTargets({
          baseBranch: repository.defaultBranch,
          batchDefinitionPath: batchPath,
          workflowPath,
        }),
        runtime.schedules.listScheduleDefinitions({
          ref: repository.defaultBranch,
        }),
      ]);

      if (mode === "create" && registrationTargets.batchDefinitionExists) {
        setSubmissionState({
          type: "error",
          message: t("errors.alreadyExists", { path: batchPath }),
        });
        return;
      }

      if (mode === "create" && registrationTargets.workflowExists) {
        setSubmissionState({
          type: "error",
          message: t("errors.workflowAlreadyExists", { path: workflowPath }),
        });
        return;
      }

      if (mode === "change" && !registrationTargets.batchDefinitionExists) {
        setSubmissionState({
          type: "error",
          message: t("errors.changeMissingDefinition", { path: batchPath }),
        });
        return;
      }

      const conflictingSchedule = scheduleDefinitions.find((schedule) => {
        if (!schedule.scheduleId) {
          return false;
        }

        const existing = existingSchedules.find(
          (candidate) => candidate.scheduleId === schedule.scheduleId,
        );

        if (!existing) {
          return false;
        }

        if (mode === "change" && existing.batchId === definition.batchId) {
          return false;
        }

        return true;
      });

      if (conflictingSchedule) {
        setSubmissionState({
          type: "error",
          message: t("errors.scheduleAlreadyExists", {
            path: conflictingSchedule.definitionPath,
          }),
        });
        return;
      }

      const branch = createRegistrationBranchName(definition.batchId, mode);
      const title = buildRegistrationPullRequestTitle(definition, mode);
      const pullRequest =
        await runtime.registration.createRegistrationPullRequest({
          artifact:
            uploadedFile && uploadedFilePath
              ? {
                  content: uploadedFile.contentBase64,
                  encoding: "base64",
                  path: uploadedFilePath,
                }
              : undefined,
          baseBranch: repository.defaultBranch,
          batchDefinitionPath: batchPath,
          batchDefinitionYaml: yaml,
          body: buildRegistrationPullRequestBody(
            definition,
            mode,
            scheduleDefinitions,
            deletedScheduleDefinitions,
          ),
          branch,
          title,
          workflowPath,
          workflowYaml: generatedWorkflowYaml,
        });

      await approveGovernedChangeIfAutoApprovalEnabled({
        defaultBranch: repository.defaultBranch,
        pullRequest,
        runtime,
      });

      setSubmissionState({ type: "success", pullRequest });
      navigate(`/approvals/registration/${pullRequest.number}`);
    } catch (error) {
      setSubmissionState({
        type: "error",
        message: formatRegistrationError(error, t("errors.unknown")),
      });
    }
  }

  if (prefillState.type === "loading") {
    return (
      <section>
        <PageHeader subtitle={pageSubtitle} title={pageTitle} />
        <LoadingState message={t("states.changeLoading")} />
      </section>
    );
  }

  if (prefillState.type === "no-session") {
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

  if (prefillState.type === "not-found") {
    return (
      <section>
        <PageHeader subtitle={pageSubtitle} title={pageTitle} />
        <ErrorState
          message={t("states.changeNotFound", {
            batchId: prefillState.batchId,
          })}
        />
      </section>
    );
  }

  if (prefillState.type === "blocked") {
    return (
      <section>
        <PageHeader subtitle={pageSubtitle} title={pageTitle} />
        <ChangeRequestBlockedState
          batchId={prefillState.batchId}
          blockers={prefillState.blockers}
        />
      </section>
    );
  }

  if (prefillState.type === "error") {
    return (
      <section>
        <PageHeader subtitle={pageSubtitle} title={pageTitle} />
        <ErrorState message={prefillState.message} />
      </section>
    );
  }

  return (
    <section>
      <PageHeader title={pageTitle} subtitle={pageSubtitle} />
      <form
        className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_28rem]"
        onSubmit={(event) => void createRegistrationPullRequest(event)}
      >
        <div className="space-y-4">
          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-bp-graphite">
              {t("form.definition")}
            </h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {mode === "change" ? (
                <ReadOnlyField
                  label={t("form.batchId")}
                  value={values.batchId}
                />
              ) : (
                <TextField
                  label={t("form.batchId")}
                  onChange={updateTextField("batchId")}
                  placeholder="payment.daily-close"
                  value={values.batchId}
                />
              )}
              <TextField
                label={t("form.name")}
                onChange={updateTextField("name")}
                placeholder="Daily Close"
                value={values.name}
              />
              <TextField
                label={t("form.owner")}
                onChange={updateTextField("owner")}
                placeholder="ops-team"
                value={values.owner}
              />
              <TextField
                label={t("form.domain")}
                onChange={updateTextField("domain")}
                placeholder="payments"
                value={values.domain}
              />
              <TextField
                label={t("form.environment")}
                onChange={updateTextField("environment")}
                placeholder="PROD"
                value={values.environment}
              />
              <SelectField
                label={t("form.criticality")}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    criticality: event.target.value as Criticality,
                  }))
                }
                options={criticalityOptions}
                value={values.criticality}
              />
              <SelectField
                label={t("form.status")}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    status: event.target.value as BatchStatus,
                  }))
                }
                options={statusOptions}
                value={values.status}
              />
            </div>
          </article>

          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-bp-graphite">
              {t("form.workflow")}
            </h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <ReadOnlyField
                label={t("form.workflowPath")}
                value={workflowPath}
              />
              <TextField
                label={t("form.workflowRef")}
                onChange={updateTextField("workflowRef")}
                placeholder="main"
                value={values.workflowRef}
              />
              <SelectField
                label={t("form.runnerLabel")}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    runnerLabel:
                      event.target.value === "custom" ? "" : event.target.value,
                  }))
                }
                options={[...runnerOptions, "custom"]}
                value={selectedRunner}
              />
              {selectedRunner === "custom" ? (
                <TextField
                  label={t("form.customRunnerLabel")}
                  onChange={updateTextField("runnerLabel")}
                  placeholder="self-hosted, linux, prod"
                  value={values.runnerLabel}
                />
              ) : null}
            </div>
            <div className="mt-5 flex items-center gap-2 text-xs font-semibold text-emerald-800">
              <ShieldCheck
                className="h-3.5 w-3.5 shrink-0"
                aria-hidden="true"
              />
              <span>{t("form.gateRequiredInline")}</span>
            </div>
            <FileUploadField
              disabled={!definition.batchId}
              filePath={resolvedArtifactPath}
              label={t("form.executionFile")}
              onChange={(file) => {
                void handleExecutionFileChange({
                  file,
                  onLoaded: ({ contentBase64, name }) => {
                    const path =
                      existingArtifactPath ||
                      getBatchArtifactPath(definition.batchId, name);
                    const command = buildExecutionFileCommand(path);

                    setUploadedFile({ contentBase64, name });
                    setValues((current) => ({
                      ...current,
                      runCommand: current.runCommand.trim()
                        ? current.runCommand
                        : command,
                    }));
                    setAutoFileCommand(command);
                  },
                  onError: () =>
                    setSubmissionState({
                      type: "error",
                      message: t("errors.fileRead"),
                    }),
                });
              }}
            />
            <TextAreaField
              label={t("form.runCommand")}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  runCommand: event.target.value,
                }))
              }
              placeholder={"./scripts/daily-close.sh\n# or\npnpm batch:close"}
              value={values.runCommand}
            />
          </article>

          <ScheduleDefinitionsPanel
            drafts={scheduleDrafts}
            mode={mode}
            onAdd={addScheduleDraft}
            onRemove={removeScheduleDraft}
            onRestore={restoreScheduleDraft}
            onUpdate={updateScheduleDraft}
          />

          <SubmissionBanner mode={mode} state={submissionState} />
        </div>

        <aside className="space-y-4">
          <PullRequestReviewPanel
            batchPath={batchPath}
            canSubmit={canSubmit}
            definition={definition}
            deletedScheduleDefinitions={deletedScheduleDefinitions}
            missingFields={missingFields}
            mode={mode}
            scheduleDefinitions={scheduleDefinitions}
            submissionState={submissionState}
            uploadedFilePath={resolvedArtifactPath}
            workflowPath={workflowPath}
          />
          <GovernedChangePreviewPanel
            namespace="registration"
            state={previewState}
          />
          <YamlPreviewPanel
            batchPath={batchPath}
            batchYaml={yaml}
            workflowPath={workflowPath}
            workflowYaml={generatedWorkflowYaml}
          />
        </aside>
      </form>
    </section>
  );
}

function ChangeRequestBlockedState({
  batchId,
  blockers,
}: {
  batchId: string;
  blockers: ChangeRequestBlocker[];
}) {
  const { t } = useTranslation("registration");

  return (
    <article className="rounded-lg border border-amber-200 bg-amber-50 p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-amber-950">
        {t("states.changeBlockedTitle")}
      </h2>
      <p className="mt-2 text-sm text-amber-900">
        {t("states.changeBlockedDescription", { batchId })}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          className="inline-flex items-center justify-center rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-950"
          to={`/batches/${encodeURIComponent(batchId)}`}
        >
          {t("actions.openBatchDetail")}
        </Link>
      </div>
      <ul className="mt-4 space-y-2">
        {blockers.map((blocker) => (
          <li
            className="rounded-md border border-amber-200 bg-white px-3 py-2 text-sm text-amber-950"
            key={`${blocker.type}-${blocker.number}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold">
                  {blocker.type === "governed-change"
                    ? t("states.changeBlockedGovernedChange", {
                        number: blocker.number,
                      })
                    : t("states.changeBlockedExecutionRequest", {
                        number: blocker.number,
                      })}
                </p>
                <p className="mt-1 text-xs text-amber-800">{blocker.title}</p>
              </div>
              <Link
                className="inline-flex items-center justify-center rounded-md border border-amber-300 px-2.5 py-1 text-xs font-semibold text-amber-950"
                to={getChangeRequestBlockerDetailPath(blocker)}
              >
                {blocker.type === "governed-change"
                  ? t("states.openBlockingPr")
                  : t("states.openBlockingIssue")}
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </article>
  );
}

function PullRequestReviewPanel({
  batchPath,
  canSubmit,
  deletedScheduleDefinitions,
  definition,
  missingFields,
  mode,
  scheduleDefinitions,
  submissionState,
  uploadedFilePath,
  workflowPath,
}: {
  batchPath: string;
  canSubmit: boolean;
  deletedScheduleDefinitions: ScheduleDefinition[];
  definition: ReturnType<typeof toBatchDefinition>;
  missingFields: string[];
  mode: RegistrationRequestMode;
  scheduleDefinitions: ScheduleDefinition[];
  submissionState: SubmissionState;
  uploadedFilePath: string | null;
  workflowPath: string;
}) {
  const { t } = useTranslation("registration");
  const execution = definition.execution;

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-bp-graphite">
          {t("review.title")}
        </h2>
        <p className="mt-2 text-sm text-bp-muted">
          {t(mode === "change" ? "review.subtitleChange" : "review.subtitle")}
        </p>
      </div>

      <section className="mt-5">
        <h3 className="text-sm font-bold text-bp-graphite">
          {t("review.files.title")}
        </h3>
        <dl className="mt-3 divide-y divide-slate-100 text-sm">
          <ReviewFileRow
            label={t("review.files.batchDefinition")}
            value={batchPath || t("review.files.pending")}
          />
          <ReviewFileRow
            label={t("review.files.workflow")}
            value={workflowPath || t("review.files.pending")}
          />
          <ReviewFileRow
            label={t("review.files.scheduleCount")}
            value={String(scheduleDefinitions.length)}
          />
          <ReviewFileRow
            label={t("review.files.scheduleDeletionCount")}
            value={String(deletedScheduleDefinitions.length)}
          />
          <ReviewFileRow
            label={t("review.files.executionFile")}
            value={uploadedFilePath || t("review.files.noExecutionFile")}
          />
        </dl>
      </section>

      <section className="mt-5">
        <h3 className="text-sm font-bold text-bp-graphite">
          {t("review.checklist.title")}
        </h3>
        <ul className="mt-3 space-y-2 text-sm">
          <ReviewCheckItem
            ready={Boolean(batchPath)}
            text={t("review.checklist.batchDefinitionPath")}
          />
          <ReviewCheckItem
            ready={Boolean(workflowPath)}
            text={t("review.checklist.workflowPath")}
          />
          <ReviewCheckItem
            ready={definition.gateRequired}
            text={t("review.checklist.gateRequired")}
          />
          <ReviewCheckItem
            ready={!missingFields.includes("runnerLabel")}
            text={
              execution?.runsOn
                ? t("review.checklist.runnerSelected", {
                    runner: formatRunnerLabelDisplay(execution.runsOn),
                  })
                : t("review.checklist.runnerMissing")
            }
          />
          <ReviewCheckItem
            ready={!missingFields.includes("runCommand")}
            text={
              missingFields.includes("runCommand")
                ? t("review.checklist.commandMissing")
                : t("review.checklist.commandRecorded")
            }
          />
          <ReviewCheckItem
            ready={
              !missingFields.some((field) => field.startsWith("schedule["))
            }
            text={t("review.checklist.scheduleDefinitionsRecorded", {
              count: scheduleDefinitions.length,
            })}
          />
          <ReviewCheckItem
            ready={deletedScheduleDefinitions.every((schedule) =>
              Boolean(schedule.scheduleId && schedule.definitionPath),
            )}
            text={t("review.checklist.scheduleDeletionsRecorded", {
              count: deletedScheduleDefinitions.length,
            })}
          />
        </ul>
      </section>

      <p className="mt-5 rounded-md bg-slate-50 px-3 py-2 text-xs font-semibold text-bp-muted">
        {t("review.nextStep")}
      </p>

      <button
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-bp-control px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
        disabled={!canSubmit}
        type="submit"
      >
        {submissionState.type === "submitting" ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <GitPullRequest className="h-4 w-4" aria-hidden="true" />
        )}
        {t(
          mode === "change"
            ? "actions.createChangePullRequest"
            : "actions.createPullRequest",
        )}
      </button>
    </article>
  );
}

function ReviewFileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 py-2 first:pt-0 last:pb-0">
      <dt className="text-xs font-semibold uppercase text-bp-muted">{label}</dt>
      <dd className="break-all font-mono text-xs font-semibold text-bp-graphite">
        {value}
      </dd>
    </div>
  );
}

function ReviewCheckItem({ ready, text }: { ready: boolean; text: string }) {
  const Icon = ready ? CheckCircle2 : AlertCircle;

  return (
    <li
      className={`flex items-start gap-2 ${
        ready ? "text-bp-graphite" : "text-amber-800"
      }`}
    >
      <Icon
        className={`mt-0.5 h-4 w-4 shrink-0 ${
          ready ? "text-emerald-700" : "text-amber-700"
        }`}
        aria-hidden="true"
      />
      <span className="font-medium">{text}</span>
    </li>
  );
}

function YamlPreviewPanel({
  batchPath,
  batchYaml,
  workflowPath,
  workflowYaml,
}: {
  batchPath: string;
  batchYaml: string;
  workflowPath: string;
  workflowYaml: string;
}) {
  const { t } = useTranslation("registration");

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-bp-graphite">
        {t("preview.title")}
      </h2>
      <div className="mt-4 divide-y divide-slate-100">
        <PreviewDetails
          icon={<FileText className="h-4 w-4 text-bp-git" aria-hidden />}
          isOpen
          path={batchPath || t("review.files.pending")}
          title={t("preview.batchDefinitionTitle")}
          yaml={batchYaml}
        />
        <PreviewDetails
          icon={<FileCode2 className="h-4 w-4 text-bp-git" aria-hidden />}
          path={workflowPath || t("review.files.pending")}
          title={t("preview.workflowTitle")}
          yaml={workflowYaml}
        />
      </div>
    </article>
  );
}

function ScheduleDefinitionsPanel({
  drafts,
  mode,
  onAdd,
  onRemove,
  onRestore,
  onUpdate,
}: {
  drafts: ScheduleDraft[];
  mode: RegistrationRequestMode;
  onAdd: () => void;
  onRemove: (key: string) => void;
  onRestore: (key: string) => void;
  onUpdate: (
    key: string,
    updater: (values: ScheduleFormValues) => ScheduleFormValues,
  ) => void;
}) {
  const { t } = useTranslation("registration");

  return (
    <article
      className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
      id="schedules"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-bp-graphite">
            {t("form.schedules.title")}
          </h2>
          <p className="mt-1 text-sm text-bp-muted">
            {t(
              mode === "change"
                ? "form.schedules.subtitleChange"
                : "form.schedules.subtitle",
            )}
          </p>
        </div>
        <button
          className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bp-graphite"
          onClick={onAdd}
          type="button"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t("form.schedules.add")}
        </button>
      </div>

      {drafts.length === 0 ? (
        <p className="mt-4 text-sm text-bp-muted">
          {t("form.schedules.empty")}
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {drafts.map((draft, index) => (
            <ScheduleDraftCard
              draft={draft}
              index={index}
              key={draft.key}
              onRemove={onRemove}
              onRestore={onRestore}
              onUpdate={onUpdate}
            />
          ))}
        </div>
      )}
    </article>
  );
}

function ScheduleDraftCard({
  draft,
  index,
  onRemove,
  onRestore,
  onUpdate,
}: {
  draft: ScheduleDraft;
  index: number;
  onRemove: (key: string) => void;
  onRestore: (key: string) => void;
  onUpdate: (
    key: string,
    updater: (values: ScheduleFormValues) => ScheduleFormValues,
  ) => void;
}) {
  const { t } = useTranslation("registration");
  const isDeleted = draft.status === "deleted";
  const preview = useMemo(
    () => getCronPreview(draft.values.cron, draft.values.timezone),
    [draft.values.cron, draft.values.timezone],
  );

  return (
    <section
      className={`rounded-md border p-4 ${
        isDeleted
          ? "border-amber-200 bg-amber-50/70"
          : "border-slate-200 bg-slate-50"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-bp-graphite">
              {t("form.schedules.itemTitle", { index: index + 1 })}
            </h3>
            {isDeleted ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                {t("form.schedules.pendingDeletion")}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-bp-muted">
            {draft.source === "existing"
              ? t("form.schedules.existing")
              : t("form.schedules.new")}
          </p>
        </div>
        {draft.source === "new" ? (
          <button
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bp-graphite"
            onClick={() => onRemove(draft.key)}
            type="button"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {t("form.schedules.remove")}
          </button>
        ) : isDeleted ? (
          <button
            className="inline-flex items-center gap-2 rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-900"
            onClick={() => onRestore(draft.key)}
            type="button"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            {t("form.schedules.restore")}
          </button>
        ) : (
          <button
            className="inline-flex items-center gap-2 rounded-md border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700"
            onClick={() => onRemove(draft.key)}
            type="button"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {t("form.schedules.markDeleted")}
          </button>
        )}
      </div>

      {isDeleted ? (
        <p className="mt-3 text-sm font-medium text-amber-900">
          {t("form.schedules.pendingDeletionHelp")}
        </p>
      ) : null}

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {draft.source === "existing" ? (
          <ReadOnlyField
            label={t("form.schedules.scheduleId")}
            value={draft.values.scheduleId}
          />
        ) : (
          <TextField
            disabled={isDeleted}
            label={t("form.schedules.scheduleId")}
            onChange={(event) =>
              onUpdate(draft.key, (values) => ({
                ...values,
                scheduleId: event.target.value,
              }))
            }
            placeholder="payment.daily-close-daily"
            value={draft.values.scheduleId}
          />
        )}
        <TextField
          disabled={isDeleted}
          label={t("form.schedules.name")}
          onChange={(event) =>
            onUpdate(draft.key, (values) => ({
              ...values,
              name: event.target.value,
            }))
          }
          placeholder="Daily settlement window"
          value={draft.values.name}
        />
        <TextField
          disabled={isDeleted}
          label={t("form.schedules.cron")}
          onChange={(event) =>
            onUpdate(draft.key, (values) => ({
              ...values,
              cron: event.target.value,
            }))
          }
          placeholder="0 5 * * *"
          value={draft.values.cron}
        />
        <TextField
          disabled={isDeleted}
          label={t("form.schedules.timezone")}
          onChange={(event) =>
            onUpdate(draft.key, (values) => ({
              ...values,
              timezone: event.target.value,
            }))
          }
          placeholder="Asia/Seoul"
          value={draft.values.timezone}
        />
        <CheckboxField
          checked={draft.values.enabled}
          disabled={isDeleted}
          label={t("form.schedules.enabled")}
          onChange={(checked) =>
            onUpdate(draft.key, (values) => ({
              ...values,
              enabled: checked,
            }))
          }
        />
      </div>

      {!isDeleted ? (
        <CronPreviewBlock
          invalidLabel={t("form.schedules.cronPreviewInvalid")}
          nextLabel={t("form.schedules.cronPreviewNext")}
          preview={preview}
          title={t("form.schedules.cronPreviewTitle")}
        />
      ) : null}
    </section>
  );
}

function PreviewDetails({
  icon,
  isOpen = false,
  message,
  path,
  title,
  yaml,
}: {
  icon: ReactNode;
  isOpen?: boolean;
  message?: string;
  path: string;
  title: string;
  yaml?: string;
}) {
  return (
    <details className="py-3 first:pt-0 last:pb-0" open={isOpen}>
      <summary className="cursor-pointer list-none">
        <div className="flex items-start gap-2">
          {icon}
          <div>
            <span className="text-sm font-bold text-bp-graphite">{title}</span>
            <p className="mt-1 break-all font-mono text-xs text-bp-muted">
              {path}
            </p>
          </div>
        </div>
      </summary>
      {message ? (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-3 text-sm font-medium text-amber-900">
          {message}
        </p>
      ) : (
        <pre className="mt-3 max-h-80 overflow-auto rounded-md bg-bp-graphite p-4 text-xs leading-6 text-white">
          <code>{yaml}</code>
        </pre>
      )}
    </details>
  );
}

function TextField({
  description,
  disabled = false,
  label,
  onChange,
  placeholder,
  value,
}: {
  description?: string;
  disabled?: boolean;
  label: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <label className="block text-sm font-semibold text-bp-graphite">
      {label}
      <input
        aria-label={label}
        className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal text-bp-graphite outline-none focus:border-bp-git focus:ring-2 focus:ring-bp-git/20"
        disabled={disabled}
        onChange={onChange}
        placeholder={placeholder}
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

function FileUploadField({
  disabled = false,
  filePath,
  label,
  onChange,
}: {
  disabled?: boolean;
  filePath: string | null;
  label: string;
  onChange: (file: File | null) => void;
}) {
  return (
    <label className="mt-5 block text-sm font-semibold text-bp-graphite">
      {label}
      <input
        className="mt-2 block w-full text-sm text-bp-muted file:mr-4 file:rounded-md file:border-0 file:bg-bp-control file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
        type="file"
      />
      {filePath ? (
        <code className="mt-2 block break-all text-xs font-normal text-bp-muted">
          {filePath}
        </code>
      ) : null}
    </label>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="block text-sm font-semibold text-bp-graphite">
      {label}
      <code className="mt-2 block min-h-10 break-all rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal text-bp-graphite">
        {value}
      </code>
    </div>
  );
}

function TextAreaField({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <label className="mt-5 block text-sm font-semibold text-bp-graphite">
      {label}
      <textarea
        className="mt-2 min-h-36 w-full resize-y rounded-md border border-slate-300 px-3 py-2 font-mono text-sm font-normal text-bp-graphite outline-none focus:border-bp-git focus:ring-2 focus:ring-bp-git/20"
        onChange={onChange}
        placeholder={placeholder}
        spellCheck={false}
        value={value}
      />
    </label>
  );
}

function SelectField({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  options: string[];
  value: string;
}) {
  return (
    <label className="block text-sm font-semibold text-bp-graphite">
      {label}
      <select
        className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-bp-graphite outline-none focus:border-bp-git focus:ring-2 focus:ring-bp-git/20"
        onChange={onChange}
        value={value}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function CheckboxField({
  checked,
  disabled = false,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-10 items-center gap-3 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bp-graphite">
      <input
        checked={checked}
        className="h-4 w-4 rounded border-slate-300 text-bp-control"
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <span>{label}</span>
    </label>
  );
}

function SubmissionBanner({
  mode,
  state,
}: {
  mode: RegistrationRequestMode;
  state: SubmissionState;
}) {
  const { t } = useTranslation("registration");

  if (state.type === "success") {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        <p className="font-semibold">
          {t(mode === "change" ? "result.changeSuccess" : "result.success")}
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <a
            className="inline-flex font-semibold underline"
            href={state.pullRequest.url}
            rel="noreferrer"
            target="_blank"
          >
            #{state.pullRequest.number} {state.pullRequest.title}
          </a>
          <Link className="font-semibold underline" to="/approvals">
            {t("actions.openApprovals")}
          </Link>
        </div>
      </div>
    );
  }

  if (state.type === "error") {
    return (
      <div className="flex gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="font-semibold">{state.message}</p>
      </div>
    );
  }

  return null;
}

function formatRegistrationError(error: unknown, fallback: string): string {
  return formatRuntimeError(error, fallback);
}

async function handleExecutionFileChange({
  file,
  onError,
  onLoaded,
}: {
  file: File | null;
  onError: () => void;
  onLoaded: (file: UploadedExecutionFile) => void;
}) {
  if (!file) {
    return;
  }

  try {
    const contentBase64 = arrayBufferToBase64(await file.arrayBuffer());
    onLoaded({ contentBase64, name: file.name });
  } catch {
    onError();
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

function buildExecutionFileCommand(path: string): string {
  return `chmod +x ${path}\n./${path}`;
}

function formatRunnerLabelDisplay(runsOn: RunnerLabel): string {
  return Array.isArray(runsOn) ? runsOn.join(", ") : runsOn;
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
  const { i18n, t } = useTranslation("registration");
  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language || undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [i18n.language],
  );

  return (
    <div className="mt-4 rounded-md border border-slate-200 bg-white px-3 py-3 text-sm">
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
          {invalidLabel}:{" "}
          {t(`form.schedules.cronPreviewErrors.${preview.errorCode}`)}
        </p>
      )}
    </div>
  );
}

function nextScheduleDraftKey(): string {
  scheduleDraftSequence += 1;

  return `schedule-draft-${scheduleDraftSequence}`;
}
