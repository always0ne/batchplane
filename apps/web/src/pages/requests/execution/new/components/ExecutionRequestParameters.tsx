import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "../../../../../components/Button";
import type { ParameterRow } from "../execution-request-form-values";
import { ParameterRowEditor } from "./ParameterRowEditor";

export function ExecutionRequestParameters({
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

function createParameterRowId(): string {
  return `parameter-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
