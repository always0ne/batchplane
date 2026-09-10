import type { BatchControl, BatchRemediationKind } from "@batchplane/ui-client";
import { Loader2, Wrench } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "../../ui/Button";
import { useBatchRemediation } from "./useBatchRemediation";

export function BatchRemediationActions({
  batchId,
  control,
}: {
  batchId: string;
  control: BatchControl;
}) {
  const { t } = useTranslation("batches");
  const remediation = useBatchRemediation(
    batchId,
    t("detail.control.requestFailed"),
  );

  if (
    !control.remediation.canRequest ||
    control.remediation.availableKinds.length === 0
  )
    return null;

  return (
    <section className="mt-5 border-t border-slate-100 pt-5">
      <h3 className="text-sm font-bold text-bp-graphite">
        {t("detail.control.remediation")}
      </h3>
      <p className="mt-1 text-sm text-bp-muted">
        {t("detail.control.remediationDescription")}
      </p>
      {remediation.error ? (
        <p className="mt-3 text-sm font-semibold text-rose-800" role="alert">
          {remediation.error}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {control.remediation.availableKinds.map((kind) => (
          <Button
            disabled={remediation.runningKind !== undefined}
            key={kind}
            onClick={() => void remediation.request(kind)}
            variant="secondary"
          >
            {remediation.runningKind === kind ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Wrench className="h-4 w-4" aria-hidden="true" />
            )}
            {remediation.runningKind === kind
              ? t("detail.control.requesting")
              : remediationLabel(kind, t)}
          </Button>
        ))}
      </div>
    </section>
  );
}

function remediationLabel(
  kind: BatchRemediationKind,
  t: (key: string) => string,
): string {
  return kind === "REVIEW_CURRENT"
    ? t("detail.control.reviewCurrent")
    : t("detail.control.restoreLastApproved");
}
