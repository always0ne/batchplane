import type { BatchListItem } from "@batchplane/ui-client";

export function getExecutionRequestBlockReason({
  batch,
  isRequestInProgress,
  t,
}: {
  batch: BatchListItem;
  isRequestInProgress: boolean;
  t: (key: string) => string;
}): string | null {
  if (batch.status !== "ACTIVE") {
    return t("execution.errors.inactive");
  }

  if (!batch.gateRequired) {
    return t("execution.errors.gateRequired");
  }

  if (!batch.hasExecutableCommand) {
    return t("execution.errors.missingCommand");
  }

  if (isRequestInProgress) {
    return t("execution.errors.requestInProgress");
  }

  return null;
}
