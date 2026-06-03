import type {
  BatchDefinition,
  BatchPlaneRuntimePorts,
  RepositoryIssue,
} from "@batchplane/domain";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Plus,
  Send,
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
import { Link, useNavigate, useParams } from "react-router-dom";
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
  addHours,
  buildExecutionRequestIssue,
  createExecutionRequestId,
  type ExecutionRequestIssue,
  type ExecutionRequestParameterInput,
} from "./execution-request-model";

type ExecutionRequestPageProps = {
  createRuntime?: (session: GitHubSession) => BatchPlaneRuntimePorts;
  readSession?: () => GitHubSession | null;
};

type PageState =
  | { type: "loading" }
  | { type: "no-session" }
  | { type: "not-found"; batchId: string }
  | {
      type: "loaded";
      batch: BatchDefinition;
      login: string;
      session: GitHubSession;
    }
  | { type: "error"; message: string };

type ParameterRow = ExecutionRequestParameterInput & {
  id: string;
};

type FormValues = {
  expiresInHours: string;
  parameters: ParameterRow[];
  reason: string;
  workflowRef: string;
};

type RequestDraft = {
  batchId: string;
  requestId: string;
  requestedAt: Date;
};

type PreviewState =
  | { type: "idle" }
  | { type: "loading" }
  | { type: "ready"; issue: ExecutionRequestIssue }
  | { type: "error"; message: string };

type SubmitState =
  | { type: "idle" }
  | { type: "submitting" }
  | { type: "success"; issue: RepositoryIssue }
  | { type: "error"; message: string };

const expiryOptions = ["1", "4", "8", "24"] as const;

export function ExecutionRequestPage({
  createRuntime = createBatchPlaneRuntime,
  readSession = readRuntimeSession,
}: ExecutionRequestPageProps = {}) {
  const { batchId = "" } = useParams();
  const decodedBatchId = decodeURIComponent(batchId);
  const { t } = useTranslation("executionRequests");
  const navigate = useNavigate();
  const [state, setState] = useState<PageState>({ type: "loading" });
  const [draft, setDraft] = useState<RequestDraft | null>(null);
  const [formValues, setFormValues] = useState<FormValues>({
    expiresInHours: "1",
    parameters: [],
    reason: t("form.defaultReason"),
    workflowRef: "main",
  });
  const [previewState, setPreviewState] = useState<PreviewState>({
    type: "idle",
  });
  const [submitState, setSubmitState] = useState<SubmitState>({
    type: "idle",
  });

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
        const [batches, user] = await Promise.all([
          runtime.batches.listBatchDefinitions({
            ref: repository.defaultBranch,
          }),
          runtime.settings.getCurrentUser(),
        ]);
        const batch = batches.find(
          (candidate) => candidate.batchId === decodedBatchId,
        );

        if (ignoreResult) {
          return;
        }

        if (!batch) {
          setState({ type: "not-found", batchId: decodedBatchId });
          return;
        }

        setState({
          type: "loaded",
          batch,
          login: user.login,
          session,
        });
      } catch (error) {
        if (!ignoreResult) {
          setState({
            type: "error",
            message: formatRuntimeError(error, t("states.error")),
          });
        }
      }
    }

    void loadBatch();

    return () => {
      ignoreResult = true;
    };
  }, [createRuntime, decodedBatchId, readSession, t]);

  useEffect(() => {
    if (state.type !== "loaded" || draft?.batchId === state.batch.batchId) {
      return;
    }

    const requestedAt = new Date();
    setDraft({
      batchId: state.batch.batchId,
      requestedAt,
      requestId: createExecutionRequestId(state.batch.batchId, requestedAt),
    });
    setFormValues({
      expiresInHours: "1",
      parameters: [],
      reason: t("form.defaultReason"),
      workflowRef: state.batch.workflow.ref,
    });
    setSubmitState({ type: "idle" });
  }, [draft?.batchId, state, t]);

  const validationErrors = useMemo(
    () =>
      state.type === "loaded"
        ? validateRequest(formValues, state.batch, t)
        : validateForm(formValues, t),
    [formValues, state, t],
  );

  useEffect(() => {
    let ignoreResult = false;

    async function updatePreview() {
      if (state.type !== "loaded" || !draft || validationErrors.length > 0) {
        setPreviewState({ type: "idle" });
        return;
      }

      setPreviewState({ type: "loading" });

      try {
        const issue = await buildExecutionRequestIssue({
          batch: state.batch,
          expiresAt: addHours(
            draft.requestedAt,
            Number(formValues.expiresInHours),
          ),
          parameters: formValues.parameters,
          reason: formValues.reason,
          requestedAt: draft.requestedAt,
          requestedBy: state.login,
          requestId: draft.requestId,
          workflowRef: formValues.workflowRef,
        });

        if (!ignoreResult) {
          setPreviewState({ type: "ready", issue });
        }
      } catch (error) {
        if (!ignoreResult) {
          setPreviewState({
            type: "error",
            message: formatRuntimeError(error, t("states.previewError")),
          });
        }
      }
    }

    void updatePreview();

    return () => {
      ignoreResult = true;
    };
  }, [draft, formValues, state, t, validationErrors]);

  async function submitExecutionRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (state.type !== "loaded" || previewState.type !== "ready") {
      setSubmitState({ type: "error", message: t("states.completeForm") });
      return;
    }

    setSubmitState({ type: "submitting" });

    try {
      const runtime = createRuntime(state.session);
      const issue = await runtime.executions.createExecutionRequest({
        body: previewState.issue.body,
        labels: previewState.issue.labels,
        title: previewState.issue.title,
      });

      setSubmitState({ type: "success", issue });
      navigate(`/execution-requests/${issue.number}`);
    } catch (error) {
      setSubmitState({
        type: "error",
        message: formatRuntimeError(error, t("states.submitError")),
      });
    }
  }

  if (state.type === "loading") {
    return <LoadingState message={t("states.loading")} />;
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
        message={t("states.notFound", { batchId: state.batchId })}
      />
    );
  }

  if (state.type === "error") {
    return <ErrorState message={state.message} />;
  }

  if (!draft || draft.batchId !== state.batch.batchId) {
    return <LoadingState message={t("states.loading")} />;
  }

  const canSubmit =
    previewState.type === "ready" && submitState.type !== "submitting";

  return (
    <section>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle", { batchId: state.batch.batchId })}
      />
      <form
        className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_28rem]"
        onSubmit={(event) => void submitExecutionRequest(event)}
      >
        <div className="space-y-4">
          <BatchRequestContext batch={state.batch} />
          <RequestForm
            formValues={formValues}
            onChange={setFormValues}
            submitState={submitState}
            validationErrors={validationErrors}
          />
        </div>
        <RequestReviewPanel
          batch={state.batch}
          canSubmit={canSubmit}
          previewState={previewState}
          submitState={submitState}
        />
      </form>
    </section>
  );
}

