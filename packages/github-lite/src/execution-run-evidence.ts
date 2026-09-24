import type { RepoRef } from "./github-types.js";
import type { ExecutionRunJob, GateDecision } from "@batchplane/domain";
import { parseExecutionGateResult } from "./execution-gate-result.js";
import {
  parseBatchIdFromRun,
  parseRequestIdFromRun,
} from "./execution-run-projection.js";
import type {
  GitHubLiteClient,
  GitHubWorkflowJob,
  GitHubWorkflowRun,
} from "./github-types.js";
import {
  loadExecutionApprovalRequests,
  type ExecutionRequestForRun,
} from "./inspection-context.js";
import {
  parseNativeScheduleExecutionLocator,
  projectNativeScheduleRun,
} from "./native-schedule-projections.js";
export async function findWorkflowForRun(
  client: GitHubLiteClient,
  repositoryRef: RepoRef,
  run: GitHubWorkflowRun,
) {
  return (
    (await client.getWorkflow({
      ...repositoryRef,
      workflowId: run.workflowId,
    })) ?? undefined
  );
}

export async function loadWorkflowRunJobsForList({
  client,
  repositoryRef,
  runs,
}: {
  client: GitHubLiteClient;
  repositoryRef: RepoRef;
  runs: GitHubWorkflowRun[];
}): Promise<Map<number, GitHubWorkflowJob[]>> {
  const jobsByRunId = await Promise.all(
    runs.filter(shouldLoadJobsForRunList).map(async (run) => {
      const jobs = await client.listWorkflowRunJobs({
        ...repositoryRef,
        runAttempt: run.runAttempt,
        runId: run.id,
      });

      return [run.id, jobs] as const;
    }),
  );

  return new Map(jobsByRunId);
}

export function shouldLoadJobsForRunList(run: GitHubWorkflowRun): boolean {
  return run.status === "completed" && run.conclusion !== "success";
}

export async function loadGateDecisionsForList({
  client,
  jobsByRunId,
  repositoryRef,
  runs,
}: {
  client: GitHubLiteClient;
  jobsByRunId: Map<number, GitHubWorkflowJob[]>;
  repositoryRef: RepoRef;
  runs: GitHubWorkflowRun[];
}): Promise<Map<number, GateDecision>> {
  const decisions = await Promise.all(
    runs.map(async (run) => {
      const jobs = jobsByRunId.get(run.id) ?? [];

      if (!shouldLoadGateDecisionForList(run, jobs)) {
        return undefined;
      }

      const gateDecision = await loadGateDecisionForRun({
        client,
        jobs,
        repositoryRef,
        run,
      });

      return gateDecision ? ([run.id, gateDecision] as const) : undefined;
    }),
  );

  return new Map(
    decisions.filter(
      (decision): decision is readonly [number, GateDecision] =>
        decision !== undefined,
    ),
  );
}

export async function loadGateDecisionForRun({
  client,
  jobs,
  repositoryRef,
  run,
}: {
  client: GitHubLiteClient;
  jobs: GitHubWorkflowJob[];
  repositoryRef: RepoRef;
  run: GitHubWorkflowRun;
}): Promise<GateDecision | undefined> {
  const gateJob = jobs.find((job) => job.name === "BatchPlane Gate");
  const gateStep = gateJob?.steps?.find(isGateVerificationStep);

  if (!gateJob || !gateStep) {
    return undefined;
  }

  try {
    const log = await client.getWorkflowJobLog({
      ...repositoryRef,
      jobId: gateJob.id,
    });
    const result = parseExecutionGateResult({
      content: log.content,
      expected: {
        gateJobName: gateJob.name,
        gateStep: {
          ...gateStep,
          nextStepStartedAt: findNextStepStartedAt(gateJob.steps, gateStep),
        },
        repository: `${repositoryRef.owner}/${repositoryRef.repo}`,
        runAttempt: run.runAttempt,
        runId: run.id,
      },
    });

    if (!result) {
      return undefined;
    }

    return {
      allowed: result.allowed,
      decidedAt: gateJob.completedAt ?? run.updatedAt ?? run.startedAt ?? "",
      message: result.message,
      ...(result.reasonCode ? { reasonCode: result.reasonCode } : {}),
      ...(result.requestId ? { requestId: result.requestId } : {}),
      ...(result.scheduleId ? { scheduleId: result.scheduleId } : {}),
    };
  } catch {
    // A missing, expired, or unreadable log cannot create a Gate decision.
    return undefined;
  }
}

