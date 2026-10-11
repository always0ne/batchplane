import type {
  BatchParameterDefinition,
  ParameterSelection,
} from "@batchplane/domain";

export function initialParameterSelection(
  definition: BatchParameterDefinition,
): ParameterSelection {
  if (definition.defaultValue !== undefined || definition.required) {
    return { name: definition.name, source: "DEFAULT" };
  }
  return { name: definition.name, source: "OMIT" };
}

export function parameterSelectionProblems(
  definitions: BatchParameterDefinition[],
  selections: ParameterSelection[],
  sensitiveInputsAvailable: boolean,
  {
    requireSensitiveReadiness = false,
  }: {
    requireSensitiveReadiness?: boolean;
  } = {},
): Array<{ name: string; code: string }> {
  return definitions.flatMap((definition) => {
    const selection =
      selections.find((item) => item.name === definition.name) ??
      initialParameterSelection(definition);
    let code: string | undefined;
    if (selection.source === "DEFAULT" && definition.defaultValue === undefined)
      code = "DEFAULT_REQUIRED";
    if (selection.source === "OMIT" && definition.required) code = "REQUIRED";
    // Execution consumes protected inputs; batch changes may only preserve them.
    if (
      requireSensitiveReadiness &&
      definition.sensitive &&
      selection.source !== "OMIT" &&
      !sensitiveInputsAvailable
    )
      code = "SENSITIVE_UNAVAILABLE";
    if (selection.source === "VALUE" && selection.value.kind === "VALUE") {
      if (definition.sensitive && !sensitiveInputsAvailable)
        code = "SENSITIVE_UNAVAILABLE";
      if (selection.value.value.includes("\0"))
        code = "PARAMETER_NUL_UNSUPPORTED";
    }
    return code ? [{ name: definition.name, code }] : [];
  });
}
