import type { ExecutionRequest } from "@batchplane/ui-client";

import { RequestSummary } from "./RequestSummary";
import { DecisionMaterial } from "./DecisionMaterial";
import { CanonicalPayload } from "./CanonicalPayload";

export function ExecutionRequestContent({
  request,
}: {
  request: ExecutionRequest;
}) {
  return (
    <div className="min-w-0 space-y-4">
      <RequestSummary request={request} />
      <DecisionMaterial request={request} />
      <CanonicalPayload request={request} />
    </div>
  );
}
