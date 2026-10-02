import type { BatchListItem } from "@batchplane/ui-client";
import { Play } from "lucide-react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";

import { Button } from "../../../../components/Button";
import { ButtonLink } from "../../../../components/ButtonLink";
import { getExecutionRequestBlockReason } from "../batch-list-readiness";

export function BatchListRow({ batch }: { batch: BatchListItem }) {
  const { t } = useTranslation("batches");
  const blockReason = getExecutionRequestBlockReason({
    batch,
    isRequestInProgress: false,
    t,
  });
  const batchPath = `/batches/${encodeURIComponent(batch.batchId)}`;
  const requestPath = `${batchPath}/execution-requests/new`;

  return (
    <tr>
      <td className="px-4 py-4 font-mono text-sm text-bp-graphite">
        <Link
          className="font-semibold text-bp-control underline"
          to={batchPath}
        >
          {batch.batchId}
        </Link>
      </td>
      <td className="px-4 py-4 text-sm font-semibold text-bp-graphite">
        {batch.name}
      </td>
      <td className="px-4 py-4 text-sm text-bp-graphite">{batch.owner}</td>
      <td className="px-4 py-4 text-sm text-bp-graphite">
        {batch.environment}
      </td>
      <td className="px-4 py-4 text-sm text-bp-graphite">
        {batch.criticality}
      </td>
      <td className="px-4 py-4 text-sm text-bp-graphite">{batch.status}</td>
      <td className="px-4 py-4 text-sm text-bp-graphite">
        <div className="space-y-1">
          <p
            title={
              batch.gateRequired
                ? t("detail.gate.required")
                : t("detail.gate.nonCompliant")
            }
          >
            {batch.gateRequired
              ? t("values.required")
              : t("values.gateMissing")}
          </p>
          <p
            className={[
              "text-xs font-semibold",
              batch.control.status === "VERIFIED"
                ? "text-emerald-700"
                : "text-amber-800",
            ].join(" ")}
            title={getControlStatusReason(batch, t)}
          >
            {t(`control.status.${batch.control.status.toLowerCase()}`)}
          </p>
        </div>
      </td>
      <td className="px-4 py-4 text-sm text-bp-graphite">
        <div className="flex flex-wrap items-center gap-2">
          <ButtonLink size="compact" to={batchPath} variant="secondary">
            {t("actions.viewDetails")}
          </ButtonLink>
          {blockReason ? (
            <Button
              disabled
              size="compact"
              title={blockReason}
              variant="secondary"
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              {t("actions.requestRun")}
            </Button>
          ) : (
            <ButtonLink
              size="compact"
              title={t("actions.requestRun")}
              to={requestPath}
              variant="secondary"
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              {t("actions.requestRun")}
            </ButtonLink>
          )}
          {blockReason ? (
            <span
              className="inline-flex rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800"
              title={blockReason}
            >
              {t("execution.blocked")}
            </span>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function getControlStatusReason(
  batch: BatchListItem,
  t: (key: string) => string,
): string | undefined {
  if (batch.control.status === "VERIFIED") {
    return t("control.verifiedReason");
  }

  return batch.control.disabledReason === "UNAPPROVED_BATCH_REVISION"
    ? t("execution.errors.controlBypassed")
    : t("execution.errors.controlUnknown");
}
