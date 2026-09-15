import type { GitHubRepositoryContext } from "./github-types.js";
import { createGitHubLiteExecutionRunClient } from "./execution-run-client.js";
import { createGitHubLiteExecutionLogClient } from "./execution-log-client.js";
import { createGitHubLiteFailureFollowUpClient } from "./failure-follow-up-client.js";
import { createGitHubLiteAuditClient } from "./execution-audit-client.js";

import {
  ExecutionInspectionError,
  type BatchPlaneClient,
  type ExecutionRunPresentation,
} from "@batchplane/ui-client";
import { extractBusinessLogSection } from "./execution-log-client.js";
import type { GitHubExecutionRun } from "./repository-evidence-types.js";
import { toProductReadError } from "./product-read-errors.js";

type InspectionClient = Pick<
  BatchPlaneClient,
  | "listExecutionRuns"
  | "getExecutionRun"
  | "getExecutionRunJobLog"
  | "createFailureFollowUp"
  | "reviewFailureFollowUp"
  | "listAuditTimeline"
>;

export function createGitHubLiteExecutionInspectionClient(
  context: GitHubRepositoryContext,
): InspectionClient {
  const runs = createGitHubLiteExecutionRunClient(context);
  const logs = createGitHubLiteExecutionLogClient(context);
  const followUps = createGitHubLiteFailureFollowUpClient(context);
  const audit = createGitHubLiteAuditClient(context);
  return {
    listExecutionRuns: (input) =>
      withInspectionErrorMapping(async () =>
        (
          await runs.listExecutionRuns(
            input
              ? {
                  batchId: input.batchId,
                  limit: input.limit,
                  requestId: input.requestId,
                  workflowPath: input.executionTargetLocation,
                }
              : undefined,
          )
        ).map(toExecutionRunPresentation),
      ),
    getExecutionRun: (input) =>
      withInspectionErrorMapping(async () => {
        const run = await runs.getExecutionRun(input);
        return run ? toExecutionRunPresentation(run) : null;
      }),
    getExecutionRunJobLog: (input) =>
      withInspectionErrorMapping(async () => {
        const log = await logs.getExecutionRunJobLog(input);
        return {
          ...log,
          businessSection: extractBusinessLogSection(log.content),
        };
      }),
    createFailureFollowUp: (input) =>
      withInspectionErrorMapping(() => followUps.createFailureFollowUp(input)),
    reviewFailureFollowUp: (input) =>
      withInspectionErrorMapping(() => followUps.reviewFailureFollowUp(input)),
    listAuditTimeline: (input) =>
      withInspectionErrorMapping(() => audit.listAuditTimeline(input)),
  };
}

function toExecutionRunPresentation(
  run: GitHubExecutionRun,
): ExecutionRunPresentation {
  const presentation = { ...run };
  delete presentation.requestIssueNumber;
  delete presentation.requestIssueUrl;
  delete presentation.workflowName;
  delete presentation.workflowPath;
  delete presentation.workflowRunId;
  delete presentation.workflowRunUrl;

  return {
    ...presentation,
    ...(run.workflowRunUrl ? { sourceUrl: run.workflowRunUrl } : {}),
    ...(run.workflowName || run.workflowPath
      ? {
          executionTarget: {
            ...(run.workflowPath ? { location: run.workflowPath } : {}),
            ...(run.workflowName ? { name: run.workflowName } : {}),
          },
        }
      : {}),
  };
}

export async function withInspectionErrorMapping<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ExecutionInspectionError) throw error;
    throw new ExecutionInspectionError(toProductReadError(error));
  }
}
