import type { GateDecision } from "@batchplane/domain";

import { inspectNativeScheduleExecution } from "./native-schedule-evidence.js";
import type { ExecutionApprovalRequest } from "./execution-approval-legacy.js";
import type { GitHubLiteClient, GitHubWorkflowRun, RepoRef } from "./index.js";

export type NativeSchedulePresentation = {
  executionLocator: string;
  observation:
    | "QUEUED"
    | "RUNNING"
    | "SUCCEEDED"
    | "FAILED"
    | "BLOCKED"
    | "CANCELED"
    | "UNCONFIRMED";
  reason?: string;
  scheduleId: string;
  sourceRunId: string;
  sourceRunAttempt: number;
};

export type NativeScheduleRunProjection = {
  gateDecision?: GateDecision;
  jobs: Array<{ id: string; name: string; role: "GATE" | "BUSINESS" }>;
  presentation: NativeSchedulePresentation;
  run: GitHubWorkflowRun;
};

/**
 * Correlates one scheduled request with one observed GitHub Run attempt. The
 * canonical schedule job identity and final observation are re-read from the
 * Actions API; mutable result comments are never an identity source.
 */
export async function projectNativeScheduleRun({
  client,
  repository,
  request,
  run,
}: {
  client: GitHubLiteClient;
  repository: RepoRef;
  request: ExecutionApprovalRequest;
  run: GitHubWorkflowRun;
}): Promise<NativeScheduleRunProjection | null> {
  const schedule = request.schedule;
  if (
    request.triggerType !== "SCHEDULE" ||
    !schedule ||
    run.event !== "schedule" ||
    schedule.sourceRunId !== String(run.id)
  ) {
    return null;
  }

  const locator = nativeScheduleExecutionLocator({
    requestId: request.requestId,
    runAttempt: run.runAttempt,
    sourceRunId: schedule.sourceRunId,
  });
  if (!request.workflow?.path) {
    return {
      jobs: [],
      presentation: {
        executionLocator: locator,
        observation: "UNCONFIRMED",
        reason: "WORKFLOW_CONTEXT_UNCONFIRMED",
        scheduleId: schedule.scheduleId,
        sourceRunAttempt: run.runAttempt,
        sourceRunId: schedule.sourceRunId,
      },
      run,
    };
  }

  try {
    const proof = await inspectNativeScheduleExecution({
      client,
      expectedOccurrence: {
        batchId: request.batchId,
        requestDigest: request.requestDigest,
        requestId: request.requestId,
        scheduleId: schedule.scheduleId,
      },
      expectedRepositoryId: schedule.repositoryId,
      expectedWorkflowPath: request.workflow.path,
      repository,
      runAttempt: run.runAttempt,
      runId: run.id,
      schedule: { scheduleId: schedule.scheduleId },
    });
    const gate = proof.entryGate ?? proof.controlGate;
    return {
      ...(gate
        ? {
            gateDecision: {
              allowed: gate.allowed,
              decidedAt: proof.run.updatedAt ?? proof.run.startedAt ?? "",
              message: gate.message,
              ...(gate.reasonCode ? { reasonCode: gate.reasonCode } : {}),
              requestId: request.requestId,
              scheduleId: schedule.scheduleId,
            },
          }
        : {}),
      jobs: [
        ...(proof.controlJob
          ? [
              {
                id: String(proof.controlJob.jobId),
                name: proof.controlJob.name,
                role: "GATE" as const,
              },
            ]
          : []),
        ...(proof.businessJob
          ? [
              {
                id: String(proof.businessJob.jobId),
                name: proof.businessJob.name,
                role: "BUSINESS" as const,
              },
            ]
          : []),
      ],
      presentation: {
        executionLocator: locator,
        observation:
          liveNativeScheduleObservation(proof.businessJob?.status) ??
          proof.observation,
        ...(proof.reason ? { reason: proof.reason } : {}),
        scheduleId: schedule.scheduleId,
        sourceRunAttempt: run.runAttempt,
        sourceRunId: schedule.sourceRunId,
      },
      run: proof.run,
    };
  } catch (error) {
    return {
      jobs: [],
      presentation: {
        executionLocator: locator,
        observation: "UNCONFIRMED",
        reason: `ACTIONS_API_UNAVAILABLE:${errorMessage(error)}`,
        scheduleId: schedule.scheduleId,
        sourceRunAttempt: run.runAttempt,
        sourceRunId: schedule.sourceRunId,
      },
      run,
    };
  }
}

function liveNativeScheduleObservation(
  status: "queued" | "in_progress" | "completed" | undefined,
): "QUEUED" | "RUNNING" | undefined {
  if (status === "queued") return "QUEUED";
  if (status === "in_progress") return "RUNNING";
  return undefined;
}

export function nativeScheduleExecutionLocator({
  requestId,
  runAttempt,
  sourceRunId,
}: {
  requestId: string;
  runAttempt: number;
  sourceRunId: string;
}): string {
  return `native:${encodeURIComponent(requestId)}:${sourceRunId}:${runAttempt}`;
}

export function parseNativeScheduleExecutionLocator(value: string): {
  requestId: string;
  runAttempt: number;
  sourceRunId: string;
} | null {
  const match = /^native:([^:]+):(\d+):(\d+)$/u.exec(value);
  if (!match) return null;
  const encodedRequestId = match[1];
  const sourceRunId = match[2];
  if (!encodedRequestId || !sourceRunId) return null;
  const runAttempt = Number(match[3]);
  if (!Number.isInteger(runAttempt) || runAttempt < 1) return null;
  try {
    return {
      requestId: decodeURIComponent(encodedRequestId),
      runAttempt,
      sourceRunId,
    };
  } catch {
    return null;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
