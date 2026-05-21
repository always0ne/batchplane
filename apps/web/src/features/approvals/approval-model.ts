import type {
  RepositoryIssue,
  RepositoryIssueComment,
  RepositoryPullRequest,
  RunnerLabel,
} from "@batchplane/domain";

export type ExecutionRequestDisplayStatus =
  | "REQUESTED"
  | "APPROVED"
  | "REJECTED"
  | "DISPATCHING"
  | "DISPATCHED"
  | "DISPATCH_FAILED"
  | "GATE_BLOCKED";

export type ExecutionApprovalRequest = {
  batchId: string;
  canonicalPayload: CanonicalExecutionPayload | null;
  comments: RepositoryIssueComment[];
  dispatcherStatus?: ExecutionDispatcherStatus;
  execution?: {
    artifactPath?: string;
    command: string;
    gateRequired: boolean;
    runsOn: RunnerLabel;
  };
  expiresAt: string;
  gateDecision?: ExecutionGateDecision;
  issue: RepositoryIssue;
  reason: string;
  approvalDecision?: ExecutionApprovalDecision;
  requestDigest: string;
  requestedAt: string;
  requestedBy: string;
  requestId: string;
  status: ExecutionRequestDisplayStatus;
  workflow?: {
    path: string;
    ref: string;
  };
};

export type ExecutionApprovalDecision = {
  decision: "APPROVED" | "REJECTED";
  actor: string;
  decidedAt: string;
  reason: string;
};

export type ExecutionDispatcherStatus = {
  actor: string;
  createdAt: string;
  status: "DISPATCHING" | "DISPATCHED" | "DISPATCH_FAILED";
};

export type ExecutionGateDecision = {
  actor: string;
  allowed: boolean;
  createdAt: string;
  reasonCode: string;
};

export function isRegistrationApprovalRequest(
  pullRequest: RepositoryPullRequest,
): boolean {
  return (
    pullRequest.state === "open" &&
    (pullRequest.head.startsWith("batchplane/register/") ||
      pullRequest.head.startsWith("batchtrail/register/") ||
      pullRequest.title.startsWith("Register batch "))
  );
}

export function buildRegistrationApprovalComment({
  approvedAt,
  approver,
  pullRequest,
}: {
  approvedAt: Date;
  approver: string;
  pullRequest: RepositoryPullRequest;
}): string {
  return [
    "## BatchPlane Registration Approval",
    "",
    `- Decision: APPROVED`,
    `- Approver: @${approver}`,
    `- Approved at: ${approvedAt.toISOString()}`,
    `- Pull request: #${pullRequest.number}`,
    "",
    "This approval evidence was recorded by BatchPlane Lite.",
  ].join("\n");
}

export function buildRegistrationRejectionComment({
  rejectedAt,
  rejector,
  pullRequest,
}: {
  rejectedAt: Date;
  rejector: string;
  pullRequest: RepositoryPullRequest;
}): string {
  return [
    "## BatchPlane Registration Approval",
    "",
    `- Decision: REJECTED`,
    `- Rejector: @${rejector}`,
    `- Rejected at: ${rejectedAt.toISOString()}`,
    `- Pull request: #${pullRequest.number}`,
    "",
    "This rejection evidence was recorded by BatchPlane Lite.",
  ].join("\n");
}

export function parseExecutionApprovalRequest(
  issue: RepositoryIssue,
  comments: RepositoryIssueComment[] = [],
): ExecutionApprovalRequest | null {
  const request = parseExecutionRequestDetail(issue, comments);

  return issue.state === "open" && request?.status === "REQUESTED"
    ? request
    : null;
}

