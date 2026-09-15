import type {
  ExecutionRunJob,
  ExecutionRunStatus,
  FailureFollowUp,
  GateDecision,
} from "@batchplane/domain";
import type { GitHubWorkflowJob, GitHubWorkflowRun } from "./github-types.js";
import type { GitHubExecutionRun } from "./github-runtime-contracts.js";
import { type ExecutionRequestForRun } from "./inspection-context.js";
import { type NativeSchedulePresentation } from "./native-schedule-projections.js";
export type ExecutionRunFacts = GitHubExecutionRun & {
  evidenceScope?: "SOURCE_RUN";
  nativeSchedule?: NativeSchedulePresentation;
  observedAt?: string;
  sourceStatus: string;
  sourceConclusion?: string;
};

export function toExecutionRun(
  run: GitHubWorkflowRun,
  {
    failureFollowUps = [],
    gateDecision,
    jobs = [],
    jobRoles,
    nativeSchedule,
    request,
    workflow,
  }: {
    failureFollowUps?: FailureFollowUp[];
    gateDecision?: GateDecision;
    jobs?: GitHubWorkflowJob[];
    jobRoles?: ReadonlyMap<string, ExecutionRunJob["role"]>;
    nativeSchedule?: NativeSchedulePresentation;
    request?: ExecutionRequestForRun;
    workflow?: { name: string; path: string };
  } = {},
): ExecutionRunFacts {
  const mappedJobs = jobs.map((job) =>
    toExecutionRunJob(job, jobRoles?.get(String(job.id))),
  );
  const inferredBatchId = parseBatchIdFromRun(run, workflow?.path);
  const status = nativeSchedule
    ? nativeSchedule.observation
    : toExecutionRunStatus(run, gateDecision);
  const terminal =
    status !== "QUEUED" && status !== "RUNNING" && status !== "UNCONFIRMED";
  let completedAt: string | undefined;
  if (terminal && nativeSchedule) {
    completedAt = jobs.find(
      (job) =>
        jobRoles?.get(String(job.id)) === "BUSINESS" &&
        job.status === "completed",
    )?.completedAt;
  } else if (
    terminal &&
    run.event !== "schedule" &&
    run.status === "completed"
  ) {
    completedAt = run.updatedAt;
  }

  return {
    actor: run.actor,
    sourceStatus: run.status,
    ...(run.conclusion ? { sourceConclusion: run.conclusion } : {}),
    observedAt: run.updatedAt ?? run.startedAt ?? run.createdAt,
    batchId: run.batchId ?? request?.batchId ?? inferredBatchId ?? "",
    ...(completedAt ? { completedAt } : {}),
    event: run.event,
    ...(gateDecision ? { gateDecision } : {}),
    ...(nativeSchedule ? { nativeSchedule } : {}),
    failureFollowUps: failureFollowUps.filter(
      (followUp) =>
        followUp.runId === (nativeSchedule?.executionLocator ?? String(run.id)),
    ),
    jobs: mappedJobs,
    requestId:
      run.requestId ?? request?.requestId ?? parseRequestIdFromRun(run) ?? "",
    runAttempt: run.runAttempt,
    runId: nativeSchedule?.executionLocator ?? String(run.id),
    ...(run.startedAt ? { startedAt: run.startedAt } : {}),
    status,
    ...(request ? { requestIssueNumber: request.issue.number } : {}),
    ...(request ? { requestIssueUrl: request.issue.url } : {}),
    ...(workflow?.name || run.name
      ? { workflowName: workflow?.name ?? run.name }
      : {}),
    ...(workflow?.path || run.workflowPath
      ? { workflowPath: workflow?.path ?? run.workflowPath }
      : {}),
    workflowRunId: String(run.id),
    ...(run.url ? { workflowRunUrl: run.url } : {}),
  };
}

export function toNativeSourceRun(
  run: GitHubWorkflowRun,
  jobs: GitHubWorkflowJob[],
  workflow?: { name: string; path: string },
): ExecutionRunFacts {
  // A source Run without occurrence correlation preserves API evidence only.
  // Its aggregate conclusion and individual Gate results cannot establish a
  // business outcome or a request/owner binding, especially with many schedules.
  return {
    ...toExecutionRun(run, { jobs, workflow }),
    evidenceScope: "SOURCE_RUN",
    requestId: "",
    status: "UNCONFIRMED",
  };
}

export function toExecutionRunJob(
  job: GitHubWorkflowJob,
  role?: ExecutionRunJob["role"],
): ExecutionRunJob {
  return {
    ...(job.completedAt ? { completedAt: job.completedAt } : {}),
    ...(job.conclusion ? { conclusion: job.conclusion } : {}),
    jobId: String(job.id),
    name: job.name,
    role: role ?? (job.name === "BatchPlane Gate" ? "GATE" : "BUSINESS"),
    ...(job.startedAt ? { startedAt: job.startedAt } : {}),
    status: toExecutionRunStatus(job),
    ...(job.url ? { url: job.url } : {}),
  };
}

export function toExecutionRunStatus(
  run: Pick<GitHubWorkflowRun | GitHubWorkflowJob, "conclusion" | "status">,
  gateDecision?: GateDecision,
): ExecutionRunStatus {
  if (gateDecision?.allowed === false) {
    return "BLOCKED";
  }

  if (run.status === "queued") {
    return "QUEUED";
  }

  if (run.status === "in_progress") {
    return "RUNNING";
  }

  switch (run.conclusion) {
    case "success":
      return "SUCCEEDED";
    case "cancelled":
    case "skipped":
      return "CANCELED";
    case "failure":
    case "timed_out":
    case "action_required":
      return "FAILED";
    default:
      return "RUNNING";
  }
}

export function parseRequestIdFromRun(
  run: GitHubWorkflowRun,
): string | undefined {
  const text = [run.displayTitle, run.name].filter(Boolean).join(" ");
  const match = text.match(/\bbtr-\d{14}-[a-z0-9_.-]+-[a-f0-9]{8}\b/u);

  return match?.[0];
}

export function parseBatchIdFromRun(
  run: GitHubWorkflowRun,
  workflowPath?: string,
): string | undefined {
  const requestId = parseRequestIdFromRun(run);

  if (requestId) {
    const match = requestId.match(/^btr-\d{14}-(.+)-[a-f0-9]{8}$/u);
    if (match?.[1]) {
      return match[1];
    }
  }

  return (
    run.batchId ??
    parseBatchIdFromWorkflowPath(workflowPath) ??
    parseBatchIdFromWorkflowPath(run.workflowPath)
  );
}

export function parseBatchIdFromWorkflowPath(
  workflowPath: string | undefined,
): string | undefined {
  const fileName = workflowPath?.split("/").pop();
  const match = fileName?.match(/^(.+)\.ya?ml$/u);
  const batchId = match?.[1];

  if (!batchId || isGenericWorkflowFileName(batchId)) {
    return undefined;
  }

  return batchId;
}

export function isGenericWorkflowFileName(fileName: string): boolean {
  return [
    "batchplane-dispatcher",
    "batchplane-sample-target",
    "batchtrail-dispatcher",
    "batchtrail-sample-target",
  ].includes(fileName.toLowerCase());
}
