import type { BatchParameterDefinition } from "@batchplane/domain";
import { useTranslation } from "react-i18next";
import { ParameterValueDisplay } from "../../../requests/parameters/components/ParameterValueDisplay";

export function BatchParameters({
  definitions,
}: {
  definitions: BatchParameterDefinition[];
}) {
  const { t } = useTranslation("parameters");
  if (definitions.length === 0) return null;
  return (
    <section className="mt-5 min-w-0 border-t border-slate-100 pt-5">
      <h3 className="text-sm font-bold text-bp-graphite">{t("definitions")}</h3>
      <dl className="mt-3 min-w-0 divide-y divide-slate-100 text-sm">
        {definitions.map((definition) => (
          <div
            className="grid min-w-0 gap-2 py-3 sm:grid-cols-2"
            key={definition.name}
          >
            <dt className="min-w-0">
              <span className="block break-all font-mono font-semibold text-bp-graphite">
                {definition.name}
              </span>
              <span className="text-xs text-bp-muted">
                {t(definition.required ? "required" : "optional")} ·{" "}
                {t(definition.sensitive ? "sensitive" : "ordinary")}
              </span>
            </dt>
            <dd className="min-w-0">
              <span className="mb-1 block text-xs text-bp-muted">
                {t("defaultValue")}
              </span>
              <ParameterValueDisplay
                sensitive={definition.sensitive}
                value={definition.defaultValue}
              />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
