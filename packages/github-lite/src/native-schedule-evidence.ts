import { createRequestDigest, type CanonicalValue } from "@batchplane/digest";
import {
  isBatchPlaneApiVersion,
  type BatchDefinition,
  type ExecutionRequestPayload,
} from "@batchplane/domain";
import {
  parseExecutionGateResult,
  type ExecutionGateResult,
  type NativeScheduleGateOccurrence,
} from "./execution-gate-result.js";
import { getNativeScheduleWorkflowJobIdentity } from "./github-workflow.js";
import type {
  GitHubLiteClient,
  GitHubWorkflowJob,
  GitHubWorkflowRun,
  RepoRef,
} from "./index.js";

export type NativeScheduleOccurrence = {
  definitionCommitSha: string;
  definitionPath: string;
  repositoryId: string;
  scheduleId: string;
  sourceRunAttempt: number;
  sourceRunId: string;
};

export type NativeScheduleRequestExpectation = {
  approvedBatchRevision: ExecutionRequestPayload["spec"]["approvedBatchRevision"];
  batch: BatchDefinition;
  occurrence: NativeScheduleOccurrence;
  requestDigest: string;
  requestId: string;
};

export type VerifiedNativeScheduleRequest = {
  requestDigest: string;
  requestId: string;
  payload: ExecutionRequestPayload;
};

export type NativeScheduleObservation =
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELED"
  | "BLOCKED"
  | "UNCONFIRMED";

export type NativeScheduleExecutionProof = {
  businessJob?: JobObservation;
  controlJob?: JobObservation;
  controlGate?: ExecutionGateResult;
  entryGate?: ExecutionGateResult;
  observation: NativeScheduleObservation;
  reason?: string;
  run: GitHubWorkflowRun;
};

export type JobObservation = {
  conclusion: string | null;
  jobId: number;
  name: string;
  runStepConclusion?: string | null;
  status: GitHubWorkflowJob["status"];
};

export async function inspectNativeScheduleExecution({
  client,
  expectedOccurrence,
  expectedRepositoryId,
  expectedWorkflowPath,
  repository,
  runAttempt,
  runId,
  schedule,
}: {
  client: GitHubLiteClient;
  expectedOccurrence: NativeScheduleGateOccurrence;
  expectedRepositoryId: string;
  expectedWorkflowPath: string;
  repository: RepoRef;
  runAttempt: number;
  runId: number;
  schedule: Pick<NativeScheduleOccurrence, "scheduleId">;
}): Promise<NativeScheduleExecutionProof> {
  const evidence = await collectNativeScheduleEvidence({
    client,
    expectedOccurrence,
    expectedRepositoryId,
    expectedWorkflowPath,
    repository,
    runAttempt,
    runId,
    schedule,
  });
  return {
    ...(evidence.businessJob ? { businessJob: evidence.businessJob } : {}),
    ...(evidence.controlGate ? { controlGate: evidence.controlGate } : {}),
    ...(evidence.controlJob ? { controlJob: evidence.controlJob } : {}),
    ...(evidence.entryGate ? { entryGate: evidence.entryGate } : {}),
    run: evidence.run,
    ...classifyNativeScheduleEvidence(evidence),
  };
}

type NativeScheduleEvidence = {
  business?: GitHubWorkflowJob;
  businessJob?: JobObservation;
  control?: GitHubWorkflowJob;
  controlGate?: ExecutionGateResult;
  controlJob?: JobObservation;
  entryGate?: ExecutionGateResult;
  run: GitHubWorkflowRun;
  runContextMatches: boolean;
};

