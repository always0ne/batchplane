import type { BatchChangeBlocker } from "@batchplane/ui-client";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

export function PendingBatchChangeBlocker({
  blocker,
}: {
  blocker: BatchChangeBlocker;
}) {
  const { t } = useTranslation("batches");
  const isGovernedChange = blocker.kind === "GOVERNED_CHANGE";
  const destination = isGovernedChange
    ? `/approvals/registration/${encodeURIComponent(blocker.requestLocator)}`
    : `/execution-requests/${encodeURIComponent(blocker.requestLocator)}`;

  return (
    <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
      <p className="text-xs font-semibold text-amber-950">
        {t("detail.change.blocked")}
      </p>
      <p className="mt-2 text-xs font-semibold text-amber-900">
        {blocker.title}
      </p>
      <Link
        className="mt-2 inline-block text-xs font-semibold text-amber-950 underline"
        to={destination}
      >
        {isGovernedChange
          ? t("detail.change.openBlockingPr")
          : t("detail.change.openBlockingIssue")}
      </Link>
    </div>
  );
}
