import type { FailureFollowUp, GateDecision } from "@batchplane/domain";
import type { BatchPlaneClient } from "@batchplane/ui-client";
import {
  findExecutionRequestForRun,
  findWorkflowForRun,
  loadGateDecisionForRun,
  loadGateDecisionsForList,
  loadNativeProjectionJobs,
  loadWorkflowRunJobsForList,
  nativeProjectionJobRoles,
} from "./execution-run-evidence.js";
import {
  toExecutionRun,
  toNativeSourceRun,
  type ExecutionRunFacts,
} from "./execution-run-projection.js";
import { projectFailureFollowUpsForRequests } from "./failure-follow-up-projection.js";
import type {
  GitHubWorkflow,
  GitHubWorkflowJob,
  GitHubWorkflowRun,
} from "./index.js";
import {
  loadExecutionApprovalRequests,
  type ExecutionInspectionContext,
  type ExecutionRequestForRun,
} from "./inspection-context.js";
import {
  parseNativeScheduleExecutionLocator,
  projectNativeScheduleRun,
} from "./native-schedule-projections.js";

type RunQuery = Parameters<BatchPlaneClient["listExecutionRuns"]>[0];
type SourceContext = {
  run: GitHubWorkflowRun;
  workflow: GitHubWorkflow | undefined;
  request: ExecutionRequestForRun | undefined;
};

export function createGitHubLiteExecutionRunClient(
  context: ExecutionInspectionContext,
): Pick<BatchPlaneClient, "getExecutionRun" | "listExecutionRuns"> {
  return {
    getExecutionRun: (input) => getExecutionRun(context, input),
    listExecutionRuns: (input) => listExecutionRunFacts(context, input),
  };
}

async function getExecutionRun(
  context: ExecutionInspectionContext,
  { runId, runAttempt }: Parameters<BatchPlaneClient["getExecutionRun"]>[0],
) {
  const { client, repositoryRef } = context;
  const nativeLocator = parseNativeScheduleExecutionLocator(runId);
  if (nativeLocator) {
    const [run, requests] = await Promise.all([
      client.getWorkflowRun({
        ...repositoryRef,
        runId: Number(nativeLocator.sourceRunId),
        runAttempt: nativeLocator.runAttempt,
      }),
      loadExecutionApprovalRequests(client, repositoryRef),
    ]);
    const request = requests.find(
      (candidate) =>
        candidate.requestId === nativeLocator.requestId &&
        candidate.schedule?.sourceRunId === nativeLocator.sourceRunId,
    );
    if (!run || !request) return null;
    const followUps = await loadFollowUps(context, [request]);
    return (
      (await projectNativeOccurrence(context, run, request, followUps)) ?? null
    );
  }
  const numericRunId = Number(runId);
  if (!Number.isInteger(numericRunId) || numericRunId <= 0) return null;
  const run = await client.getWorkflowRun({
    ...repositoryRef,
    runId: numericRunId,
    ...(runAttempt === undefined ? {} : { runAttempt }),
  });
  if (!run) return null;
  return inspectSourceRun(context, run);
}

async function inspectSourceRun(
  context: ExecutionInspectionContext,
  run: GitHubWorkflowRun,
) {
  const { client, repositoryRef } = context;
  const [jobs, requests, workflow] = await Promise.all([
    client.listWorkflowRunJobs({
      ...repositoryRef,
      runId: run.id,
      runAttempt: run.runAttempt,
    }),
    loadExecutionApprovalRequests(client, repositoryRef),
    findWorkflowForRun(client, repositoryRef, run),
  ]);
  if (run.event === "schedule") return toNativeSourceRun(run, jobs, workflow);
  const gateDecision = await loadGateDecisionForRun({ ...context, jobs, run });
  const request = findExecutionRequestForRun(
    run,
    requests,
    workflow?.path,
    gateDecision?.requestId,
  );
  const followUps = await loadFollowUps(context, request ? [request] : []);
  return toExecutionRun(run, {
    jobs,
    workflow,
    request,
    gateDecision,
    failureFollowUps: request ? followUps.get(request.issue.number) : [],
  });
}

export async function listExecutionRunFacts(
  context: ExecutionInspectionContext,
  { batchId, limit = 20, requestId, workflowPath }: NonNullable<RunQuery> = {},
  options: {
    requests?: ExecutionRequestForRun[];
    includeFollowUps?: boolean;
    retainSourceWindow?: boolean;
  } = {},
) {
  const inventory = await loadRunInventory(context, limit, options.requests);
  const { requests, workflowById } = inventory;
  const runs = options.retainSourceWindow
    ? inventory.runs
    : inventory.runs.slice(0, limit);
  const manualRuns = runs.filter((run) => run.event !== "schedule");
  const jobsByRunId = await loadWorkflowRunJobsForList({
    ...context,
    runs: manualRuns,
  });
  const gateDecisionsByRunId = await loadGateDecisionsForList({
    ...context,
    runs: manualRuns,
    jobsByRunId,
  });
  const sources = correlateManualRequests(
    runs,
    requests,
    workflowById,
    gateDecisionsByRunId,
  );
  const nativeRequests = requests.filter(
    (request) =>
      request.triggerType === "SCHEDULE" &&
      request.schedule &&
      runs.some(
        (run) =>
          run.event === "schedule" &&
          String(run.id) === request.schedule?.sourceRunId,
      ),
  );
  const followUps =
    options.includeFollowUps !== false
      ? await loadFollowUps(context, [
          ...sources.flatMap((source) =>
            source.request ? [source.request] : [],
          ),
          ...nativeRequests,
        ])
      : new Map<number, FailureFollowUp[]>();
  const manual = projectManualRuns(
    sources,
    jobsByRunId,
    gateDecisionsByRunId,
    followUps,
  );
  const native = await projectScheduledRuns(
    context,
    sources,
    nativeRequests,
    followUps,
  );
  const projectedRuns = [...manual, ...native]
    .filter((run) => !batchId || run.batchId === batchId)
    .filter((run) => !requestId || run.requestId === requestId)
    .filter((run) => !workflowPath || run.workflowPath === workflowPath);
  return options.retainSourceWindow
    ? projectedRuns
    : projectedRuns.slice(0, limit);
}

