import type {
  BatchParameterDefinition,
  ParameterSelection,
} from "@batchplane/domain";
import { useTranslation } from "react-i18next";
import { ParameterValueDisplay } from "./ParameterValueDisplay";
import { ParameterValueInput } from "./ParameterValueInput";

export function ParameterSelectionField({
  definition,
  selection,
  sensitiveInputsAvailable,
  onChange,
}: {
  definition: BatchParameterDefinition;
  selection: ParameterSelection;
  sensitiveInputsAvailable: boolean;
  onChange: (selection: ParameterSelection) => void;
}) {
  const { t } = useTranslation("parameters");
  function changeSource(source: ParameterSelection["source"]) {
    if (source === "VALUE")
      onChange({
        name: definition.name,
        source,
        value: { kind: "VALUE", value: "" },
      });
    else onChange({ name: definition.name, source });
  }
  return (
    <div className="grid min-w-0 gap-3 border-t border-slate-200 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
      <div className="min-w-0 space-y-2">
        <p className="break-all font-mono text-sm font-bold text-bp-graphite">
          {definition.name}
        </p>
        <p className="text-xs text-bp-muted">
          {t(definition.required ? "required" : "optional")} ·{" "}
          {t(definition.sensitive ? "sensitive" : "ordinary")}
        </p>
        <label className="block text-sm font-semibold text-bp-graphite">
          <span className="mb-1 block break-words [overflow-wrap:anywhere]">
            {t("source", { name: definition.name })}
          </span>
          <select
            className="w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            onChange={(event) =>
              changeSource(event.target.value as ParameterSelection["source"])
            }
            value={selection.source}
          >
            <option
              disabled={definition.defaultValue === undefined}
              value="DEFAULT"
            >
              {t("sources.DEFAULT")}
            </option>
            <option
              disabled={definition.sensitive && !sensitiveInputsAvailable}
              value="VALUE"
            >
              {t("sources.VALUE")}
            </option>
            {!definition.required ? (
              <option value="OMIT">{t("sources.OMIT")}</option>
            ) : null}
          </select>
        </label>
      </div>
      {selection.source === "DEFAULT" ? (
        <div className="min-w-0 text-sm text-bp-graphite">
          <ParameterValueDisplay
            sensitive={definition.sensitive}
            value={definition.defaultValue}
          />
        </div>
      ) : null}
      {selection.source === "VALUE" ? (
        <ParameterValueInput
          key={`${definition.sensitive}-${selection.value.kind}`}
          label={t("value", { name: definition.name })}
          onChange={(value) =>
            onChange({ name: definition.name, source: "VALUE", value })
          }
          sensitive={definition.sensitive}
          sensitiveInputsAvailable={sensitiveInputsAvailable}
          value={selection.value}
        />
      ) : null}
    </div>
  );
}
