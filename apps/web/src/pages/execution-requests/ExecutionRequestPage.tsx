import type {
  ExecutionRequestDraft,
  ExecutionRequestParameter,
} from "@batchplane/ui-client";
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
  useMemo,
  useState,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { PageHeader } from "../../ui/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "../../ui/PageState";
import { useExecutionRequestDraft } from "./useExecutionRequestDraft";
import { useExecutionRequestPreview } from "./useExecutionRequestPreview";
import { useExecutionRequestSubmission } from "./useExecutionRequestSubmission";

type ParameterRow = ExecutionRequestParameter & {
  id: string;
};

type FormValues = {
  expiresInHours: string;
  parameters: ParameterRow[];
  reason: string;
  workflowRef: string;
};

const expiryOptions = ["1", "4", "8", "24"] as const;

export function ExecutionRequestPage() {
  const { batchId = "" } = useParams();
  const decodedBatchId = decodeURIComponent(batchId);
  const { t } = useTranslation("executionRequests");
  const draftState = useExecutionRequestDraft(decodedBatchId);

  if (draftState.type === "loading") {
    return <LoadingState message={t("states.loading")} />;
  }

  if (draftState.type === "workspace-not-connected") {
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

  if (draftState.type === "not-found") {
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
        message={t("states.notFound", { batchId: decodedBatchId })}
      />
    );
  }

  if (draftState.type === "error") {
    return <ErrorState message={draftState.message || t("states.error")} />;
  }

  return (
    <ExecutionRequestFormSession
      key={draftState.draft.requestId}
      draft={draftState.draft}
    />
  );
}

function ExecutionRequestFormSession({
  draft,
}: {
  draft: ExecutionRequestDraft;
}) {
  const { t } = useTranslation("executionRequests");
  const navigate = useNavigate();
  const [formValues, setFormValues] = useState<FormValues>({
    expiresInHours: "1",
    parameters: [],
    reason: t("form.defaultReason"),
    workflowRef: draft.batch.workflowRef,
  });
  const validationErrors = useMemo(
    () => [
      ...draft.creationCapability.unavailableReasons.map((reason) =>
        t(`validation.readiness.${reason}`),
      ),
      ...validateForm(formValues, t),
    ],
    [draft.creationCapability.unavailableReasons, formValues, t],
  );
  const input = useMemo(
    () => ({
      draft,
      expiresAt: addHours(draft.requestedAt, Number(formValues.expiresInHours)),
      parameters: formValues.parameters.map(({ name, sensitive, value }) => ({
        name,
        sensitive,
        value,
      })),
      reason: formValues.reason,
      workflowRef: formValues.workflowRef,
    }),
    [draft, formValues],
  );
  const previewState = useExecutionRequestPreview({
    input,
    isReady:
      draft.creationCapability.canCreate && validationErrors.length === 0,
  });
  const { state: submitState, submit } = useExecutionRequestSubmission(
    draft.requestId,
  );

  async function submitExecutionRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (previewState.type !== "ready") return;
    const result = await submit(input);
    if (!result) return;
    navigate(
      `/execution-requests/${encodeURIComponent(result.request.requestLocator)}`,
      {
        state: {
          createdExecutionRequest: result.request,
          ...(result.postCreateError
            ? {
                executionRequestPostCreateError: {
                  code: result.postCreateError.code,
                  requestDigest: result.request.evidence.requestDigest,
                  requestId: result.request.requestId,
                  requestLocator: result.request.requestLocator,
                },
              }
            : {}),
        },
      },
    );
  }

  const canSubmit =
    previewState.type === "ready" && submitState.type !== "submitting";

  return (
    <section>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle", { batchId: draft.batch.batchId })}
      />
      <form
        className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_28rem]"
        onSubmit={(event) => void submitExecutionRequest(event)}
      >
        <div className="min-w-0 space-y-4">
          <BatchRequestContext batch={draft.batch} />
          <RequestForm
            formValues={formValues}
            onChange={setFormValues}
            submitState={submitState}
            validationErrors={validationErrors}
          />
        </div>
        <RequestReviewPanel
          batch={draft.batch}
          canSubmit={canSubmit}
          previewState={previewState}
          submitState={submitState}
          workspaceApprovalMode={draft.workspaceApprovalMode}
        />
      </form>
    </section>
  );
}

