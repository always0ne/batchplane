import type { GitHubPullRequest } from "@batchtrail/github-lite";

export function isRegistrationApprovalRequest(
  pullRequest: GitHubPullRequest,
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
  pullRequest: GitHubPullRequest;
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
  pullRequest: GitHubPullRequest;
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
