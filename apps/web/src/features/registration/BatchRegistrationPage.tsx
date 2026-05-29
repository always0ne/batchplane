import type {
  BatchDefinition,
  BatchStatus,
  Criticality,
  RepositoryPullRequest,
  RunnerLabel,
} from "@batchplane/domain";
import {
  AlertCircle,
  CheckCircle2,
  FileCode2,
  FileText,
  GitPullRequest,
  Loader2,
  ShieldCheck,
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

import {
  buildRegistrationApprovalHandoff,
  saveRegistrationApprovalHandoff,
} from "../approvals/approval-handoff";
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

type SubmissionState =
  | { type: "idle" }
  | { type: "submitting" }
  | { type: "success"; pullRequest: RepositoryPullRequest }
  | { type: "error"; message: string };

type UploadedExecutionFile = {
  contentBase64: string;
  name: string;
};

type PrefillState =
  | { type: "ready" }
  | { type: "loading" }
  | { type: "no-session" }
  | { type: "not-found"; batchId: string }
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

export function BatchRegistrationPage() {
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
  const [uploadedFile, setUploadedFile] =
    useState<UploadedExecutionFile | null>(null);
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
  const definition = useMemo(
    () => toBatchDefinition(values, { artifactPath: resolvedArtifactPath }),
    [resolvedArtifactPath, values],
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
  const missingFields = useMemo(() => {
    const fields = validateBatchRegistration(definition);

    if (!values.runCommand.trim()) {
      fields.push("runCommand");
    }

    if (!values.runnerLabel.trim()) {
      fields.push("runnerLabel");
    }

    return fields;
  }, [definition, values.runCommand, values.runnerLabel]);
  const batchPath = getBatchDefinitionPath(definition.batchId);
  const workflowPath = definition.workflow.path;
  const nextAutoFileCommand = resolvedArtifactPath
    ? buildExecutionFileCommand(resolvedArtifactPath)
    : null;
  const selectedRunner = runnerOptions.includes(
    values.runnerLabel as (typeof runnerOptions)[number],
  )
    ? values.runnerLabel
    : "custom";
  const canSubmit =
    missingFields.length === 0 &&
    generatedWorkflowYaml.trim().length > 0 &&
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
    if (mode === "change") {
      return;
    }

    setPrefillState({ type: "ready" });
    setExistingArtifactPath(null);
    setUploadedFile(null);
    setAutoFileCommand(null);
    setValues(defaultBatchRegistrationValues);
  }, [mode]);

  useEffect(() => {
    if (mode !== "change") {
      return;
    }

    let ignoreResult = false;

    async function loadChangeTarget() {
      const session = readRuntimeSession();

      if (!session) {
        if (!ignoreResult) {
          setPrefillState({ type: "no-session" });
        }
        return;
      }

      setPrefillState({ type: "loading" });

      try {
        const runtime = createBatchPlaneRuntime(session);
        const repository = await runtime.settings.getRepository();
        const batches = await runtime.batches.listBatchDefinitions({
          ref: repository.defaultBranch,
        });
        const batch = batches.find(
          (candidate) => candidate.batchId === changeBatchId,
        );

        if (!batch) {
          if (!ignoreResult) {
            setPrefillState({ type: "not-found", batchId: changeBatchId });
          }
          return;
        }

        if (!ignoreResult) {
          applyPrefill(batch);
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
  }, [changeBatchId, mode, t]);

  function applyPrefill(batch: BatchDefinition) {
    setValues(toBatchRegistrationFormValues(batch));
    setExistingArtifactPath(batch.execution?.artifactPath ?? null);
    setUploadedFile(null);
    setAutoFileCommand(null);
    setSubmissionState({ type: "idle" });
    setPrefillState({ type: "ready" });
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

    const session = readRuntimeSession();

    if (!session) {
      setSubmissionState({
        type: "error",
        message: t("errors.noSession"),
      });
      return;
    }

    setSubmissionState({ type: "submitting" });

    try {
      const runtime = createBatchPlaneRuntime(session);
      const repository = await runtime.settings.getRepository();
      const registrationTargets =
        await runtime.registration.checkRegistrationTargets({
          baseBranch: repository.defaultBranch,
          batchDefinitionPath: batchPath,
          workflowPath,
        });

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
          body: buildRegistrationPullRequestBody(definition, mode),
          branch,
          title,
          workflowPath,
          workflowYaml: generatedWorkflowYaml,
        });

      saveRegistrationApprovalHandoff(pullRequest);
      setSubmissionState({ type: "success", pullRequest });
      navigate("/approvals", {
        state: buildRegistrationApprovalHandoff(pullRequest),
      });
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

          <SubmissionBanner mode={mode} state={submissionState} />
        </div>

        <aside className="space-y-4">
          <PullRequestReviewPanel
            batchPath={batchPath}
            canSubmit={canSubmit}
            definition={definition}
            missingFields={missingFields}
            mode={mode}
            submissionState={submissionState}
            uploadedFilePath={resolvedArtifactPath}
            workflowPath={workflowPath}
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

function PullRequestReviewPanel({
  batchPath,
  canSubmit,
  definition,
  missingFields,
  mode,
  submissionState,
  uploadedFilePath,
  workflowPath,
}: {
  batchPath: string;
  canSubmit: boolean;
  definition: ReturnType<typeof toBatchDefinition>;
  missingFields: string[];
  mode: RegistrationRequestMode;
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

function PreviewDetails({
  icon,
  isOpen = false,
  path,
  title,
  yaml,
}: {
  icon: ReactNode;
  isOpen?: boolean;
  path: string;
  title: string;
  yaml: string;
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
      <pre className="mt-3 max-h-80 overflow-auto rounded-md bg-bp-graphite p-4 text-xs leading-6 text-white">
        <code>{yaml}</code>
      </pre>
    </details>
  );
}

function TextField({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <label className="block text-sm font-semibold text-bp-graphite">
      {label}
      <input
        className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal text-bp-graphite outline-none focus:border-bp-git focus:ring-2 focus:ring-bp-git/20"
        onChange={onChange}
        placeholder={placeholder}
        value={value}
      />
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