async function collectNativeScheduleEvidence({
  client,
  expectedOccurrence,
  expectedRepositoryId,
  expectedWorkflowPath,
  repository,
  runAttempt,
  runId,
  schedule,
}: {
  client: GitHubLiteClient;
  expectedOccurrence: NativeScheduleGateOccurrence;
  expectedRepositoryId: string;
  expectedWorkflowPath: string;
  repository: RepoRef;
  runAttempt: number;
  runId: number;
  schedule: Pick<NativeScheduleOccurrence, "scheduleId">;
}): Promise<NativeScheduleEvidence> {
  const { businessJobId, businessJobName, controlJobId, controlJobName } =
    getNativeScheduleWorkflowJobIdentity(schedule);
  const run = await client.getWorkflowRun({ ...repository, runAttempt, runId });
  if (!run) {
    throw new Error("NATIVE_SCHEDULE_RUN_NOT_FOUND");
  }
  const runContextMatches =
    run.event === "schedule" &&
    run.id === runId &&
    run.runAttempt === runAttempt &&
    run.repositoryId === expectedRepositoryId &&
    run.workflowPath === expectedWorkflowPath;
  if (!runContextMatches) {
    return { run, runContextMatches: false };
  }

  const jobs = await client.listWorkflowRunJobs({
    ...repository,
    runAttempt,
    runId,
  });
  const control = uniqueJob(jobs, controlJobName);
  const business = uniqueJob(jobs, businessJobName);
  const controlGate = control
    ? await readGateResult({
        client,
        expectedJobId: controlJobId,
        expectedJobName: controlJobName,
        expectedOccurrence,
        expectedStepName: "Verify approved native schedule evidence",
        job: control,
        repository,
        run,
      })
    : undefined;
  const controlJob = control ? toJobObservation(control) : undefined;

  if (!business) {
    return { control, controlGate, controlJob, run, runContextMatches: true };
  }
  const entryGate = await readGateResult({
    client,
    expectedJobId: businessJobId,
    expectedJobName: businessJobName,
    expectedOccurrence,
    expectedStepName: "Reverify approved native schedule evidence",
    job: business,
    repository,
    run,
  });

  return {
    business,
    businessJob: toJobObservation(business),
    control,
    controlGate,
    controlJob,
    entryGate,
    run,
    runContextMatches: true,
  };
}

function classifyNativeScheduleEvidence(
  evidence: NativeScheduleEvidence,
): Pick<NativeScheduleExecutionProof, "observation" | "reason"> {
  const { business, control, controlGate, entryGate, run, runContextMatches } =
    evidence;
  if (!runContextMatches) {
    return { observation: "UNCONFIRMED", reason: "RUN_CONTEXT_MISMATCH" };
  }
  if (controlGate?.allowed === false || entryGate?.allowed === false) {
    return { observation: "BLOCKED" };
  }
  if (!business) {
    return {
      observation: "UNCONFIRMED",
      reason: "BUSINESS_JOB_IDENTITY_UNCONFIRMED",
    };
  }
  if (!control) {
    return {
      observation: "UNCONFIRMED",
      reason: "CONTROL_JOB_IDENTITY_UNCONFIRMED",
    };
  }

  const businessStep = business.steps?.find(
    (step) => step.name === "Run batch",
  );
  if (
    business.conclusion === "cancelled" ||
    businessStep?.conclusion === "cancelled"
  ) {
    return { observation: "CANCELED" };
  }
  if (!controlGate?.allowed || !entryGate?.allowed) {
    return {
      observation: "UNCONFIRMED",
      reason: "GATE_EVIDENCE_UNCONFIRMED",
    };
  }
  if (businessStep?.conclusion === "success") {
    return { observation: "SUCCEEDED" };
  }
  if (
    businessStep?.conclusion === "failure" ||
    businessStep?.conclusion === "timed_out" ||
    businessStep?.conclusion === "action_required"
  ) {
    return { observation: "FAILED" };
  }
  if (run.conclusion === "cancelled") {
    return { observation: "CANCELED" };
  }
  return {
    observation: "UNCONFIRMED",
    reason: "BUSINESS_TERMINAL_EVIDENCE_UNCONFIRMED",
  };
}

function toJobObservation(job: GitHubWorkflowJob): JobObservation {
  const businessStep = job.steps?.find((step) => step.name === "Run batch");

  return {
    conclusion: job.conclusion,
    jobId: job.id,
    name: job.name,
    ...(businessStep ? { runStepConclusion: businessStep.conclusion } : {}),
    status: job.status,
  };
}

