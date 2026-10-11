import type {
  BatchParameterDefinition,
  ParameterSelection,
} from "@batchplane/domain";
import { useTranslation } from "react-i18next";
import {
  initialParameterSelection,
  parameterSelectionProblems,
} from "../parameter-selections";
import { ParameterSelectionField } from "./ParameterSelectionField";
import { SensitiveInputReadiness } from "./SensitiveInputReadiness";
import type { WorkspaceEncryptionUnavailableReason } from "@batchplane/ui-client";

export function ParameterSelections({
  definitions,
  selections,
  sensitiveInputsAvailable,
  sensitiveInputsUnavailableReason,
  requireSensitiveReadiness = false,
  onChange,
}: {
  definitions: BatchParameterDefinition[];
  selections: ParameterSelection[];
  sensitiveInputsAvailable: boolean;
  sensitiveInputsUnavailableReason?: WorkspaceEncryptionUnavailableReason;
  requireSensitiveReadiness?: boolean;
  onChange: (selections: ParameterSelection[]) => void;
}) {
  const { t } = useTranslation("parameters");
  const problems = parameterSelectionProblems(
    definitions,
    selections,
    sensitiveInputsAvailable,
    { requireSensitiveReadiness },
  );
  return (
    <section className="mt-5 min-w-0 border-t border-slate-100 pt-5">
      <h3 className="text-sm font-bold text-bp-graphite">{t("title")}</h3>
      {definitions.length === 0 ? (
        <p className="mt-2 text-sm text-bp-muted">{t("empty")}</p>
      ) : null}
      {!sensitiveInputsAvailable &&
      definitions.some((definition) => definition.sensitive) ? (
        <div className="mt-2">
          <SensitiveInputReadiness reason={sensitiveInputsUnavailableReason} />
        </div>
      ) : null}
      <div className="mt-3 min-w-0">
        {definitions.map((definition, index) => (
          <ParameterSelectionField
            definition={definition}
            key={`${index}-${definition.name}`}
            onChange={(next) =>
              onChange(
                definitions.map((item) =>
                  item.name === next.name
                    ? next
                    : (selections.find(
                        (selection) => selection.name === item.name,
                      ) ?? initialParameterSelection(item)),
                ),
              )
            }
            selection={
              selections.find(
                (selection) => selection.name === definition.name,
              ) ?? initialParameterSelection(definition)
            }
            sensitiveInputsAvailable={sensitiveInputsAvailable}
          />
        ))}
      </div>
      {problems.length > 0 ? (
        <ul className="mt-2 space-y-2 text-sm text-amber-900" role="alert">
          {problems.map(({ name, code }, index) => (
            <li key={index}>{t(`validation.${code}`, { name })}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
