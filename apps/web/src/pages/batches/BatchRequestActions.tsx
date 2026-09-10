import type { BatchControl } from "@batchplane/ui-client";
import type { BatchDefinition } from "@batchplane/domain";
import { useTranslation } from "react-i18next";

import { BatchDetailFact } from "./BatchDetailFact";
import { BatchDeleteRequestAction } from "./BatchDeleteRequestAction";
import { BatchExecutionRequestAction } from "./BatchExecutionRequestAction";
import { BatchNormalChangeAction } from "./BatchNormalChangeAction";
import { BatchRemediationActions } from "./BatchRemediationActions";
import { BatchRequestActionHeader } from "./BatchRequestActionHeader";
import { PendingBatchChangeBlocker } from "./PendingBatchChangeBlocker";
import { useBatchChangeBlocker } from "./useBatchChangeBlocker";

export function BatchRequestActions({
  batch,
  control,
}: {
  batch: BatchDefinition;
  control: BatchControl;
}) {
  const { t } = useTranslation("batches");
  const blocker = useBatchChangeBlocker(
    batch.batchId,
    t("detail.change.loadError"),
  );
  const changesBlocked =
    blocker.state.type !== "ready" || Boolean(blocker.state.blocker);
  const blockedReason = getBlockedReason(blocker.state, t);

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <BatchRequestActionHeader batch={batch} control={control} />
      <BatchExecutionRequestAction batch={batch} control={control} />
      {control.status === "VERIFIED" ? (
        <dl className="mt-4 grid gap-3 border-t border-slate-100 pt-4 text-sm">
          <BatchDetailFact
            label={t("detail.control.approvedChange")}
            value={control.approvedRevision.governedChangeId}
          />
          <BatchDetailFact
            label={t("detail.control.verifiedRevision")}
            value={control.approvedRevision.verifiedSha}
          />
        </dl>
      ) : null}
      {blocker.state.type === "ready" && blocker.state.blocker ? (
        <PendingBatchChangeBlocker blocker={blocker.state.blocker} />
      ) : null}
      {blocker.state.type === "error" ? (
        <p className="mt-4 text-sm font-semibold text-rose-800" role="alert">
          {blocker.state.message}
        </p>
      ) : null}
      <BatchNormalChangeAction
        batchId={batch.batchId}
        blocked={changesBlocked}
        blockedReason={blockedReason}
      />
      <BatchDeleteRequestAction
        batchId={batch.batchId}
        blocked={changesBlocked}
        blockedReason={blockedReason}
      />
      <BatchRemediationActions batchId={batch.batchId} control={control} />
    </article>
  );
}

function getBlockedReason(
  state: ReturnType<typeof useBatchChangeBlocker>["state"],
  t: (key: string) => string,
): string {
  if (state.type === "loading") return t("detail.change.loading");
  if (state.type === "error") return state.message;
  return t("detail.change.blocked");
}