function uniqueJob(
  jobs: GitHubWorkflowJob[],
  name: string,
): GitHubWorkflowJob | undefined {
  const matches = jobs.filter((job) => job.name === name);
  return matches.length === 1 ? matches[0] : undefined;
}

async function readGateResult({
  client,
  expectedJobId,
  expectedJobName,
  expectedOccurrence,
  expectedStepName,
  job,
  repository,
  run,
}: {
  client: GitHubLiteClient;
  expectedJobId: string;
  expectedJobName: string;
  expectedOccurrence: NativeScheduleGateOccurrence;
  expectedStepName: string;
  job: GitHubWorkflowJob;
  repository: RepoRef;
  run: GitHubWorkflowRun;
}): Promise<ExecutionGateResult | undefined> {
  const step = job.steps?.find(
    (candidate) => candidate.name === expectedStepName,
  );
  if (!step) return undefined;
  try {
    const log = await client.getWorkflowJobLog({
      ...repository,
      jobId: job.id,
    });
    return parseExecutionGateResult({
      content: log.content,
      expected: {
        gateJob: expectedJobId,
        gateJobName: expectedJobName,
        gateStep: {
          ...step,
          nextStepStartedAt: job.steps?.find(
            (candidate) =>
              candidate.number > step.number &&
              candidate.name !== "Complete job",
          )?.startedAt,
        },
        occurrence: expectedOccurrence,
        repository: `${repository.owner}/${repository.repo}`,
        runAttempt: run.runAttempt,
        runId: run.id,
      },
    });
  } catch {
    return undefined;
  }
}

/**
 * Validates an Issue body as the one immutable request for this native schedule
 * occurrence. Callers must not use a request ID marker or Issue number alone.
 */
export async function verifyNativeScheduleRequestIssue(
  body: string,
  expected: NativeScheduleRequestExpectation,
): Promise<VerifiedNativeScheduleRequest | null> {
  const marker = parseMarker(body, "execution-request");
  const payload = parseExecutionRequestPayload(body);

  if (
    !payload ||
    !matchesMarker(marker, expected) ||
    !matchesPayload(payload, expected)
  ) {
    return null;
  }

  let digest: string;
  try {
    digest = await createRequestDigest(payload as unknown as CanonicalValue);
  } catch {
    return null;
  }

  if (
    digest !== expected.requestDigest ||
    marker.get("requestDigest") !== digest
  ) {
    return null;
  }

  return {
    payload,
    requestDigest: digest,
    requestId: expected.requestId,
  };
}

function matchesMarker(
  marker: Map<string, string>,
  expected: NativeScheduleRequestExpectation,
): boolean {
  return (
    marker.get("requestId") === expected.requestId &&
    marker.get("batchId") === expected.batch.batchId &&
    marker.get("requestDigest") === expected.requestDigest &&
    marker.get("status") === "REQUESTED"
  );
}

function matchesPayload(
  payload: ExecutionRequestPayload,
  expected: NativeScheduleRequestExpectation,
): boolean {
  const spec = payload.spec;
  const occurrence = spec.schedule;
  const batch = expected.batch;

  return (
    payload.metadata.requestId === expected.requestId &&
    payload.metadata.batchId === batch.batchId &&
    spec.contractVersion === "NATIVE_SCHEDULE_V2" &&
    spec.triggerType === "SCHEDULE" &&
    spec.expiresAt === undefined &&
    sameRevision(spec.approvedBatchRevision, expected.approvedBatchRevision) &&
    sameWorkflow(spec.workflow, batch.workflow) &&
    sameBatchSnapshot(spec.batch, batch) &&
    sameExecutionSnapshot(spec.execution, batch) &&
    occurrence !== undefined &&
    sameOccurrence(occurrence, expected.occurrence)
  );
}

function sameRevision(
  left: ExecutionRequestPayload["spec"]["approvedBatchRevision"],
  right: ExecutionRequestPayload["spec"]["approvedBatchRevision"],
): boolean {
  return (
    left.governedChangeId === right.governedChangeId &&
    left.targetRevisionDigest === right.targetRevisionDigest
  );
}

