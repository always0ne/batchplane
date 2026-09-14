import type { BatchPlaneClient } from "@batchplane/ui-client";
import { parseExecutionRequestDetail } from "./execution-approval-legacy.js";
import {
  compareAuditItemsDesc,
  toExecutionRequestAuditItems,
  toInspectedRunAuditItem,
  toRegistrationAuditItems,
} from "./execution-audit-projection.js";
import { listExecutionRunFacts } from "./execution-run-client.js";
import { projectFailureFollowUpsForRequests } from "./failure-follow-up-projection.js";
import type { GitHubIssue, GitHubPullRequest } from "./index.js";
import {
  toRepositoryIssue,
  toRepositoryIssueComment,
  toRepositoryPullRequest,
  type ExecutionInspectionContext,
  type ExecutionRequestForRun,
} from "./inspection-context.js";

export function createGitHubLiteAuditClient(
  context: ExecutionInspectionContext,
): Pick<BatchPlaneClient, "listAuditTimeline"> {
  return {
    async listAuditTimeline({ limit = 50 } = {}) {
      const records = await loadAuditRecords(context);
      const [runs, failureFollowUps] = await Promise.all([
        listExecutionRunFacts(
          context,
          { limit: Math.max(limit, 20) },
          {
            requests: records.executionRequests,
            includeFollowUps: false,
            retainSourceWindow: true,
          },
        ),
        projectFailureFollowUpsForRequests({
          ...context,
          includeReviewCapabilities: false,
          requests: records.executionRequests,
        }),
      ]);
      return [
        ...records.registrationItems,
        ...records.executionRequests.flatMap((request) =>
          toExecutionRequestAuditItems({
            request,
            failureFollowUps: failureFollowUps.get(request.issue.number) ?? [],
          }),
        ),
        ...runs.map(toInspectedRunAuditItem),
      ]
        .sort(compareAuditItemsDesc)
        .slice(0, limit);
    },
  };
}

async function loadAuditRecords(context: ExecutionInspectionContext) {
  const { client, repositoryRef } = context;
  const [issues, pullRequests] = await Promise.all([
    client.listIssues({ ...repositoryRef, state: "all" }),
    client.listPullRequests({ ...repositoryRef, state: "all" }),
  ]);
  const [executionRecords, registrationRecords] = await Promise.all([
    loadRecordComments(context, issues),
    loadRecordComments(context, pullRequests),
  ]);
  const executionRequests = executionRecords
    .map(({ record, comments }) =>
      parseExecutionRequestDetail(toRepositoryIssue(record), comments),
    )
    .filter((request): request is ExecutionRequestForRun => request !== null);
  const registrationItems = registrationRecords.flatMap(
    ({ record, comments }) =>
      toRegistrationAuditItems(toRepositoryPullRequest(record), comments),
  );
  return { executionRequests, registrationItems };
}

function loadRecordComments<T extends GitHubIssue | GitHubPullRequest>(
  { client, repositoryRef }: ExecutionInspectionContext,
  records: T[],
) {
  return Promise.all(
    records.map(async (record) => ({
      record,
      comments: (
        await client.listIssueComments({
          ...repositoryRef,
          issueNumber: record.number,
        })
      ).map(toRepositoryIssueComment),
    })),
  );
}
