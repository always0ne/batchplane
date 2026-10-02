import type { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";

import type { ExecutionRequestFormValues } from "../execution-request-form-values";
import type { ExecutionRequestSubmissionState } from "../hooks/useExecutionRequestSubmission";
import { ExecutionRequestParameters } from "./ExecutionRequestParameters";
import { ExecutionRequestField } from "./ExecutionRequestField";
import { SubmissionMessage } from "./SubmissionMessage";

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
        <ExecutionRequestField label={t("form.targetRevision")}>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-bp-graphite outline-none focus:border-bp-git focus:ring-2 focus:ring-bp-git/20"
            onChange={updateField("targetRevision")}
            value={formValues.targetRevision}
          />
        </ExecutionRequestField>
        <ExecutionRequestField label={t("form.expiresIn")}>
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
        </ExecutionRequestField>
      </div>

      <ExecutionRequestField className="mt-4" label={t("form.reason")}>
        <textarea
          className="min-h-28 w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm text-bp-graphite outline-none focus:border-bp-git focus:ring-2 focus:ring-bp-git/20"
          onChange={updateField("reason")}
          value={formValues.reason}
        />
      </ExecutionRequestField>

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
