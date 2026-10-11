import {
  validateParameterNames,
  type BatchParameterDefinition,
  type ParameterSelection,
} from "@batchplane/domain";
import { initialParameterSelection } from "../../parameters/parameter-selections";

export type ParameterDefinitionDraft = {
  key: string;
  definition: BatchParameterDefinition;
};

export function parameterDefinitionProblems(
  definitions: BatchParameterDefinition[],
  sensitiveInputsAvailable: boolean,
): string[] {
  const problems: string[] = [];
  try {
    validateParameterNames(definitions.map((definition) => definition.name));
  } catch (error) {
    if (error instanceof Error) problems.push(error.message);
  }
  for (const definition of definitions) {
    if (definition.defaultValue?.kind !== "VALUE") continue;
    if (definition.defaultValue.value.includes("\0"))
      problems.push("PARAMETER_NUL_UNSUPPORTED");
    if (definition.sensitive && !sensitiveInputsAvailable)
      problems.push("SENSITIVE_UNAVAILABLE");
  }
  return [...new Set(problems)];
}

export function reconcileScheduleParameters(
  previous: ParameterDefinitionDraft[],
  next: ParameterDefinitionDraft[],
  selections: ParameterSelection[] = [],
): ParameterSelection[] {
  return next.map(({ key, definition }) => {
    const before = previous.find((item) => item.key === key)?.definition;
    const selection = selections.find((item) => item.name === before?.name);
    if (!before || !selection) return initialParameterSelection(definition);
    if (selection.source === "OMIT" && definition.required)
      return initialParameterSelection(definition);
    if (selection.source === "VALUE") {
      const sensitivityChanged = before.sensitive !== definition.sensitive;
      const savedNameChanged =
        selection.value.kind === "SAVED" && before.name !== definition.name;
      if (sensitivityChanged || savedNameChanged)
        return initialParameterSelection(definition);
    }
    return { ...selection, name: definition.name };
  });
}
