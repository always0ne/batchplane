import type {
  FailureFollowUp,
  FailureFollowUpStatus,
  RepositoryIssueComment,
} from "@batchplane/domain";

export const failureFollowUpStatuses = [
  "OPEN",
  "INVESTIGATING",
  "RESOLVED",
  "ACCEPTED_RISK",
] as const satisfies readonly FailureFollowUpStatus[];

export function buildFailureFollowUpComment({
  actionTaken,
  author,
  batchId,
  createdAt,
  explanation,
  followUpId,
  owner,
  requestId,
  runId,
  status,
}: FailureFollowUp): string {
  return [
    "## BatchPlane Failure Follow-up",
    "",
    `- Status: ${status}`,
    `- Owner: ${owner}`,
    `- Author: @${author}`,
    `- Created at: ${createdAt}`,
    `- Run ID: \`${runId}\``,
    `- Request ID: \`${requestId}\``,
    `- Batch ID: \`${batchId}\``,
    "",
    "### Explanation",
    explanation,
    "",
    "### Action taken",
    actionTaken,
    "",
    "This failure follow-up evidence was recorded by BatchPlane Lite.",
    "",
    "<!-- batchplane:failure-follow-up",
    `followUpId=${followUpId}`,
    `runId=${runId}`,
    `requestId=${requestId}`,
    `batchId=${batchId}`,
    `status=${status}`,
    `owner=${owner}`,
    "-->",
  ].join("\n");
}

export function parseFailureFollowUps(
  comments: RepositoryIssueComment[],
): FailureFollowUp[] {
  return comments
    .map(parseFailureFollowUp)
    .filter((followUp): followUp is FailureFollowUp => followUp !== null);
}

function parseFailureFollowUp(
  comment: RepositoryIssueComment,
): FailureFollowUp | null {
  const marker = parseBatchPlaneMarker(comment.body, "failure-follow-up");
  const status = marker.get("status");
  const followUpId = marker.get("followUpId");
  const runId = marker.get("runId");
  const requestId = marker.get("requestId");
  const batchId = marker.get("batchId");
  const owner = marker.get("owner") || readMarkdownField(comment.body, "Owner");

  if (
    !followUpId ||
    !runId ||
    !requestId ||
    !batchId ||
    !owner ||
    !isFailureFollowUpStatus(status)
  ) {
    return null;
  }

  return {
    actionTaken: readMarkdownSection(comment.body, "Action taken"),
    author:
      readMarkdownField(comment.body, "Author").replace(/^@/, "") ||
      comment.author,
    batchId,
    createdAt:
      readMarkdownField(comment.body, "Created at") || comment.createdAt,
    explanation: readMarkdownSection(comment.body, "Explanation"),
    followUpId,
    owner,
    requestId,
    runId,
    status,
  };
}

function isFailureFollowUpStatus(
  value: string | undefined,
): value is FailureFollowUpStatus {
  return failureFollowUpStatuses.some((status) => status === value);
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

function readMarkdownSection(body: string, heading: string): string {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = body.match(
    new RegExp(
      `### ${escapedHeading}\\s*\\n([\\s\\S]*?)(?=\\n\\s*(?:### |This failure follow-up evidence|<!--)|$)`,
    ),
  );

  return match?.[1]?.trim() ?? "";
}
