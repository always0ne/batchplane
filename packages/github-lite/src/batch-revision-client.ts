import {
  verifyApprovedBatchRevision,
  type ApprovedBatchRevisionBinding,
} from "./approved-batch-revision.js";
import { listRecentExecutionRequestSummaries } from "./execution-request-summaries.js";
import { createGitHubLiteClient, type GitHubLiteClient } from "./index.js";

/** Product adapter for authoritative Batch revision reads at UI/mutation edges. */
export function createGitHubLiteBatchRevisionClient(
  session: { owner: string; repo: string; token: string },
  client: GitHubLiteClient = createGitHubLiteClient({ token: session.token }),
) {
  const repository = { owner: session.owner, repo: session.repo };

  return {
    verifyApprovedBatchRevision(input: {
      batchId: string;
      executionWorkflowSha?: string;
      expectedRevision?: ApprovedBatchRevisionBinding;
    }) {
      return verifyApprovedBatchRevision({ client, repository, ...input });
    },
    listRecentExecutionRequestSummaries(input: { batchId: string }) {
      return listRecentExecutionRequestSummaries(
        client,
        repository,
        input.batchId,
      );
    },
  };
}
