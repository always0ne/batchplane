import type { FailureFollowUp } from "@batchplane/ui-client";
import type { ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { FailureFollowUpItem } from "./FailureFollowUpItem";

export function FailureFollowUpHistory({
  followUps,
  onReview,
}: {
  followUps: FailureFollowUp[];
  onReview: ComponentProps<typeof FailureFollowUpItem>["onReview"];
}) {
  const { t } = useTranslation("executionRequests");
  return (
    <div className="mt-5">
      <h3 className="text-sm font-bold text-bp-graphite">
        {t("runDetail.followUp.history")}
      </h3>
      {followUps.length === 0 ? (
        <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold text-bp-muted">
          {t("runDetail.followUp.empty")}
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100">
          {followUps.map((followUp) => (
            <FailureFollowUpItem
              followUp={followUp}
              key={followUp.followUpId}
              onReview={onReview}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