async function loadRunInventory(
  { client, repositoryRef }: ExecutionInspectionContext,
  limit: number,
  preloadedRequests?: ExecutionRequestForRun[],
) {
  const [manual, scheduled, workflows, requests] = await Promise.all([
    client.listWorkflowRuns({
      ...repositoryRef,
      event: "workflow_dispatch",
      perPage: limit,
    }),
    client.listWorkflowRuns({
      ...repositoryRef,
      event: "schedule",
      perPage: limit,
    }),
    client.listWorkflows({ ...repositoryRef, dispatchableOnly: true }),
    preloadedRequests ?? loadExecutionApprovalRequests(client, repositoryRef),
  ]);
  const runs = [...manual, ...scheduled]
    .filter(
      (run, index, candidates) =>
        candidates.findIndex(
          (candidate) =>
            candidate.id === run.id && candidate.runAttempt === run.runAttempt,
        ) === index,
    )
    .sort((left, right) => right.id - left.id);
  return {
    runs,
    requests,
    workflowById: new Map(workflows.map((workflow) => [workflow.id, workflow])),
  };
}

function correlateManualRequests(
  runs: GitHubWorkflowRun[],
  requests: ExecutionRequestForRun[],
  workflows: Map<number, GitHubWorkflow>,
  gateDecisions: Map<number, GateDecision>,
): SourceContext[] {
  return runs.map((run) => {
    const workflow = workflows.get(run.workflowId);
    const request =
      run.event === "schedule"
        ? undefined
        : findExecutionRequestForRun(
            run,
            requests,
            workflow?.path,
            gateDecisions.get(run.id)?.requestId,
          );
    return { run, workflow, request };
  });
}

function projectManualRuns(
  sources: SourceContext[],
  jobs: Map<number, GitHubWorkflowJob[]>,
  gates: Map<number, GateDecision>,
  followUps: Map<number, FailureFollowUp[]>,
) {
  return sources
    .filter((source) => source.run.event !== "schedule")
    .map(({ run, request, workflow }) =>
      toExecutionRun(run, {
        workflow,
        request,
        gateDecision: gates.get(run.id),
        jobs: jobs.get(run.id),
        failureFollowUps: request
          ? followUps.get(request.issue.number)
          : undefined,
      }),
    );
}

function loadFollowUps(
  context: ExecutionInspectionContext,
  requests: ExecutionRequestForRun[],
) {
  return projectFailureFollowUpsForRequests({
    ...context,
    includeReviewCapabilities: true,
    requests,
  });
}

async function projectNativeOccurrence(
  context: ExecutionInspectionContext,
  run: GitHubWorkflowRun,
  request: ExecutionRequestForRun,
  followUps: Map<number, FailureFollowUp[]>,
): Promise<ExecutionRunFacts | undefined> {
  const projection = await projectNativeScheduleRun({
    client: context.client,
    repository: context.repositoryRef,
    request,
    run,
  });
  if (!projection) return undefined;
  const jobs = await loadNativeProjectionJobs({ ...context, projection });
  return toExecutionRun(projection.run, {
    request,
    jobs,
    jobRoles: nativeProjectionJobRoles(projection),
    gateDecision: projection.gateDecision,
    nativeSchedule: projection.presentation,
    failureFollowUps: followUps.get(request.issue.number),
  });
}

async function projectScheduledRuns(
  context: ExecutionInspectionContext,
  sources: SourceContext[],
  requests: ExecutionRequestForRun[],
  followUps: Map<number, FailureFollowUp[]>,
) {
  const scheduled = sources.filter((source) => source.run.event === "schedule");
  const occurrences = (
    await Promise.all(
      scheduled.flatMap(({ run }) =>
        requests
          .filter((request) => request.schedule?.sourceRunId === String(run.id))
          .map((request) =>
            projectNativeOccurrence(context, run, request, followUps),
          ),
      ),
    )
  ).filter((run): run is ExecutionRunFacts => run !== undefined);
  // Only wholly uncorrelated source attempts receive a read-only fallback row.
  const projectedAttempts = new Set(
    occurrences.map((run) => `${run.workflowRunId}:${run.runAttempt}`),
  );
  const sourceOnly = await Promise.all(
    scheduled
      .filter(
        ({ run }) => !projectedAttempts.has(`${run.id}:${run.runAttempt}`),
      )
      .map(async ({ run, workflow }) =>
        toNativeSourceRun(
          run,
          await context.client.listWorkflowRunJobs({
            ...context.repositoryRef,
            runId: run.id,
            runAttempt: run.runAttempt,
          }),
          workflow,
        ),
      ),
  );
  return [...sourceOnly, ...occurrences];
}
