import type {
  FailureFollowUp,
  FailureFollowUpReviewDecision,
  FailureFollowUpReviewDecisionValue,
  FailureFollowUpReviewStatus,
  FailureFollowUpStatus,
  RepositoryIssueComment,
  WorkspaceApprovalMode,
} from "@batchplane/domain";

export const failureFollowUpStatuses = [
  "OPEN",
  "INVESTIGATING",
  "RESOLVED",
  "ACCEPTED_RISK",
] as const satisfies readonly FailureFollowUpStatus[];

export const failureFollowUpReviewDecisions = [
  "APPROVED",
  "REJECTED",
  "CHANGES_REQUESTED",
] as const satisfies readonly FailureFollowUpReviewDecisionValue[];

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
    "- Review status: AWAITING_REVIEW",
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
    "reviewStatus=AWAITING_REVIEW",
    `owner=${owner}`,
    "-->",
  ].join("\n");
}

export function buildFailureFollowUpReviewComment({
  approvalMode,
  batchId,
  decision,
  followUpId,
  reason,
  requestId,
  reviewedAt,
  reviewer,
  reviewId,
  runId,
  selfReview,
}: FailureFollowUpReviewDecision): string {
  return [
    "## BatchPlane Failure Follow-up Review",
    "",
    `- Decision: ${decision}`,
    `- Reviewer: @${reviewer}`,
    `- Reviewed at: ${reviewedAt}`,
    ...(approvalMode ? [`- Approval mode: ${approvalMode}`] : []),
    ...(selfReview ? ["- Self review: ALLOWED_BY_WORKSPACE_POLICY"] : []),
    `- Follow-up ID: \`${followUpId}\``,
    `- Run ID: \`${runId}\``,
    `- Request ID: \`${requestId}\``,
    `- Batch ID: \`${batchId}\``,
    "",
    "### Reason",
    reason,
    "",
    "This failure follow-up review evidence was recorded by BatchPlane Lite.",
    "",
    "<!-- batchplane:failure-follow-up-review",
    `reviewId=${reviewId}`,
    `followUpId=${followUpId}`,
    `runId=${runId}`,
    `requestId=${requestId}`,
    `batchId=${batchId}`,
    `decision=${decision}`,
    `reviewer=${reviewer}`,
    ...(approvalMode ? [`approvalMode=${approvalMode}`] : []),
    ...(selfReview ? ["selfReview=true"] : []),
    "-->",
  ].join("\n");
}

export function parseFailureFollowUps(
  comments: RepositoryIssueComment[],
  reviews = parseFailureFollowUpReviews(comments),
): FailureFollowUp[] {
  const reviewsByFollowUpId = groupReviewsByFollowUpId(reviews);

  return comments
    .map((comment) =>
      parseFailureFollowUp(comment, reviewsByFollowUpId.getFollowUpReviews),
    )
    .filter((followUp): followUp is FailureFollowUp => followUp !== null);
}

export function parseFailureFollowUpReviews(
  comments: RepositoryIssueComment[],
): FailureFollowUpReviewDecision[] {
  return comments
    .map(parseFailureFollowUpReview)
    .filter(
      (review): review is FailureFollowUpReviewDecision => review !== null,
    )
    .sort(compareReviews);
}

function parseFailureFollowUp(
  comment: RepositoryIssueComment,
  getFollowUpReviews: (followUpId: string) => FailureFollowUpReviewDecision[],
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

  const reviews = getFollowUpReviews(followUpId);

  return {
    actionTaken: readMarkdownSection(comment.body, "Action taken"),
    // The comment author is the only reliable Lite identity for the record.
    author: comment.author,
    batchId,
    createdAt: comment.createdAt,
    explanation: readMarkdownSection(comment.body, "Explanation"),
    followUpId,
    owner,
    requestId,
    reviewStatus: deriveFailureFollowUpReviewStatus(reviews),
    reviews,
    runId,
    status,
  };
}

function parseFailureFollowUpReview(
  comment: RepositoryIssueComment,
): FailureFollowUpReviewDecision | null {
  const marker = parseBatchPlaneMarker(
    comment.body,
    "failure-follow-up-review",
  );
  const reviewId = marker.get("reviewId");
  const followUpId = marker.get("followUpId");
  const runId = marker.get("runId");
  const requestId = marker.get("requestId");
  const batchId = marker.get("batchId");
  const decision = marker.get("decision");
  const claimedReviewer =
    marker.get("reviewer") ||
    readMarkdownField(comment.body, "Reviewer").replace(/^@/, "");
  const approvalMode = marker.get("approvalMode");

  if (
    !reviewId ||
    !followUpId ||
    !runId ||
    !requestId ||
    !batchId ||
    !isFailureFollowUpReviewDecision(decision)
  ) {
    return null;
  }

  // Marker fields are descriptive only. A mismatched claimed reviewer must
  // never become a review record, even before runtime permission verification.
  if (claimedReviewer && claimedReviewer !== comment.author) {
    return null;
  }

  return {
    ...(isWorkspaceApprovalMode(approvalMode) ? { approvalMode } : {}),
    batchId,
    decision,
    followUpId,
    reason: readMarkdownSection(comment.body, "Reason"),
    requestId,
    reviewedAt: comment.createdAt,
    reviewer: comment.author,
    reviewId,
    runId,
    selfReview: marker.get("selfReview") === "true",
  };
}

function isFailureFollowUpStatus(
  value: string | undefined,
): value is FailureFollowUpStatus {
  return failureFollowUpStatuses.some((status) => status === value);
}

function isFailureFollowUpReviewDecision(
  value: string | undefined,
): value is FailureFollowUpReviewDecisionValue {
  return failureFollowUpReviewDecisions.some((decision) => decision === value);
}

function isWorkspaceApprovalMode(
  value: string | undefined,
): value is WorkspaceApprovalMode {
  return (
    value === "SELF_APPROVAL_BLOCKED" ||
    value === "SELF_APPROVAL_ALLOWED" ||
    value === "AUTO_APPROVE"
  );
}

function groupReviewsByFollowUpId(reviews: FailureFollowUpReviewDecision[]) {
  const reviewsByFollowUpId = new Map<
    string,
    FailureFollowUpReviewDecision[]
  >();

  for (const review of reviews) {
    reviewsByFollowUpId.set(review.followUpId, [
      ...(reviewsByFollowUpId.get(review.followUpId) ?? []),
      review,
    ]);
  }

  return {
    getFollowUpReviews(followUpId: string): FailureFollowUpReviewDecision[] {
      return reviewsByFollowUpId.get(followUpId) ?? [];
    },
  };
}

function deriveFailureFollowUpReviewStatus(
  reviews: FailureFollowUpReviewDecision[],
): FailureFollowUpReviewStatus {
  return reviews[reviews.length - 1]?.decision ?? "AWAITING_REVIEW";
}

function compareReviews(
  left: FailureFollowUpReviewDecision,
  right: FailureFollowUpReviewDecision,
): number {
  return reviewTimestamp(left.reviewedAt) - reviewTimestamp(right.reviewedAt);
}

function reviewTimestamp(value: string): number {
  const timestamp = Date.parse(value);

  return Number.isNaN(timestamp) ? 0 : timestamp;
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
      `### ${escapedHeading}\\s*\\n([\\s\\S]*?)(?=\\n\\s*(?:### |This failure follow-up(?: review)? evidence|<!--)|$)`,
    ),
  );

  return match?.[1]?.trim() ?? "";
}
