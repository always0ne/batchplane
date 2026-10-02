import type { ExecutionAttempt, ExecutionRequest } from "@batchplane/ui-client";

import { ControlChecks } from "./ControlChecks";
import { DispatcherEvidence } from "./DispatcherEvidence";

export function ExecutionRequestEvidence({
  attempt,
  request,
}: {
  attempt: ExecutionAttempt | null;
  request: ExecutionRequest;
}) {
  return (
    <>
      <ControlChecks request={request} />
      <DispatcherEvidence attempt={attempt} request={request} />
    </>
  );
}