export function parseExecutionRequestDetail(
  issue: RepositoryIssue,
  comments: RepositoryIssueComment[] = [],
): ExecutionApprovalRequest | null {
  if (issue.isPullRequest) {
    return null;
  }

  const marker = parseBatchPlaneMarker(issue.body, "execution-request");

  if (marker.size === 0) {
    return null;
  }

  const payload = parseCanonicalPayload(issue.body);
  const requestId =
    marker.get("requestId") ?? readMarkdownField(issue.body, "Request ID");
  const batchId =
    marker.get("batchId") ?? readMarkdownField(issue.body, "Batch ID");
  const requestDigest =
    marker.get("requestDigest") ??
    readMarkdownField(issue.body, "Request digest");
  const status =
    marker.get("status") ?? readMarkdownField(issue.body, "Status");

  if (
    (status !== "REQUESTED" && status !== "REJECTED") ||
    !requestId ||
    !batchId ||
    !requestDigest ||
    !requestDigest.startsWith("sha256:")
  ) {
    return null;
  }

  const approvalDecision = findExecutionApprovalDecision(comments);
  const dispatcherStatus = findLatestDispatcherStatus(comments);
  const gateDecision = findLatestGateDecision(comments);
  const displayStatus = getExecutionRequestDisplayStatus({
    approvalDecision,
    dispatcherStatus,
    gateDecision,
    issue,
    markerStatus: status,
  });

  return {
    batchId,
    canonicalPayload: payload,
    comments,
    ...(dispatcherStatus ? { dispatcherStatus } : {}),
    ...(payload?.spec?.execution ? { execution: payload.spec.execution } : {}),
    expiresAt: readMarkdownField(issue.body, "Expires at"),
    ...(gateDecision ? { gateDecision } : {}),
    issue,
    reason: payload?.spec?.reason ?? "",
    ...(approvalDecision ? { approvalDecision } : {}),
    requestDigest,
    requestedAt: readMarkdownField(issue.body, "Requested at"),
    requestedBy: readMarkdownField(issue.body, "Requested by").replace(
      /^@/,
      "",
    ),
    requestId,
    status: displayStatus,
    ...(payload?.spec?.workflow ? { workflow: payload.spec.workflow } : {}),
  };
}

export function buildExecutionApprovalComment({
  approvedAt,
  approver,
  request,
}: {
  approvedAt: Date;
  approver: string;
  request: ExecutionApprovalRequest;
}): string {
  return [
    `/bgcp approve requestDigest=${request.requestDigest}`,
    "",
    "## BatchPlane Execution Approval",
    "",
    "- Decision: APPROVED",
    `- Approver: @${approver}`,
    `- Approved at: ${approvedAt.toISOString()}`,
    `- Request ID: \`${request.requestId}\``,
    `- Batch ID: \`${request.batchId}\``,
    `- Request digest: \`${request.requestDigest}\``,
    "",
    "This approval evidence was recorded by BatchPlane Lite.",
    "",
    "<!-- batchplane:execution-approval",
    "decision=APPROVED",
    `requestId=${request.requestId}`,
    `batchId=${request.batchId}`,
    `requestDigest=${request.requestDigest}`,
    "-->",
  ].join("\n");
}

export function buildExecutionRejectionComment({
  rejectedAt,
  rejector,
  reason,
  request,
}: {
  rejectedAt: Date;
  rejector: string;
  reason: string;
  request: ExecutionApprovalRequest;
}): string {
  return [
    "## BatchPlane Execution Approval",
    "",
    "- Decision: REJECTED",
    `- Rejector: @${rejector}`,
    `- Rejected at: ${rejectedAt.toISOString()}`,
    `- Reason: ${reason}`,
    `- Request ID: \`${request.requestId}\``,
    `- Batch ID: \`${request.batchId}\``,
    `- Request digest: \`${request.requestDigest}\``,
    "",
    "This rejection evidence was recorded by BatchPlane Lite.",
    "",
    "<!-- batchplane:execution-approval",
    "decision=REJECTED",
    `requestId=${request.requestId}`,
    `batchId=${request.batchId}`,
    `requestDigest=${request.requestDigest}`,
    "-->",
  ].join("\n");
}

function findExecutionApprovalDecision(
  comments: RepositoryIssueComment[],
): ExecutionApprovalDecision | undefined {
  for (let index = comments.length - 1; index >= 0; index -= 1) {
    const comment = comments[index];

    if (!comment) {
      continue;
    }

    const marker = parseBatchPlaneMarker(comment.body, "execution-approval");
    const decision = marker.get("decision");

    if (decision !== "APPROVED" && decision !== "REJECTED") {
      continue;
    }

    const actor =
      readMarkdownField(
        comment.body,
        decision === "APPROVED" ? "Approver" : "Rejector",
      ).replace(/^@/, "") || comment.author;
    const decidedAt = readMarkdownField(
      comment.body,
      decision === "APPROVED" ? "Approved at" : "Rejected at",
    );

    return {
      actor,
      decidedAt,
      decision,
      reason: readMarkdownField(comment.body, "Reason"),
    };
  }

  return undefined;
}

