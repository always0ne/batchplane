import type { ExecutionRequestStatus } from "@batchplane/domain";
import type { ExecutionApprovalRequest } from "./execution-approval-legacy.js";
import type { GitHubRepositoryContext } from "./github-types.js";
import { listExecutionRunFacts } from "./execution-run-client.js";

type RequestDelivery = {
  requestId: string;
  triggerType: "MANUAL" | "SCHEDULE";
  status: ExecutionRequestStatus | "GATE_BLOCKED";
};

/** An existing correlated execution establishes delivery, not approval or success. */
export function withObservedExecutionDelivery<T extends RequestDelivery>(
  request: T,
  executions: ReadonlyArray<{
    observedRequestId?: string;
    gateDecision?: { allowed: boolean };
  }>,
): T {
  if (
    request.triggerType === "SCHEDULE" ||
    !["DISPATCHING", "DISPATCH_UNCONFIRMED"].includes(request.status) ||
    !executions.some(
      (execution) =>
        execution.observedRequestId === request.requestId &&
        execution.gateDecision?.allowed !== false,
    )
  ) {
    return request;
  }
  return { ...request, status: "DISPATCHED" };
}

export async function observePendingRequestDelivery(
  context: GitHubRepositoryContext,
  requests: ExecutionApprovalRequest[],
): Promise<ExecutionApprovalRequest[]> {
  if (
    !requests.some((request) =>
      ["DISPATCHING", "DISPATCH_UNCONFIRMED"].includes(request.status),
    )
  )
    return requests;
  try {
    const executions = await listExecutionRunFacts(
      context,
      { limit: 100 },
      { requests, includeFollowUps: false },
    );
    return requests.map((request) =>
      withObservedExecutionDelivery(request, executions),
    );
  } catch {
    // Unavailable observation must preserve the dispatch lock, not invent a result.
    return requests;
  }
}
