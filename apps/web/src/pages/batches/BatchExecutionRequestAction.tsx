import type { BatchControl } from "@batchplane/ui-client";
import type { BatchDefinition } from "@batchplane/domain";
import { Play } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button, ButtonLink } from "../../ui/Button";

type Props = { batch: BatchDefinition; control: BatchControl };

export function BatchExecutionRequestAction({ batch, control }: Props) {
  const { t } = useTranslation("batches");
  const blockReason = getExecutionBlockReason(batch, control, t);
  const executionRequestPath = `/batches/${encodeURIComponent(batch.batchId)}/execution-requests/new`;

  return (
    <section className="mt-4 border-t border-slate-100 pt-4">
      <h3 className="text-sm font-bold text-bp-graphite">
        {t("detail.execution.title")}
      </h3>
      {blockReason ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            className="flex-1 justify-center"
            disabled
            title={blockReason}
            variant="primary"
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            {t("actions.requestRun")}
          </Button>
          <span className="max-w-full text-xs font-medium text-amber-900">
            {blockReason}
          </span>
        </div>
      ) : (
        <ButtonLink
          className="mt-3 w-full justify-center"
          to={executionRequestPath}
          variant="primary"
        >
          <Play className="h-4 w-4" aria-hidden="true" />
          {t("actions.requestRun")}
        </ButtonLink>
      )}
    </section>
  );
}

function getExecutionBlockReason(
  batch: BatchDefinition,
  control: BatchControl,
  t: (key: string) => string,
): string | null {
  if (control.status === "BYPASSED")
    return t("execution.errors.controlBypassed");
  if (control.status === "UNKNOWN") return t("execution.errors.controlUnknown");
  if (batch.status !== "ACTIVE") return t("execution.errors.inactive");
  if (!batch.gateRequired) return t("execution.errors.gateRequired");
  if (!batch.execution?.command.trim())
    return t("execution.errors.missingCommand");
  return null;
}