function findLatestDispatcherStatus(
  comments: RepositoryIssueComment[],
): ExecutionDispatcherStatus | undefined {
  for (let index = comments.length - 1; index >= 0; index -= 1) {
    const comment = comments[index];

    if (!comment) {
      continue;
    }

    const marker = parseBatchPlaneMarker(comment.body, "bgcp:dispatcher");
    const status = marker.get("status");

    if (
      status !== "DISPATCHING" &&
      status !== "DISPATCHED" &&
      status !== "DISPATCH_FAILED"
    ) {
      continue;
    }

    return {
      actor: comment.author,
      createdAt: comment.createdAt,
      status,
    };
  }

  return undefined;
}

function findLatestGateDecision(
  comments: RepositoryIssueComment[],
): ExecutionGateDecision | undefined {
  for (let index = comments.length - 1; index >= 0; index -= 1) {
    const comment = comments[index];

    if (!comment) {
      continue;
    }

    const marker = parseBatchPlaneMarker(comment.body, "gate-decision");
    const allowed = marker.get("allowed");
    const reasonCode = marker.get("reasonCode");

    if (allowed !== "true" && allowed !== "false") {
      continue;
    }

    return {
      actor: comment.author,
      allowed: allowed === "true",
      createdAt: comment.createdAt,
      reasonCode: reasonCode || readMarkdownField(comment.body, "Reason"),
    };
  }

  return undefined;
}

function getExecutionRequestDisplayStatus({
  approvalDecision,
  dispatcherStatus,
  gateDecision,
  issue,
  markerStatus,
}: {
  approvalDecision?: ExecutionApprovalDecision;
  dispatcherStatus?: ExecutionDispatcherStatus;
  gateDecision?: ExecutionGateDecision;
  issue: RepositoryIssue;
  markerStatus: string;
}): ExecutionRequestDisplayStatus {
  if (
    markerStatus === "REJECTED" ||
    hasBatchPlaneLabel(issue.labels, "rejected") ||
    approvalDecision?.decision === "REJECTED"
  ) {
    return "REJECTED";
  }

  if (
    hasBatchPlaneLabel(issue.labels, "gate-blocked") ||
    gateDecision?.allowed === false
  ) {
    return "GATE_BLOCKED";
  }

  if (
    hasBatchPlaneLabel(issue.labels, "dispatch-failed") ||
    dispatcherStatus?.status === "DISPATCH_FAILED"
  ) {
    return "DISPATCH_FAILED";
  }

  if (
    hasBatchPlaneLabel(issue.labels, "dispatched") ||
    dispatcherStatus?.status === "DISPATCHED"
  ) {
    return "DISPATCHED";
  }

  if (
    hasBatchPlaneLabel(issue.labels, "dispatching") ||
    dispatcherStatus?.status === "DISPATCHING"
  ) {
    return "DISPATCHING";
  }

  if (approvalDecision?.decision === "APPROVED") {
    return "APPROVED";
  }

  return "REQUESTED";
}

function hasBatchPlaneLabel(labels: string[], name: string): boolean {
  return (
    labels.includes(`batchplane:${name}`) ||
    labels.includes(`batchtrail:${name}`)
  );
}

function parseBatchPlaneMarker(
  body: string,
  kind: string,
): Map<string, string> {
  const marker = new Map<string, string>();
  const match = body.match(
    new RegExp(`<!--\\s*batch(?:plane|trail):${kind}\\s*([\\s\\S]*?)-->`),
  );

  if (!match?.[1]) {
    return marker;
  }

  for (const line of match[1].split("\n")) {
    const separatorIndex = line.indexOf("=");

    if (separatorIndex < 0) {
      continue;
    }

    marker.set(
      line.slice(0, separatorIndex).trim(),
      line.slice(separatorIndex + 1).trim(),
    );
  }

  return marker;
}

function readMarkdownField(body: string, label: string): string {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = body.match(new RegExp(`- ${escapedLabel}:\\s*(.+)`));
  const value = match?.[1]?.trim() ?? "";

  return value.replace(/^`|`$/g, "").trim();
}

type CanonicalExecutionPayload = {
  spec?: {
    batch?: {
      environment?: string;
    };
    execution?: {
      artifactPath?: string;
      command: string;
      gateRequired: boolean;
      runsOn: RunnerLabel;
    };
    reason?: string;
    workflow?: {
      path: string;
      ref: string;
    };
  };
};

function parseCanonicalPayload(body: string): CanonicalExecutionPayload | null {
  const match = body.match(
    /### Canonical payload\s*```json\s*([\s\S]*?)\s*```/,
  );

  if (!match?.[1]) {
    return null;
  }

  try {
    return JSON.parse(match[1]) as CanonicalExecutionPayload;
  } catch {
    return null;
  }
}
