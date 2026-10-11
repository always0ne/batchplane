import type { ExecutionRequest } from "@batchplane/ui-client";
import { useTranslation } from "react-i18next";
import { ExecutionRequestParameterValue } from "./ExecutionRequestParameterValue";

export function ExecutionRequestParameterSummary({
  parameters,
}: {
  parameters: ExecutionRequest["parameters"];
}) {
  const { t } = useTranslation("parameters");
  if (parameters === undefined) return null;
  return (
    <section className="mt-4 min-w-0 border-t border-slate-100 pt-4">
      <h3 className="text-sm font-bold text-bp-graphite">{t("title")}</h3>
      {parameters.length === 0 ? (
        <p className="mt-2 text-sm text-bp-muted">{t("empty")}</p>
      ) : null}
      <dl className="mt-3 min-w-0 space-y-3 text-sm">
        {parameters.map((parameter) => (
          <div
            className="grid min-w-0 gap-2 sm:grid-cols-2"
            key={parameter.name}
          >
            <dt className="min-w-0 break-all font-mono font-semibold text-bp-graphite">
              {parameter.name}
            </dt>
            <dd className="min-w-0">
              <span className="mb-1 block text-xs text-bp-muted">
                {t(`sources.${parameter.source}`)}
              </span>
              {parameter.source !== "OMIT" ? (
                <ExecutionRequestParameterValue
                  sensitive={parameter.sensitive}
                  value={parameter.value}
                />
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
