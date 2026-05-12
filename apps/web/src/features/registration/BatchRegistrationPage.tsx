import {
  createGitHubLiteClient,
  GitHubLiteApiError,
  type GitHubPullRequest,
} from "@batchtrail/github-lite";
import type { BatchStatus, Criticality } from "@batchtrail/domain";
import {
  AlertCircle,
  FileCode2,
  FileText,
  GitPullRequest,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { type ChangeEvent, type FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { readGitHubSession } from "../lite-setup/github-session";
import { PageHeader } from "../../shared/components/PageHeader";
import {
  buildBatchWorkflowYaml,
  buildRegistrationPullRequestBody,
  buildRegistrationPullRequestTitle,
  createRegistrationBranchName,
  defaultBatchRegistrationValues,
  getBatchDefinitionPath,
  serializeBatchDefinitionYaml,
  toBatchDefinition,
  validateBatchRegistration,
  type BatchRegistrationFormValues,
} from "./registration-model";

type SubmissionState =
  | { type: "idle" }
  | { type: "submitting" }
  | { type: "success"; pullRequest: GitHubPullRequest }
  | { type: "error"; message: string };

const criticalityOptions: Criticality[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const statusOptions: BatchStatus[] = ["ACTIVE", "INACTIVE"];

export function BatchRegistrationPage() {
  const { t } = useTranslation("registration");
  const [values, setValues] = useState<BatchRegistrationFormValues>(
    defaultBatchRegistrationValues,
  );
  const [submissionState, setSubmissionState] = useState<SubmissionState>({
    type: "idle",
  });

  const definition = useMemo(() => toBatchDefinition(values), [values]);
  const yaml = useMemo(
    () => serializeBatchDefinitionYaml(definition),
    [definition],
  );
  const generatedWorkflowYaml = useMemo(
    () => buildBatchWorkflowYaml(definition),
    [definition],
  );
  const missingFields = useMemo(
    () => validateBatchRegistration(definition),
    [definition],
  );
  const batchPath = getBatchDefinitionPath(definition.batchId || "new-batch");
  const workflowPath = definition.workflow.path;
  const canSubmit =
    missingFields.length === 0 &&
    generatedWorkflowYaml.trim().length > 0 &&
    submissionState.type !== "submitting";

  function updateTextField(
    field: keyof Omit<BatchRegistrationFormValues, "criticality" | "status">,
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

    const session = readGitHubSession();

    if (!session) {
      setSubmissionState({
        type: "error",
        message: t("errors.noSession"),
      });
      return;
    }

    setSubmissionState({ type: "submitting" });

    try {
      const client = createGitHubLiteClient({ token: session.token });
      const repository = await client.getRepository(session);
      const [existingFile, existingWorkflowFile] = await Promise.all([
        client.getFile({
          ...session,
          path: batchPath,
          ref: repository.defaultBranch,
        }),
        client.getFile({
          ...session,
          path: workflowPath,
          ref: repository.defaultBranch,
        }),
      ]);

      if (existingFile) {
        setSubmissionState({
          type: "error",
          message: t("errors.alreadyExists", { path: batchPath }),
        });
        return;
      }

      if (existingWorkflowFile) {
        setSubmissionState({
          type: "error",
          message: t("errors.workflowAlreadyExists", { path: workflowPath }),
        });
        return;
      }

      const baseSha = await client.getBranchHeadSha({
        ...session,
        branch: repository.defaultBranch,
      });
      const branch = createRegistrationBranchName(definition.batchId);

      await client.createBranch({ ...session, branch, sha: baseSha });
      await client.putFile({
        ...session,
        branch,
        path: batchPath,
        message: buildRegistrationPullRequestTitle(definition),
        content: yaml,
      });
      await client.putFile({
        ...session,
        branch,
        path: workflowPath,
        message: buildRegistrationPullRequestTitle(definition),
        content: generatedWorkflowYaml,
      });
      const pullRequest = await client.createPullRequest({
        ...session,
        title: buildRegistrationPullRequestTitle(definition),
        body: buildRegistrationPullRequestBody(definition),
        head: branch,
        base: repository.defaultBranch,
      });

      setSubmissionState({ type: "success", pullRequest });
    } catch (error) {
      setSubmissionState({
        type: "error",
        message: formatRegistrationError(error, t("errors.unknown")),
      });
    }
  }

  return (
    <section>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <form
        className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_28rem]"
        onSubmit={(event) => void createRegistrationPullRequest(event)}
      >
        <div className="space-y-4">
          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-bt-graphite">
              {t("form.definition")}
            </h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <TextField
                label={t("form.batchId")}
                onChange={updateTextField("batchId")}
                placeholder="payment.daily-close"
                value={values.batchId}
              />
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
            <h2 className="text-lg font-semibold text-bt-graphite">
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
            </div>
            <div className="mt-5 flex gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <ShieldCheck
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              <div>
                <p className="font-semibold">{t("form.gateRequired")}</p>
                <p className="mt-1 text-emerald-800">
                  {t("form.gateRequiredDescription")}
                </p>
              </div>
            </div>
          </article>

          <SubmissionBanner state={submissionState} />
        </div>

        <aside className="space-y-4">
          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-bt-graphite">
                  {t("preview.title")}
                </h2>
                <p className="mt-2 break-all text-sm text-bt-muted">
                  {batchPath}
                </p>
              </div>
              <FileText className="h-5 w-5 text-bt-git" aria-hidden="true" />
            </div>
            <pre className="mt-5 max-h-[32rem] overflow-auto rounded-md bg-bt-graphite p-4 text-xs leading-6 text-white">
              <code>{yaml}</code>
            </pre>
          </article>

          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-bt-graphite">
                  {t("preview.workflowTitle")}
                </h2>
                <p className="mt-2 break-all text-sm text-bt-muted">
                  {workflowPath}
                </p>
              </div>
              <FileCode2 className="h-5 w-5 text-bt-git" aria-hidden="true" />
            </div>
            <pre className="mt-5 max-h-[32rem] overflow-auto rounded-md bg-bt-graphite p-4 text-xs leading-6 text-white">
              <code>{generatedWorkflowYaml}</code>
            </pre>
          </article>

          <button
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-bt-control px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={!canSubmit}
            type="submit"
          >
            {submissionState.type === "submitting" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <GitPullRequest className="h-4 w-4" aria-hidden="true" />
            )}
            {t("actions.createPullRequest")}
          </button>
        </aside>
      </form>
    </section>
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
    <label className="block text-sm font-semibold text-bt-graphite">
      {label}
      <input
        className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal text-bt-graphite outline-none focus:border-bt-git focus:ring-2 focus:ring-bt-git/20"
        onChange={onChange}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="block text-sm font-semibold text-bt-graphite">
      {label}
      <code className="mt-2 block min-h-10 break-all rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal text-bt-graphite">
        {value}
      </code>
    </div>
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
    <label className="block text-sm font-semibold text-bt-graphite">
      {label}
      <select
        className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-bt-graphite outline-none focus:border-bt-git focus:ring-2 focus:ring-bt-git/20"
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

function SubmissionBanner({ state }: { state: SubmissionState }) {
  const { t } = useTranslation("registration");

  if (state.type === "success") {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        <p className="font-semibold">{t("result.success")}</p>
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
  if (error instanceof GitHubLiteApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}
