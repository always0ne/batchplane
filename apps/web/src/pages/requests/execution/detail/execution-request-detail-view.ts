import type { ExecutionAttempt, ExecutionRequest } from "@batchplane/ui-client";

export function executionRequestStatusHelpKey(
  request: ExecutionRequest,
): string {
  if (request.triggerType === "SCHEDULE") {
    return "detail.statusHelp.SCHEDULE_RECORDED";
  }
  if (request.status === "APPROVED") {
    if (request.approvalDecision?.currentAuthorization === "DENIED") {
      return "detail.values.approvalNotAuthorized";
    }
    if (request.approvalDecision?.currentAuthorization === "UNAVAILABLE") {
      return "detail.values.approvalAuthorizationUnavailable";
    }
  }
  return `detail.statusHelp.${request.status}`;
}

export function initialRequestFrom(
  state: unknown,
  requestLocator: string,
): ExecutionRequest | null {
  if (!state || typeof state !== "object") return null;
  const request = (state as { createdExecutionRequest?: unknown })
    .createdExecutionRequest;
  if (!request || typeof request !== "object") return null;
  const candidate = request as Partial<ExecutionRequest>;
  return candidate.requestLocator === requestLocator &&
    typeof candidate.requestId === "string" &&
    typeof candidate.evidence?.requestDigest === "string"
    ? (candidate as ExecutionRequest)
    : null;
}

export function postCreateErrorFrom(
  state: unknown,
  request: ExecutionRequest,
): boolean {
  if (!state || typeof state !== "object") return false;
  const error = (state as { executionRequestPostCreateError?: unknown })
    .executionRequestPostCreateError;
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    code?: unknown;
    requestDigest?: unknown;
    requestId?: unknown;
    requestLocator?: unknown;
  };
  return (
    candidate.code === "AUTO_APPROVAL_RECORDING_FAILED" &&
    candidate.requestDigest === request.evidence.requestDigest &&
    candidate.requestId === request.requestId &&
    candidate.requestLocator === request.requestLocator
  );
}

export function latestAttempt(
  request: ExecutionRequest,
): ExecutionAttempt | null {
  if (request.attempts.type !== "loaded") return null;

  return (
    [...request.attempts.attempts].sort((left, right) => {
      const chronology = attemptTimestamp(right) - attemptTimestamp(left);
      if (chronology !== 0) return chronology;
      return right.attempt - left.attempt;
    })[0] ?? null
  );
}

function attemptTimestamp(attempt: ExecutionAttempt): number {
  const value = attempt.completedAt ?? attempt.startedAt;
  const timestamp = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(timestamp) ? 0 : timestamp;
}
