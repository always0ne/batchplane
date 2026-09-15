import type { ExecutionRequestParameter } from "@batchplane/ui-client";
import { Plus, Trash2 } from "lucide-react";
import type { ChangeEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "../../ui/Button";
import type { ExecutionRequestSubmissionState } from "./useExecutionRequestSubmission";

export type ParameterRow = ExecutionRequestParameter & {
  id: string;
};

export type ExecutionRequestFormValues = {
  expiresInHours: string;
  parameters: ParameterRow[];
  reason: string;
  targetRevision: string;
};

const expiryOptions = ["1", "4", "8", "24"] as const;

export function ExecutionRequestForm({
  formValues,
  onChange,
  submitState,
  validationErrors,
}: {
  formValues: ExecutionRequestFormValues;
  onChange: (values: ExecutionRequestFormValues) => void;
  submitState: ExecutionRequestSubmissionState;
  validationErrors: string[];
}) {
  const { t } = useTranslation("executionRequests");

  function updateField(
    field: keyof Omit<ExecutionRequestFormValues, "parameters">,
  ) {
    return (
      event: ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >,
    ) => {
      onChange({ ...formValues, [field]: event.target.value });
    };
  }

  return (
    <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-bp-graphite">
        {t("form.title")}
      </h2>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Field label={t("form.targetRevision")}>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-bp-graphite outline-none focus:border-bp-git focus:ring-2 focus:ring-bp-git/20"
            onChange={updateField("targetRevision")}
            value={formValues.targetRevision}
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

      <ExecutionRequestParameters
        onChange={(parameters) => onChange({ ...formValues, parameters })}
        parameters={formValues.parameters}
      />

      {validationErrors.length > 0 ? (
        <ul className="mt-4 space-y-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
          {validationErrors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
      <SubmissionMessage state={submitState} />
    </article>
  );
}

function ExecutionRequestParameters({
  onChange,
  parameters,
}: {
  onChange: (parameters: ParameterRow[]) => void;
  parameters: ParameterRow[];
}) {
  const { t } = useTranslation("executionRequests");

  function addParameter() {
    onChange([
      ...parameters,
      { id: createParameterRowId(), name: "", sensitive: false, value: "" },
    ]);
  }

  function updateParameter(
    id: string,
    patch: Partial<Omit<ParameterRow, "id">>,
  ) {
    onChange(
      parameters.map((parameter) =>
        parameter.id === id ? { ...parameter, ...patch } : parameter,
      ),
    );
  }

  return (
    <section className="mt-5 border-t border-slate-100 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-bp-graphite">
          {t("parameters.title")}
        </h3>
        <Button onClick={addParameter} size="compact" type="button">
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t("parameters.add")}
        </Button>
      </div>
      <p className="mt-2 text-sm text-bp-muted">
        {t("parameters.sensitiveHint")}
      </p>
      {parameters.length === 0 ? (
        <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold text-bp-muted">
          {t("parameters.empty")}
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {parameters.map((parameter) => (
            <ParameterRowEditor
              key={parameter.id}
              onRemove={() =>
                onChange(
                  parameters.filter(
                    (candidate) => candidate.id !== parameter.id,
                  ),
                )
              }
              onUpdate={(patch) => updateParameter(parameter.id, patch)}
              parameter={parameter}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ParameterRowEditor({
  onRemove,
  onUpdate,
  parameter,
}: {
  onRemove: () => void;
  onUpdate: (patch: Partial<Omit<ParameterRow, "id">>) => void;
  parameter: ParameterRow;
}) {
  const { t } = useTranslation("executionRequests");

  return (
    <div className="grid gap-3 rounded-md border border-slate-200 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto_auto]">
      <Field label={t("parameters.name")}>
        <input
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-bp-graphite outline-none focus:border-bp-git focus:ring-2 focus:ring-bp-git/20"
          onChange={(event) => onUpdate({ name: event.target.value })}
          value={parameter.name}
        />
      </Field>
      <Field label={t("parameters.value")}>
        <input
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-bp-graphite outline-none focus:border-bp-git focus:ring-2 focus:ring-bp-git/20"
          onChange={(event) => onUpdate({ value: event.target.value })}
          type={parameter.sensitive ? "password" : "text"}
          value={parameter.value}
        />
      </Field>
      <label className="flex items-center gap-2 self-end py-2 text-sm font-semibold text-bp-graphite">
        <input
          checked={parameter.sensitive}
          className="h-4 w-4 accent-bp-control"
          onChange={(event) => onUpdate({ sensitive: event.target.checked })}
          type="checkbox"
        />
        {t("parameters.sensitive")}
      </label>
      <button
        aria-label={t("parameters.remove")}
        className="inline-flex h-10 w-10 items-center justify-center self-end rounded-md border border-slate-300 text-bp-muted"
        onClick={onRemove}
        type="button"
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
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

function SubmissionMessage({
  state,
}: {
  state: ExecutionRequestSubmissionState;
}) {
  const { t } = useTranslation("executionRequests");

  if (state.type !== "error") return null;

  return (
    <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
      {state.message || t("states.submitError")}
    </p>
  );
}

function createParameterRowId(): string {
  return `parameter-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
