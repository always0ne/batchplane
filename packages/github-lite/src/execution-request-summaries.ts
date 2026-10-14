import {
  parseExecutionRequestDetail,
  type ExecutionApprovalRequest,
  type ExecutionRequestDisplayStatus,
} from "./execution-approval-legacy.js";
import { observePendingRequestDelivery } from "./execution-request-delivery.js";
import type { GitHubLiteClient, RepoRef } from "./github-types.js";
import {
  toRepositoryIssue,
  toRepositoryIssueComment,
} from "./inspection-context.js";

export type RecentExecutionRequestSummary = {
  scheduled?: boolean;
  locator: string;
  requestDigest?: string;
  requestId?: string;
  requestedAt: string;
  requester: string;
  status: ExecutionRequestDisplayStatus;
  title: string;
};

export async function listRecentExecutionRequestSummaries(
  client: GitHubLiteClient,
  repository: RepoRef,
  batchId: string,
): Promise<RecentExecutionRequestSummary[]> {
  const issues = await client.listIssues({ ...repository, state: "all" });
  const recent = issues
    .map((issue) => parseExecutionRequestDetail(toRepositoryIssue(issue)))
    .filter(
      (request): request is ExecutionApprovalRequest =>
        request?.batchId === batchId && Boolean(request.canonicalPayload),
    )
    .sort((left, right) => right.issue.number - left.issue.number)
    .slice(0, 5);
  const requests = await Promise.all(
    recent.map(async (request) => {
      const comments = await client.listIssueComments({
        ...repository,
        issueNumber: request.issue.number,
      });
      return parseExecutionRequestDetail(
        request.issue,
        comments.map(toRepositoryIssueComment),
      )!;
    }),
  );
  const observed = await observePendingRequestDelivery(
    { client, repositoryRef: repository },
    requests,
  );
  return observed.map((request) => ({
    ...(request.triggerType === "SCHEDULE" ? { scheduled: true } : {}),
    locator: String(request.issue.number),
    requestDigest: request.requestDigest,
    requestId: request.requestId,
    requestedAt: request.requestedAt,
    requester: request.requestedBy,
    status: request.status,
    title: request.issue.title,
  }));
}
