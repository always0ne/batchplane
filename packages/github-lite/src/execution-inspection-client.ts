import type { BatchPlaneRuntimePorts } from "@batchplane/domain";
import {
  ExecutionInspectionError,
  type BatchPlaneClient,
} from "@batchplane/ui-client";
import { extractBusinessLogSection } from "./execution-log-client.js";
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
      withInspectionErrorMapping(() =>
        runtime.executions.listExecutionRuns(input),
      ),
    getExecutionRun: (input) =>
      withInspectionErrorMapping(() =>
        runtime.executions.getExecutionRun(input),
      ),
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
