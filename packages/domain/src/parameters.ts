/** A saved value is opaque to product UI; only the runtime adapter can use it. */
export type ParameterInputValue =
  | { kind: "VALUE"; value: string }
  | { kind: "SAVED"; reference: string };

export type BatchParameterDefinition = {
  name: string;
  required: boolean;
  sensitive: boolean;
  defaultValue?: ParameterInputValue;
};

export type ParameterSelection =
  | { name: string; source: "DEFAULT" | "OMIT" }
  | { name: string; source: "VALUE"; value: ParameterInputValue };

export function validateParameterNames(names: string[]): void {
  const seen = new Set<string>();
  for (const name of names) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(name)) {
      throw new Error("PARAMETER_NAME_INVALID");
    }
    const identity = name.toLowerCase();
    if (seen.has(identity)) throw new Error("PARAMETER_NAME_DUPLICATED");
    seen.add(identity);
  }
}

export function validateParameterString(
  value: unknown,
): asserts value is string {
  if (typeof value !== "string") throw new Error("PARAMETER_VALUE_INVALID");
  if (value.includes("\0")) throw new Error("PARAMETER_NUL_UNSUPPORTED");
}
