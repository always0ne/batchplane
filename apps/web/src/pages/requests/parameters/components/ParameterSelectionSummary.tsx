import type {
  BatchParameterDefinition,
  ParameterSelection,
} from "@batchplane/domain";
import { useTranslation } from "react-i18next";
import { initialParameterSelection } from "../parameter-selections";
import { ParameterValueDisplay } from "./ParameterValueDisplay";

export function ParameterSelectionSummary({
  definitions,
  selections,
}: {
  definitions: BatchParameterDefinition[];
  selections: ParameterSelection[];
}) {
  const { t } = useTranslation("parameters");
  if (definitions.length === 0) return null;
  return (
    <section className="mt-4 min-w-0">
      <h4 className="text-sm font-semibold text-bp-graphite">{t("title")}</h4>
      <dl className="mt-2 min-w-0 space-y-3 text-sm">
        {definitions.map((definition) => {
          const selection =
            selections.find((item) => item.name === definition.name) ??
            initialParameterSelection(definition);
          let value = definition.defaultValue;
          if (selection.source === "VALUE") value = selection.value;
          return (
            <div
              className="grid min-w-0 gap-1 sm:grid-cols-2"
              key={definition.name}
            >
              <dt className="min-w-0 break-all font-mono text-bp-graphite">
                {definition.name}
              </dt>
              <dd className="min-w-0">
                <span className="mb-1 block text-xs text-bp-muted">
                  {t(`sources.${selection.source}`)}
                </span>
                {selection.source !== "OMIT" ? (
                  <ParameterValueDisplay
                    sensitive={definition.sensitive}
                    value={value}
                  />
                ) : null}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
