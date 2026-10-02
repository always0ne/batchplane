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
  if (batch.control.status === "BYPASSED") {
    return t("execution.errors.controlBypassed");
  }

  if (batch.control.status === "UNKNOWN") {
    return t("execution.errors.controlUnknown");
  }

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
