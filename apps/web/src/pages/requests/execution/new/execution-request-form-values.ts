import type { ParameterSelection } from "@batchplane/domain";

export type ExecutionRequestFormValues = {
  expiresInHours: string;
  parameters: ParameterSelection[];
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

  return errors;
}

export function addHours(requestedAt: string, hours: number): string {
  const requestedAtTime = new Date(requestedAt).getTime();
  return new Date(requestedAtTime + hours * 60 * 60 * 1000).toISOString();
}