function BatchRequestContext({
  batch,
}: {
  batch: ExecutionRequestDraft["batch"];
}) {
  const { t } = useTranslation("executionRequests");

  return (
    <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-bp-graphite">
            {batch.name}
          </h2>
          <p className="mt-1 break-all font-mono text-sm text-bp-muted">
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
        <Fact label={t("context.workflowPath")} value={batch.workflowPath} />
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
  submitState: ReturnType<typeof useExecutionRequestSubmission>["state"];
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
    <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
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
  workspaceApprovalMode,
}: {
  batch: ExecutionRequestDraft["batch"];
  canSubmit: boolean;
  previewState: ReturnType<typeof useExecutionRequestPreview>;
  submitState: ReturnType<typeof useExecutionRequestSubmission>["state"];
  workspaceApprovalMode: ExecutionRequestDraft["workspaceApprovalMode"];
}) {
  const { t } = useTranslation("executionRequests");
  const previewRequest =
    previewState.type === "ready" ? previewState.preview.request : null;

  return (
    <aside className="min-w-0 space-y-4">
      <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-bp-graphite">
          {t("review.title")}
        </h2>
        <div className="mt-4 flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          {t("review.gateRequired")}
        </div>

        <dl className="mt-5 space-y-3 text-sm">
          <ReviewFact label={t("review.workflow")} value={batch.workflowPath} />
          <ReviewFact
            label={t("review.runner")}
            value={formatRunnerLabel(batch.execution?.runsOn ?? "")}
          />
          <ReviewFact
            label={t("review.requestId")}
            value={previewRequest?.requestId ?? t("review.pending")}
          />
          <ReviewFact
            label={t("review.expiresAt")}
            value={previewRequest?.expiresAt ?? t("review.pending")}
          />
          <ReviewFact
            label={t("review.digest")}
            value={
              previewRequest?.evidence.requestDigest ?? t("review.pending")
            }
          />
        </dl>

        <ul className="mt-5 space-y-2 text-sm">
          <CheckItem
            ready={Boolean(batch.execution?.command.trim())}
            text={t("review.commandReady")}
          />
          <CheckItem
            ready={previewRequest !== null}
            text={t("review.digestReady")}
          />
          <CheckItem ready text={t("review.noDispatch")} />
        </ul>

        <p className="mt-5 rounded-md bg-slate-50 px-3 py-2 text-xs font-semibold text-bp-muted">
          {t("review.nextStep")}
        </p>

        {workspaceApprovalMode === "AUTO_APPROVE" ? (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
            {t("review.autoApproval")}
          </p>
        ) : null}

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

      <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
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
            {previewState.message || t("states.previewError")}
          </p>
        ) : null}
        {previewRequest?.evidence.canonicalPayload ? (
          <pre className="mt-4 max-h-96 max-w-full overflow-auto rounded-md bg-bp-graphite p-4 text-xs leading-6 text-white">
            <code>{previewRequest.evidence.canonicalPayload}</code>
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

function SubmitMessage({
  state,
}: {
  state: ReturnType<typeof useExecutionRequestSubmission>["state"];
}) {
  const { t } = useTranslation("executionRequests");

  if (state.type === "error") {
    return (
      <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
        {state.message || t("states.submitError")}
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

function formatRunnerLabel(
  runsOn:
    | NonNullable<ExecutionRequestDraft["batch"]["execution"]>["runsOn"]
    | "",
) {
  return Array.isArray(runsOn) ? runsOn.join(", ") : runsOn || "-";
}

function addHours(requestedAt: string, hours: number): string {
  const requestedAtTime = new Date(requestedAt).getTime();
  return new Date(requestedAtTime + hours * 60 * 60 * 1000).toISOString();
}

function createParameterRowId(): string {
  return `parameter-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
