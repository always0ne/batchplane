import type { BatchParameterDefinition } from "@batchplane/domain";
import { Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../../../../components/Button";
import { ParameterValueInput } from "../../../../parameters/components/ParameterValueInput";

export function BatchParameterDefinitionRow({
  definition,
  sensitiveInputsAvailable,
  onChange,
  onRemove,
}: {
  definition: BatchParameterDefinition;
  sensitiveInputsAvailable: boolean;
  onChange: (definition: BatchParameterDefinition) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation("parameters");
  return (
    <fieldset className="min-w-0 space-y-3 border-t border-slate-200 py-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1 text-sm font-semibold text-bp-graphite">
          <span className="mb-1 block">{t("name")}</span>
          <input
            className="w-full min-w-0 rounded-md border border-slate-300 px-3 py-2 text-sm"
            onChange={(event) =>
              onChange({ ...definition, name: event.target.value })
            }
            value={definition.name}
          />
        </label>
        <Button
          aria-label={t("remove")}
          onClick={onRemove}
          size="compact"
          title={t("remove")}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      <div className="flex flex-wrap gap-4 text-sm font-semibold text-bp-graphite">
        <label className="inline-flex items-center gap-2">
          <input
            checked={definition.required}
            onChange={(event) =>
              onChange({ ...definition, required: event.target.checked })
            }
            type="checkbox"
          />
          {t("required")}
        </label>
        <label className="inline-flex items-center gap-2">
          <input
            checked={definition.sensitive}
            onChange={(event) =>
              onChange({ ...definition, sensitive: event.target.checked })
            }
            type="checkbox"
          />
          {t("sensitive")}
        </label>
        <label className="inline-flex items-center gap-2">
          <input
            checked={definition.defaultValue !== undefined}
            disabled={
              definition.sensitive &&
              !sensitiveInputsAvailable &&
              definition.defaultValue === undefined
            }
            onChange={(event) => {
              const next = { ...definition };
              if (event.target.checked)
                next.defaultValue = { kind: "VALUE", value: "" };
              else delete next.defaultValue;
              onChange(next);
            }}
            type="checkbox"
          />
          {t("hasDefault")}
        </label>
      </div>
      {definition.defaultValue !== undefined ? (
        <ParameterValueInput
          key={`${definition.sensitive}-${definition.defaultValue.kind}`}
          label={t("defaultValue")}
          onChange={(defaultValue) => onChange({ ...definition, defaultValue })}
          sensitive={definition.sensitive}
          sensitiveInputsAvailable={sensitiveInputsAvailable}
          value={definition.defaultValue}
        />
      ) : null}
    </fieldset>
  );
}