function sameWorkflow(
  left: ExecutionRequestPayload["spec"]["workflow"],
  right: BatchDefinition["workflow"],
): boolean {
  return left.path === right.path && left.ref === right.ref;
}

function sameBatchSnapshot(
  left: ExecutionRequestPayload["spec"]["batch"],
  right: BatchDefinition,
): boolean {
  return (
    left.name === right.name &&
    left.owner === right.owner &&
    left.domain === right.domain &&
    left.environment === right.environment &&
    left.criticality === right.criticality
  );
}

function sameExecutionSnapshot(
  execution: ExecutionRequestPayload["spec"]["execution"],
  batch: BatchDefinition,
): boolean {
  if (!batch.execution) return execution === undefined;
  if (!execution) return false;
  return (
    execution.command === batch.execution.command &&
    execution.gateRequired === batch.gateRequired &&
    JSON.stringify(execution.runsOn) ===
      JSON.stringify(batch.execution.runsOn) &&
    execution.artifactPath === batch.execution.artifactPath
  );
}

function sameOccurrence(
  left: NonNullable<ExecutionRequestPayload["spec"]["schedule"]>,
  right: NativeScheduleOccurrence,
): boolean {
  return (
    left.definitionCommitSha === right.definitionCommitSha &&
    left.definitionPath === right.definitionPath &&
    left.repositoryId === right.repositoryId &&
    left.scheduleId === right.scheduleId &&
    left.sourceRunAttempt === right.sourceRunAttempt &&
    left.sourceRunId === right.sourceRunId
  );
}

function parseExecutionRequestPayload(
  body: string,
): ExecutionRequestPayload | null {
  const match = body.match(
    /### Canonical payload\s*```json\s*([\s\S]*?)\s*```/u,
  );
  if (!match?.[1]) return null;

  try {
    const value = JSON.parse(match[1]) as unknown;
    return isExecutionRequestPayload(value) ? value : null;
  } catch {
    return null;
  }
}

function isExecutionRequestPayload(
  value: unknown,
): value is ExecutionRequestPayload {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  const metadata = asRecord(record.metadata);
  const spec = asRecord(record.spec);
  const workflow = asRecord(spec?.workflow);
  const batch = asRecord(spec?.batch);
  const revision = asRecord(spec?.approvedBatchRevision);
  const schedule = asRecord(spec?.schedule);

  return (
    isBatchPlaneApiVersion(record.apiVersion) &&
    record.kind === "ExecutionRequest" &&
    isString(metadata?.requestId) &&
    isString(metadata?.batchId) &&
    spec?.contractVersion === "NATIVE_SCHEDULE_V2" &&
    spec.triggerType === "SCHEDULE" &&
    spec.expiresAt === undefined &&
    isString(workflow?.path) &&
    isString(workflow?.ref) &&
    isString(batch?.name) &&
    isString(batch?.owner) &&
    isString(batch?.domain) &&
    isString(batch?.environment) &&
    isString(batch?.criticality) &&
    isString(revision?.governedChangeId) &&
    isString(revision?.targetRevisionDigest) &&
    isString(schedule?.definitionCommitSha) &&
    isString(schedule?.definitionPath) &&
    isString(schedule?.repositoryId) &&
    isString(schedule?.scheduleId) &&
    isString(schedule?.sourceRunId) &&
    Number.isInteger(schedule?.sourceRunAttempt)
  );
}

function parseMarker(body: string, name: string): Map<string, string> {
  const marker = new Map<string, string>();
  const match = body.match(
    new RegExp(
      `<!--\\s*(?:batchplane|batchtrail):${name}\\s*([\\s\\S]*?)-->`,
      "u",
    ),
  );
  if (!match?.[1]) return marker;

  for (const line of match[1].split("\n")) {
    const separator = line.indexOf("=");
    if (separator > 0) {
      marker.set(
        line.slice(0, separator).trim(),
        line.slice(separator + 1).trim(),
      );
    }
  }
  return marker;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
