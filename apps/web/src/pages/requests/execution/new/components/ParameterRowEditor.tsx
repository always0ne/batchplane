import { Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { ParameterRow } from "../execution-request-form-values";
import { ExecutionRequestField } from "./ExecutionRequestField";

export function ParameterRowEditor({
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
      <ExecutionRequestField label={t("parameters.name")}>
        <input
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-bp-graphite outline-none focus:border-bp-git focus:ring-2 focus:ring-bp-git/20"
          onChange={(event) => onUpdate({ name: event.target.value })}
          value={parameter.name}
        />
      </ExecutionRequestField>
      <ExecutionRequestField label={t("parameters.value")}>
        <input
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-bp-graphite outline-none focus:border-bp-git focus:ring-2 focus:ring-bp-git/20"
          onChange={(event) => onUpdate({ value: event.target.value })}
          type={parameter.sensitive ? "password" : "text"}
          value={parameter.value}
        />
      </ExecutionRequestField>
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
