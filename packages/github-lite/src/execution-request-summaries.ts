import type {
  GitHubIssue,
  GitHubIssueComment,
  GitHubLiteClient,
  RepoRef,
} from "./index.js";

export type RecentExecutionRequestSummary = {
  locator: string;
  requestDigest?: string;
  requestId?: string;
  requestedAt: string;
  requester: string;
  status:
    | "REQUESTED"
    | "APPROVED"
    | "REJECTED"
    | "DISPATCHING"
    | "DISPATCHED"
    | "DISPATCH_FAILED"
    | "GATE_BLOCKED";
  title: string;
};

/**
 * Projects raw GitHub Issues into the small, provider-neutral recent-request
 * view consumed by the Batch detail client. Malformed or legacy evidence is
 * intentionally omitted instead of asking the UI to interpret Issue bodies.
 */
export async function listRecentExecutionRequestSummaries(
  client: GitHubLiteClient,
  repository: RepoRef,
  batchId: string,
): Promise<RecentExecutionRequestSummary[]> {
  const issues = await client.listIssues({ ...repository, state: "all" });
  const recent = issues
    .map(toExecutionRequestCandidate)
    .filter(
      (summary): summary is ExecutionRequestCandidate =>
        summary?.batchId === batchId,
    )
    .sort((left, right) => right.number - left.number)
    .slice(0, 5);

  return Promise.all(
    recent.map(async (request) => {
      const comments = await client.listIssueComments({
        ...repository,
        issueNumber: request.number,
      });

      return {
        locator: request.locator,
        ...(request.requestDigest
          ? { requestDigest: request.requestDigest }
          : {}),
        ...(request.requestId ? { requestId: request.requestId } : {}),
        requestedAt: request.requestedAt,
        requester: request.requester,
        status: deriveExecutionRequestStatus(request, comments),
        title: request.title,
      };
    }),
  );
}

type ExecutionRequestCandidate = RecentExecutionRequestSummary & {
  batchId: string;
  labels: string[];
  number: number;
};

function toExecutionRequestCandidate(
  issue: GitHubIssue,
): ExecutionRequestCandidate | null {
  if (issue.isPullRequest) return null;

  const marker = parseExecutionRequestMarker(issue.body);
  const payload = readCanonicalPayload(issue.body);
  const batchId = marker.batchId;
  const status = marker.status;

  if (!batchId || !isExecutionRequestStatus(status) || !payload) return null;

  return {
    batchId,
    labels: issue.labels,
    locator: String(issue.number),
    number: issue.number,
    ...(marker.requestDigest ? { requestDigest: marker.requestDigest } : {}),
    ...(marker.requestId ? { requestId: marker.requestId } : {}),
    requestedAt: payload.requestedAt,
    requester: payload.requestedBy,
    status,
    title: issue.title,
  };
}

function deriveExecutionRequestStatus(
  request: ExecutionRequestCandidate,
  comments: GitHubIssueComment[],
): RecentExecutionRequestSummary["status"] {
  const approval = findLatestMatchingStatus(
    comments,
    request,
    "execution-approval",
    ["APPROVED", "REJECTED"],
  );
  const dispatcher =
    findLatestMatchingStatus(comments, request, "bgcp:dispatcher", [
      "DISPATCHING",
      "DISPATCHED",
      "DISPATCH_FAILED",
    ]) ??
    findLatestMatchingStatus(comments, request, "execution-dispatch", [
      "DISPATCHING",
      "DISPATCHED",
      "DISPATCH_FAILED",
    ]);
  const gate = findLatestMatchingStatus(comments, request, "gate-decision", [
    "allowed=false",
  ]);

  if (
    request.status === "REJECTED" ||
    hasBatchPlaneLabel(request.labels, "rejected") ||
    approval === "REJECTED"
  ) {
    return "REJECTED";
  }
  if (hasBatchPlaneLabel(request.labels, "gate-blocked") || gate) {
    return "GATE_BLOCKED";
  }
  if (
    hasBatchPlaneLabel(request.labels, "dispatch-failed") ||
    dispatcher === "DISPATCH_FAILED"
  ) {
    return "DISPATCH_FAILED";
  }
  if (
    hasBatchPlaneLabel(request.labels, "dispatched") ||
    dispatcher === "DISPATCHED"
  ) {
    return "DISPATCHED";
  }
  if (
    hasBatchPlaneLabel(request.labels, "dispatching") ||
    dispatcher === "DISPATCHING"
  ) {
    return "DISPATCHING";
  }
  if (approval === "APPROVED") return "APPROVED";

  return "REQUESTED";
}

