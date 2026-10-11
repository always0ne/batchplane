import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../../../../components/Button";
import { SensitiveInputReadiness } from "../../../../parameters/components/SensitiveInputReadiness";
import { parameterDefinitionProblems } from "../../batch-parameter-definitions";
import type { useBatchParameterDefinitions } from "../../hooks/useBatchParameterDefinitions";
import { BatchParameterDefinitionRow } from "./BatchParameterDefinitionRow";
import type { WorkspaceEncryptionUnavailableReason } from "@batchplane/ui-client";

export function BatchParameterDefinitions({
  editor,
  sensitiveInputsAvailable,
  sensitiveInputsUnavailableReason,
}: {
  editor: ReturnType<typeof useBatchParameterDefinitions>;
  sensitiveInputsAvailable: boolean;
  sensitiveInputsUnavailableReason?: WorkspaceEncryptionUnavailableReason;
}) {
  const { t } = useTranslation("parameters");
  const problems = parameterDefinitionProblems(
    editor.definitions,
    sensitiveInputsAvailable,
  );
  return (
    <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-bp-graphite">
          {t("definitions")}
        </h2>
        <Button onClick={editor.add} size="compact">
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t("add")}
        </Button>
      </div>
      {!sensitiveInputsAvailable &&
      editor.definitions.some((definition) => definition.sensitive) ? (
        <div className="mt-3">
          <SensitiveInputReadiness reason={sensitiveInputsUnavailableReason} />
        </div>
      ) : null}
      {editor.drafts.length === 0 ? (
        <p className="mt-3 text-sm text-bp-muted">{t("empty")}</p>
      ) : null}
      <div className="mt-4 min-w-0">
        {editor.drafts.map(({ key, definition }) => (
          <BatchParameterDefinitionRow
            definition={definition}
            key={key}
            onChange={(next) => editor.update(key, next)}
            onRemove={() => editor.remove(key)}
            sensitiveInputsAvailable={sensitiveInputsAvailable}
          />
        ))}
      </div>
      {problems.length > 0 ? (
        <ul className="space-y-2 text-sm text-amber-900" role="alert">
          {problems.map((code) => (
            <li key={code}>{t(`validation.${code}`, { name: "" })}</li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
