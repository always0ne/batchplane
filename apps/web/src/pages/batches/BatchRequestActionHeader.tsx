import type { BatchControl } from "@batchplane/ui-client";
import type { BatchDefinition } from "@batchplane/domain";
import { ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

type Props = { batch: BatchDefinition; control: BatchControl };

export function BatchRequestActionHeader({ batch, control }: Props) {
  const { t } = useTranslation("batches");
  const controlTitle =
    control.status === "VERIFIED"
      ? t("control.verifiedReason")
      : control.disabledReason === "UNAPPROVED_BATCH_REVISION"
        ? t("execution.errors.controlBypassed")
        : t("execution.errors.controlUnknown");

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-semibold text-bp-graphite">
        {t("detail.requests.title")}
      </h2>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={
            batch.gateRequired
              ? "inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800"
              : "inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900"
          }
          title={
            batch.gateRequired
              ? t("detail.gate.required")
              : t("detail.gate.nonCompliant")
          }
        >
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          {batch.gateRequired
            ? t("detail.gate.requiredShort")
            : t("detail.gate.nonCompliantShort")}
        </span>
        <span
          className={
            control.status === "VERIFIED"
              ? "rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800"
              : "rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900"
          }
          title={controlTitle}
        >
          {t(`control.status.${control.status.toLowerCase()}`)}
        </span>
      </div>
    </div>
  );
}