export function shouldLoadGateDecisionForList(
  run: GitHubWorkflowRun,
  jobs: GitHubWorkflowJob[],
): boolean {
  return run.status === "completed" && jobs.some(isGateWorkflowJob);
}

export function findNextStepStartedAt(
  steps: GitHubWorkflowJob["steps"] | undefined,
  gateStep: { name: string; number: number },
): string | undefined {
  return steps?.find(
    (step) => step.number > gateStep.number && step.name !== "Complete job",
  )?.startedAt;
}

export function isGateWorkflowJob(
  job: Pick<GitHubWorkflowJob, "name">,
): boolean {
  return job.name === "BatchPlane Gate";
}

export function isGateVerificationStep(step: { name: string }): boolean {
  return (
    step.name === "Verify approved execution evidence" ||
    step.name === "Verify approved native schedule evidence" ||
    step.name === "Reverify approved native schedule evidence"
  );
}

export function findExecutionRequestForRun(
  run: GitHubWorkflowRun,
  requests: ExecutionRequestForRun[],
  workflowPath?: string,
  gateRequestId?: string,
): ExecutionRequestForRun | undefined {
  const explicitRequestId =
    run.requestId ?? parseRequestIdFromRun(run) ?? gateRequestId;
  const explicitBatchId = run.batchId ?? parseBatchIdFromRun(run, workflowPath);

  if (run.event === "schedule") {
    return explicitRequestId
      ? requests.find((request) => request.requestId === explicitRequestId)
      : undefined;
  }

  return requests.find((request) => {
    if (explicitRequestId) {
      return request.requestId === explicitRequestId;
    }

    return (
      Boolean(explicitBatchId) &&
      request.batchId === explicitBatchId &&
      request.status !== "REQUESTED"
    );
  });
}

export async function loadFailureFollowUpRunContext({
  client,
  repositoryRef,
  runId,
}: {
  client: GitHubLiteClient;
  repositoryRef: RepoRef;
  runId: string;
}): Promise<{
  evidenceRunId: string;
  request: ExecutionRequestForRun | undefined;
  run: GitHubWorkflowRun;
}> {
  const nativeLocator = parseNativeScheduleExecutionLocator(runId);
  if (nativeLocator) {
    const [run, requests] = await Promise.all([
      client.getWorkflowRun({
        ...repositoryRef,
        runAttempt: nativeLocator.runAttempt,
        runId: Number(nativeLocator.sourceRunId),
      }),
      loadExecutionApprovalRequests(client, repositoryRef),
    ]);
    const request = requests.find(
      (candidate) =>
        candidate.requestId === nativeLocator.requestId &&
        candidate.triggerType === "SCHEDULE" &&
        candidate.schedule?.sourceRunId === nativeLocator.sourceRunId,
    );

    if (!run || !request) {
      throw new Error("Execution request evidence was not found for this run.");
    }

    return { evidenceRunId: runId, request, run };
  }
  const numericRunId = Number(runId);

  if (!Number.isInteger(numericRunId) || numericRunId <= 0) {
    throw new Error("Execution run ID must be a positive number.");
  }

  const [run, requests] = await Promise.all([
    client.getWorkflowRun({
      ...repositoryRef,
      runId: numericRunId,
    }),
    loadExecutionApprovalRequests(client, repositoryRef),
  ]);

  if (!run) {
    throw new Error("Execution run was not found.");
  }

  return {
    evidenceRunId: String(run.id),
    request: findExecutionRequestForRun(run, requests, run.workflowPath),
    run,
  };
}

export async function loadNativeProjectionJobs({
  client,
  projection,
  repositoryRef,
}: {
  client: GitHubLiteClient;
  projection: NonNullable<Awaited<ReturnType<typeof projectNativeScheduleRun>>>;
  repositoryRef: RepoRef;
}): Promise<GitHubWorkflowJob[]> {
  const expectedJobIds = new Set(projection.jobs.map((job) => job.id));
  if (expectedJobIds.size === 0) return [];

  const jobs = await client.listWorkflowRunJobs({
    ...repositoryRef,
    runAttempt: projection.run.runAttempt,
    runId: projection.run.id,
  });

  return jobs.filter((job) => expectedJobIds.has(String(job.id)));
}

export function nativeProjectionJobRoles(
  projection: NonNullable<Awaited<ReturnType<typeof projectNativeScheduleRun>>>,
): ReadonlyMap<string, ExecutionRunJob["role"]> {
  return new Map(projection.jobs.map((job) => [job.id, job.role]));
}
