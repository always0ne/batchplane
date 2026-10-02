import type { ExecutionRequestParameter } from "@batchplane/ui-client";

export type ParameterRow = ExecutionRequestParameter & { id: string };

export type ExecutionRequestFormValues = {
  expiresInHours: string;
  parameters: ParameterRow[];
  reason: string;
  targetRevision: string;
};

export function validateForm(
  values: ExecutionRequestFormValues,
  t: (key: string) => string,
): string[] {
  const errors: string[] = [];

  if (!values.targetRevision.trim()) {
    errors.push(t("validation.targetRevision"));
  }

  if (!values.reason.trim()) {
    errors.push(t("validation.reason"));
  }

  if (
    !Number.isFinite(Number(values.expiresInHours)) ||
    Number(values.expiresInHours) <= 0
  ) {
    errors.push(t("validation.expiresIn"));
  }

  values.parameters.forEach((parameter) => {
    if (!parameter.name.trim() && parameter.value.trim()) {
      errors.push(t("validation.parameterName"));
    }
  });

  return errors;
}

export function addHours(requestedAt: string, hours: number): string {
  const requestedAtTime = new Date(requestedAt).getTime();
  return new Date(requestedAtTime + hours * 60 * 60 * 1000).toISOString();
}