function BatchRequestContext({ batch }: { batch: BatchDefinition }) {
  const { t } = useTranslation("executionRequests");

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-bp-graphite">
            {batch.name}
          </h2>
          <p className="mt-1 font-mono text-sm text-bp-muted">
            {batch.batchId}
          </p>
        </div>
        <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-800">
          {t("context.governed")}
        </span>
      </div>

      <dl className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Fact label={t("context.owner")} value={batch.owner} />
        <Fact label={t("context.domain")} value={batch.domain} />
        <Fact label={t("context.environment")} value={batch.environment} />
        <Fact label={t("context.workflowPath")} value={batch.workflow.path} />
        <Fact
          label={t("context.runsOn")}
          value={formatRunnerLabel(batch.execution?.runsOn ?? "")}
        />
        <Fact
          label={t("context.command")}
          value={batch.execution?.command || t("context.missingCommand")}
        />
      </dl>
    </article>
  );
}

function RequestForm({
  formValues,
  onChange,
  submitState,
  validationErrors,
}: {
  formValues: FormValues;
  onChange: (values: FormValues) => void;
  submitState: SubmitState;
  validationErrors: string[];
}) {
  const { t } = useTranslation("executionRequests");

  function updateField(field: keyof Omit<FormValues, "parameters">) {
    return (
      event: ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >,
    ) => {
      onChange({ ...formValues, [field]: event.target.value });
    };
  }

  function addParameter() {
    onChange({
      ...formValues,
      parameters: [
        ...formValues.parameters,
        {
          id: createParameterRowId(),
          name: "",
          sensitive: false,
          value: "",
        },
      ],
    });
  }

  function updateParameter(
    id: string,
    patch: Partial<Omit<ParameterRow, "id">>,
  ) {
    onChange({
      ...formValues,
      parameters: formValues.parameters.map((parameter) =>
        parameter.id === id ? { ...parameter, ...patch } : parameter,
      ),
    });
  }

  function removeParameter(id: string) {
    onChange({
      ...formValues,
      parameters: formValues.parameters.filter(
        (parameter) => parameter.id !== id,
      ),
    });
  }

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-bp-graphite">
        {t("form.title")}
      </h2>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Field label={t("form.workflowRef")}>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-bp-graphite outline-none focus:border-bp-git focus:ring-2 focus:ring-bp-git/20"
            onChange={updateField("workflowRef")}
            value={formValues.workflowRef}
          />
        </Field>
        <Field label={t("form.expiresIn")}>
          <select
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-bp-graphite outline-none focus:border-bp-git focus:ring-2 focus:ring-bp-git/20"
            onChange={updateField("expiresInHours")}
            value={formValues.expiresInHours}
          >
            {expiryOptions.map((hours) => (
              <option key={hours} value={hours}>
                {t("form.expiresInOption", { hours })}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field className="mt-4" label={t("form.reason")}>
        <textarea
          className="min-h-28 w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm text-bp-graphite outline-none focus:border-bp-git focus:ring-2 focus:ring-bp-git/20"
          onChange={updateField("reason")}
          value={formValues.reason}
        />
      </Field>

      <section className="mt-5 border-t border-slate-100 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-bp-graphite">
            {t("parameters.title")}
          </h3>
          <button
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-bp-graphite"
            onClick={addParameter}
            type="button"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("parameters.add")}
          </button>
        </div>
        <p className="mt-2 text-sm text-bp-muted">
          {t("parameters.sensitiveHint")}
        </p>

        {formValues.parameters.length === 0 ? (
          <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold text-bp-muted">
            {t("parameters.empty")}
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {formValues.parameters.map((parameter) => (
              <div
                className="grid gap-3 rounded-md border border-slate-200 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto_auto]"
                key={parameter.id}
              >
                <Field label={t("parameters.name")}>
                  <input
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-bp-graphite outline-none focus:border-bp-git focus:ring-2 focus:ring-bp-git/20"
                    onChange={(event) =>
                      updateParameter(parameter.id, {
                        name: event.target.value,
                      })
                    }
                    value={parameter.name}
                  />
                </Field>
                <Field label={t("parameters.value")}>
                  <input
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-bp-graphite outline-none focus:border-bp-git focus:ring-2 focus:ring-bp-git/20"
                    onChange={(event) =>
                      updateParameter(parameter.id, {
                        value: event.target.value,
                      })
                    }
                    type={parameter.sensitive ? "password" : "text"}
                    value={parameter.value}
                  />
                </Field>
                <label className="flex items-center gap-2 self-end py-2 text-sm font-semibold text-bp-graphite">
                  <input
                    checked={parameter.sensitive}
                    className="h-4 w-4 accent-bp-control"
                    onChange={(event) =>
                      updateParameter(parameter.id, {
                        sensitive: event.target.checked,
                      })
                    }
                    type="checkbox"
                  />
                  {t("parameters.sensitive")}
                </label>
                <button
                  aria-label={t("parameters.remove")}
                  className="inline-flex h-10 w-10 items-center justify-center self-end rounded-md border border-slate-300 text-bp-muted"
                  onClick={() => removeParameter(parameter.id)}
                  type="button"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {validationErrors.length > 0 ? (
        <ul className="mt-4 space-y-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
          {validationErrors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
      <SubmitMessage state={submitState} />
    </article>
  );
}

function RequestReviewPanel({
  batch,
  canSubmit,
  previewState,
  submitState,
}: {
  batch: BatchDefinition;
  canSubmit: boolean;
  previewState: PreviewState;
  submitState: SubmitState;
}) {
  const { t } = useTranslation("executionRequests");
  const previewIssue =
    previewState.type === "ready" ? previewState.issue : null;

  return (
    <aside className="space-y-4">
      <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-bp-graphite">
          {t("review.title")}
        </h2>
        <div className="mt-4 flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          {t("review.gateRequired")}
        </div>

        <dl className="mt-5 space-y-3 text-sm">
          <ReviewFact
            label={t("review.workflow")}
            value={batch.workflow.path}
          />
          <ReviewFact
            label={t("review.runner")}
            value={formatRunnerLabel(batch.execution?.runsOn ?? "")}
          />
          <ReviewFact
            label={t("review.requestId")}
            value={previewIssue?.request.requestId ?? t("review.pending")}
          />
          <ReviewFact
            label={t("review.expiresAt")}
            value={previewIssue?.request.expiresAt ?? t("review.pending")}
          />
          <ReviewFact
            label={t("review.digest")}
            value={previewIssue?.request.requestDigest ?? t("review.pending")}
          />
        </dl>

        <ul className="mt-5 space-y-2 text-sm">
          <CheckItem
            ready={Boolean(batch.execution?.command.trim())}
            text={t("review.commandReady")}
          />
          <CheckItem
            ready={previewIssue !== null}
            text={t("review.digestReady")}
          />
          <CheckItem ready text={t("review.noDispatch")} />
        </ul>

        <p className="mt-5 rounded-md bg-slate-50 px-3 py-2 text-xs font-semibold text-bp-muted">
          {t("review.nextStep")}
        </p>

        <button
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-bp-control px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          disabled={!canSubmit}
          type="submit"
        >
          {submitState.type === "submitting" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="h-4 w-4" aria-hidden="true" />
          )}
          {t("actions.createRequest")}
        </button>
      </article>

      <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-bp-graphite">
          {t("payload.title")}
        </h2>
        {previewState.type === "loading" ? (
          <p className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-bp-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            {t("payload.loading")}
          </p>
        ) : null}
        {previewState.type === "error" ? (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
            {previewState.message}
          </p>
        ) : null}
        {previewIssue ? (
          <pre className="mt-4 max-h-96 overflow-auto rounded-md bg-bp-graphite p-4 text-xs leading-6 text-white">
            <code>{JSON.stringify(previewIssue.payload, null, 2)}</code>
          </pre>
        ) : null}
        {previewState.type === "idle" ? (
          <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold text-bp-muted">
            {t("payload.idle")}
          </p>
        ) : null}
      </article>
    </aside>
  );
}

function Field({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <label
      className={`block text-sm font-semibold text-bp-graphite ${className ?? ""}`}
    >
      {label}
      <div className="mt-2">{children}</div>
    </label>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-bp-muted">{label}</dt>
      <dd className="mt-1 break-words text-sm font-bold text-bp-graphite">
        {value}
      </dd>
    </div>
  );
}

function ReviewFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-bp-muted">{label}</dt>
      <dd className="mt-1 break-all font-mono text-xs font-semibold text-bp-graphite">
        {value}
      </dd>
    </div>
  );
}

function CheckItem({ ready, text }: { ready: boolean; text: string }) {
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

function SubmitMessage({ state }: { state: SubmitState }) {
  const { t } = useTranslation("executionRequests");

  if (state.type === "success") {
    return (
      <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
        {t("states.created")}
      </p>
    );
  }

  if (state.type === "error") {
    return (
      <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
        {state.message}
      </p>
    );
  }

  return null;
}

function validateForm(
  values: FormValues,
  t: (key: string) => string,
): string[] {
  const errors: string[] = [];

  if (!values.workflowRef.trim()) {
    errors.push(t("validation.workflowRef"));
  }

  if (!values.reason.trim()) {
    errors.push(t("validation.reason"));
  }

  if (
    !Number.isFinite(Number(values.expiresInHours)) ||
    Number(values.expiresInHours) <= 0
  ) {
    errors.push(t("validation.expiresIn"));
  }

  values.parameters.forEach((parameter) => {
    if (!parameter.name.trim() && parameter.value.trim()) {
      errors.push(t("validation.parameterName"));
    }
  });

  return errors;
}

function validateRequest(
  values: FormValues,
  batch: BatchDefinition,
  t: (key: string) => string,
): string[] {
  const errors = validateForm(values, t);

  if (batch.status !== "ACTIVE") {
    errors.push(t("validation.inactive"));
  }

  if (!batch.gateRequired) {
    errors.push(t("validation.gateRequired"));
  }

  if (!batch.execution?.command.trim()) {
    errors.push(t("validation.missingCommand"));
  }

  return errors;
}

function formatRunnerLabel(
  runsOn: NonNullable<BatchDefinition["execution"]>["runsOn"] | "",
) {
  return Array.isArray(runsOn) ? runsOn.join(", ") : runsOn || "-";
}

function createParameterRowId(): string {
  return `parameter-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
