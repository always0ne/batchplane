import type { BatchDefinition } from "@batchtrail/domain";

export function getExecutionRequestBlockReason({
  batch,
  isRequestInProgress,
  t,
}: {
  batch: BatchDefinition;
  isRequestInProgress: boolean;
  t: (key: string) => string;
}): string | null {
  if (batch.status !== "ACTIVE") {
    return t("execution.errors.inactive");
  }

  if (!batch.gateRequired) {
    return t("execution.errors.gateRequired");
  }

  if (!batch.execution?.command.trim()) {
    return t("execution.errors.missingCommand");
  }

  if (isRequestInProgress) {
    return t("execution.errors.requestInProgress");
  }

  return null;
}
