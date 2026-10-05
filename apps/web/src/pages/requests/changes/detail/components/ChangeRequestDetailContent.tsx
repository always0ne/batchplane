import type { ChangeRequestDetail } from "@batchplane/ui-client";
import type { ChangeRequestAction } from "../hooks/useChangeRequestDetail";
import { ChangeSummary } from "./ChangeSummary";
import { ChangeEvidence } from "./ChangeEvidence";
import { DecisionEvidence } from "./DecisionEvidence";
import { DecisionActions } from "./DecisionActions";

export function ChangeRequestDetailContent({
  detail,
  onAction,
  runningAction,
}: {
  detail: ChangeRequestDetail;
  onAction: (
    action: ChangeRequestAction,
    rejectionReason?: string,
  ) => Promise<boolean>;
  runningAction?: ChangeRequestAction;
}) {
  return (
    <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="min-w-0 space-y-4">
        <ChangeSummary detail={detail} />
        <ChangeEvidence detail={detail} />
      </div>
      <aside className="space-y-4">
        <DecisionEvidence detail={detail} />
        <DecisionActions
          detail={detail}
          onAction={onAction}
          runningAction={runningAction}
        />
      </aside>
    </div>
  );
}
