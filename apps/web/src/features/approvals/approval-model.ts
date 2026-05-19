import type {
  RepositoryIssue,
  RepositoryPullRequest,
  RunnerLabel,
} from "@batchtrail/domain";

export type ExecutionApprovalRequest = {
  batchId: string;
  execution?: {
    artifactPath?: string;
    command: string;
    gateRequired: boolean;
    runsOn: RunnerLabel;
  };
  expiresAt: string;
  issue: RepositoryIssue;
  reason: string;
  requestDigest: string;
  requestedAt: string;
  requestedBy: string;
  requestId: string;
  workflow?: {
    path: string;
    ref: string;
  };
};

const nonActionableExecutionLabels = new Set([
  "batchtrail:dispatch-failed",
  "batchtrail:dispatched",
  "batchtrail:dispatching",
  "batchtrail:gate-blocked",
  "batchtrail:rejected",
]);

export function isRegistrationApprovalRequest(
  pullRequest: RepositoryPullRequest,
): boolean {
  return (
    pullRequest.state === "open" &&
    (pullRequest.head.startsWith("batchtrail/register/") ||
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
    "## BatchTrail Registration Approval",
    "",
    `- Decision: APPROVED`,
    `- Approver: @${approver}`,
    `- Approved at: ${approvedAt.toISOString()}`,
    `- Pull request: #${pullRequest.number}`,
    "",
    "This approval evidence was recorded by BatchTrail Repo Mode.",
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
    "## BatchTrail Registration Approval",
    "",
    `- Decision: REJECTED`,
    `- Rejector: @${rejector}`,
    `- Rejected at: ${rejectedAt.toISOString()}`,
    `- Pull request: #${pullRequest.number}`,
    "",
    "This rejection evidence was recorded by BatchTrail Repo Mode.",
  ].join("\n");
}

export function parseExecutionApprovalRequest(
  issue: RepositoryIssue,
): ExecutionApprovalRequest | null {
  if (
    issue.state !== "open" ||
    issue.isPullRequest ||
    !issue.body.includes("batchtrail:execution-request") ||
    issue.labels.some((label) => nonActionableExecutionLabels.has(label))
  ) {
    return null;
  }

  const marker = parseBatchTrailMarker(issue.body, "execution-request");
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
    status !== "REQUESTED" ||
    !requestId ||
    !batchId ||
    !requestDigest ||
    !requestDigest.startsWith("sha256:")
  ) {
    return null;
  }

  return {
    batchId,
    ...(payload?.spec?.execution ? { execution: payload.spec.execution } : {}),
    expiresAt: readMarkdownField(issue.body, "Expires at"),
    issue,
    reason: payload?.spec?.reason ?? "",
    requestDigest,
    requestedAt: readMarkdownField(issue.body, "Requested at"),
    requestedBy: readMarkdownField(issue.body, "Requested by").replace(
      /^@/,
      "",
    ),
    requestId,
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
    "## BatchTrail Execution Approval",
    "",
    "- Decision: APPROVED",
    `- Approver: @${approver}`,
    `- Approved at: ${approvedAt.toISOString()}`,
    `- Request ID: \`${request.requestId}\``,
    `- Batch ID: \`${request.batchId}\``,
    `- Request digest: \`${request.requestDigest}\``,
    "",
    "This approval evidence was recorded by BatchTrail Repo Mode.",
    "",
    "<!-- batchtrail:execution-approval",
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
  request,
}: {
  rejectedAt: Date;
  rejector: string;
  request: ExecutionApprovalRequest;
}): string {
  return [
    "## BatchTrail Execution Approval",
    "",
    "- Decision: REJECTED",
    `- Rejector: @${rejector}`,
    `- Rejected at: ${rejectedAt.toISOString()}`,
    `- Request ID: \`${request.requestId}\``,
    `- Batch ID: \`${request.batchId}\``,
    `- Request digest: \`${request.requestDigest}\``,
    "",
    "This rejection evidence was recorded by BatchTrail Repo Mode.",
    "",
    "<!-- batchtrail:execution-approval",
    "decision=REJECTED",
    `requestId=${request.requestId}`,
    `batchId=${request.batchId}`,
    `requestDigest=${request.requestDigest}`,
    "-->",
  ].join("\n");
}

function parseBatchTrailMarker(
  body: string,
  kind: string,
): Map<string, string> {
  const marker = new Map<string, string>();
  const match = body.match(
    new RegExp(`<!--\\s*batchtrail:${kind}\\s*([\\s\\S]*?)-->`),
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
