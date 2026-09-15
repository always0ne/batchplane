import {
  ExecutionInspectionError,
  type BatchPlaneClient,
  type ExecutionRunPresentation,
} from "@batchplane/ui-client";
import { extractBusinessLogSection } from "./execution-log-client.js";
import type {
  BatchPlaneRuntimePorts,
  GitHubExecutionRun,
} from "./github-runtime-contracts.js";
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

export function createGitHubLiteExecutionInspectionClient({
  runtime,
}: {
  runtime: Pick<BatchPlaneRuntimePorts, "executions" | "audit">;
}): InspectionClient {
  return {
    listExecutionRuns: (input) =>
      withInspectionErrorMapping(async () =>
        (
          await runtime.executions.listExecutionRuns(
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
        const run = await runtime.executions.getExecutionRun(input);
        return run ? toExecutionRunPresentation(run) : null;
      }),
    getExecutionRunJobLog: (input) =>
      withInspectionErrorMapping(async () => {
        const log = await runtime.executions.getExecutionRunJobLog(input);
        return {
          ...log,
          businessSection: extractBusinessLogSection(log.content),
        };
      }),
    createFailureFollowUp: (input) =>
      withInspectionErrorMapping(() =>
        runtime.executions.createFailureFollowUp(input),
      ),
    reviewFailureFollowUp: (input) =>
      withInspectionErrorMapping(() =>
        runtime.executions.reviewFailureFollowUp(input),
      ),
    listAuditTimeline: (input) =>
      withInspectionErrorMapping(() => runtime.audit.listAuditTimeline(input)),
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
