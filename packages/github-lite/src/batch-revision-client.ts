import type { GitHubRepositoryContext } from "./github-types.js";
import {
  verifyApprovedBatchRevision,
  type ApprovedBatchRevisionBinding,
} from "./approved-batch-revision.js";
import { listRecentExecutionRequestSummaries } from "./execution-request-summaries.js";

/** Product adapter for authoritative Batch revision reads at UI/mutation edges. */
export function createGitHubLiteBatchRevisionClient({
  client,
  repositoryRef: repository,
}: GitHubRepositoryContext) {
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
