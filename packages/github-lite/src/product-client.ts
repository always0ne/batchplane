import type { GitHubRepositoryContext } from "./github-types.js";
import type { BatchPlaneClient } from "@batchplane/ui-client";
import { createGitHubLiteBatchReadClient } from "./batch-plane-client.js";
import { createGitHubLiteBatchRevisionClient } from "./batch-revision-client.js";
import { createGitHubLiteDashboardClient } from "./dashboard-client.js";
import { createGitHubLiteExecutionApprovalClient } from "./execution-approval-client.js";
import { createGitHubLiteExecutionInspectionClient } from "./execution-inspection-client.js";
import { createGovernedChangeOperations } from "./governed-change-operations.js";

import { createGitHubLiteWorkspaceClient } from "./workspace-client.js";

/** Composes product capabilities over one concrete GitHub repository context. */
export function createGitHubLiteBatchPlaneClient(
  context: GitHubRepositoryContext,
): BatchPlaneClient {
  const governedChanges = createGovernedChangeOperations(
    context.repositoryRef,
    context.client,
  );
  const requests = createGitHubLiteExecutionApprovalClient(context);
  const inspections = createGitHubLiteExecutionInspectionClient(context);

  return {
    ...governedChanges,
    ...createGitHubLiteBatchReadClient({
      ...context,
      governedChangeClient: governedChanges,
      revisionClient: createGitHubLiteBatchRevisionClient(context),
    }),
    ...requests,
    ...inspections,
    ...createGitHubLiteWorkspaceClient(context),
    ...createGitHubLiteDashboardClient({ ...context, requests, inspections }),
  };
}