function findLatestMatchingStatus(
  comments: GitHubIssueComment[],
  request: ExecutionRequestCandidate,
  kind:
    | "execution-approval"
    | "bgcp:dispatcher"
    | "execution-dispatch"
    | "gate-decision",
  accepted: readonly string[],
): string | undefined {
  const sorted = comments
    .slice()
    .sort(
      (left, right) =>
        right.createdAt.localeCompare(left.createdAt) || right.id - left.id,
    );

  for (const comment of sorted) {
    const marker = parseBatchPlaneMarker(comment.body, kind);
    if (!matchesRequest(marker, request)) continue;

    const status =
      kind === "gate-decision"
        ? marker.get("allowed") === "false"
          ? "allowed=false"
          : undefined
        : marker.get(kind === "execution-approval" ? "decision" : "status");
    if (status && accepted.includes(status)) return status;
  }

  return undefined;
}

function matchesRequest(
  marker: Map<string, string>,
  request: ExecutionRequestCandidate,
): boolean {
  return (
    marker.get("requestId") === request.requestId &&
    marker.get("batchId") === request.batchId &&
    marker.get("requestDigest") === request.requestDigest
  );
}

function hasBatchPlaneLabel(labels: string[], name: string): boolean {
  return (
    labels.includes(`batchplane:${name}`) ||
    labels.includes(`batchtrail:${name}`)
  );
}

function parseExecutionRequestMarker(body: string): {
  batchId?: string;
  requestDigest?: string;
  requestId?: string;
  status?: string;
} {
  const values = parseBatchPlaneMarker(body, "execution-request");

  return {
    batchId: values.get("batchId"),
    requestDigest: values.get("requestDigest"),
    requestId: values.get("requestId"),
    status: values.get("status"),
  };
}

function parseBatchPlaneMarker(
  body: string,
  kind: string,
): Map<string, string> {
  const marker = new Map<string, string>();
  const content = new RegExp(
    `<!--\\s*batch(?:plane|trail):${kind}\\s*([\\s\\S]*?)-->`,
    "u",
  ).exec(body)?.[1];

  for (const line of content?.split("\n") ?? []) {
    const separator = line.indexOf("=");
    if (separator > 0) {
      marker.set(
        line.slice(0, separator).trim(),
        line.slice(separator + 1).trim(),
      );
    }
  }

  return marker;
}

function readCanonicalPayload(
  body: string,
): { requestedAt: string; requestedBy: string } | null {
  const encoded = /### Canonical payload\s*```json\s*([\s\S]*?)\s*```/u.exec(
    body,
  )?.[1];

  if (!encoded) return null;

  try {
    const spec = (
      JSON.parse(encoded) as {
        spec?: { requestedAt?: unknown; requestedBy?: unknown };
      }
    ).spec;

    return typeof spec?.requestedAt === "string" &&
      typeof spec.requestedBy === "string" &&
      spec.requestedAt.trim() &&
      spec.requestedBy.trim()
      ? { requestedAt: spec.requestedAt, requestedBy: spec.requestedBy }
      : null;
  } catch {
    return null;
  }
}

function isExecutionRequestStatus(
  status: string | undefined,
): status is RecentExecutionRequestSummary["status"] {
  return [
    "REQUESTED",
    "APPROVED",
    "REJECTED",
    "DISPATCHING",
    "DISPATCHED",
    "DISPATCH_FAILED",
    "GATE_BLOCKED",
  ].includes(status ?? "");
}
