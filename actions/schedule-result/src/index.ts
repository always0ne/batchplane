import {
  createGitHubLiteClient,
  inspectNativeScheduleExecution,
  parseBatchDefinitionYaml,
  verifyNativeScheduleRequestIssue,
} from "@batchplane/github-lite";
import { pathToFileURL } from "node:url";

export type ScheduleResultInput = {
  apiBaseUrl?: string;
  batchId: string;
  businessJobId: string;
  businessJobName: string;
  businessResultHint: string;
  controlJobId: string;
  controlJobName: string;
  controlResultHint: string;
  definitionPath: string;
  eventName: string;
  fetcher?: typeof fetch;
  githubToken: string;
  issueNumber: string;
  repository: string;
  repositoryId: string;
  requestDigest: string;
  requestId: string;
  scheduleId: string;
  sourceRunAttempt: number;
  sourceRunId: string;
  workflowPath: string;
  workflowSha: string;
};

export type NativeScheduleResult =
  | "BLOCKED"
  | "CANCELED"
  | "FAILED"
  | "SUCCEEDED"
  | "UNCONFIRMED";

export async function recordNativeScheduleResult(
  input: ScheduleResultInput,
): Promise<NativeScheduleResult> {
  assertContext(input);
  const repository = parseRepository(input.repository);
  const issueNumber = parseIssueNumber(input.issueNumber);
  const client = createGitHubLiteClient({
    apiBaseUrl: input.apiBaseUrl ?? "https://api.github.com",
    fetcher: input.fetcher ?? fetch,
    token: input.githubToken,
  });
  const [issue, batchFile] = await Promise.all([
    client.getIssue({ ...repository, issueNumber }),
    client.getFile({
      ...repository,
      path: input.definitionPath,
      ref: input.workflowSha,
    }),
  ]);
  if (!issue || !batchFile)
    throw new Error("NATIVE_SCHEDULE_REQUEST_EVIDENCE_UNAVAILABLE");

  let batch;
  try {
    batch = parseBatchDefinitionYaml(batchFile.content);
  } catch {
    throw new Error("NATIVE_SCHEDULE_BATCH_SNAPSHOT_INVALID");
  }
  if (
    batch.batchId !== input.batchId ||
    batch.workflow.path !== input.workflowPath
  ) {
    throw new Error("NATIVE_SCHEDULE_WORKFLOW_MISMATCH");
  }
  const schedule = (batch.schedules ?? []).find(
    (candidate) => candidate.scheduleId === input.scheduleId,
  );
  if (!schedule) throw new Error("NATIVE_SCHEDULE_SNAPSHOT_MISMATCH");

  const approvedRevision = readRequestApprovedBatchRevision(issue.body);
  const request = await verifyNativeScheduleRequestIssue(issue.body, {
    approvedBatchRevision: approvedRevision,
    batch,
    occurrence: {
      definitionCommitSha: input.workflowSha,
      definitionPath: input.definitionPath,
      repositoryId: input.repositoryId,
      scheduleId: input.scheduleId,
      // A native request represents its first occurrence. A later rerun is
      // evidence about that same occurrence, not a new authorized request.
      sourceRunAttempt: 1,
      sourceRunId: input.sourceRunId,
    },
    requestDigest: input.requestDigest,
    requestId: input.requestId,
  });
  if (!request) throw new Error("NATIVE_SCHEDULE_REQUEST_UNVERIFIED");

  let proof:
    | Awaited<ReturnType<typeof inspectNativeScheduleExecution>>
    | {
        observation: "UNCONFIRMED";
        reason: string;
      };
  try {
    proof = await inspectNativeScheduleExecution({
      client,
      expectedOccurrence: {
        batchId: input.batchId,
        requestDigest: request.requestDigest,
        requestId: request.requestId,
        scheduleId: input.scheduleId,
      },
      expectedRepositoryId: input.repositoryId,
      expectedWorkflowPath: input.workflowPath,
      repository,
      runAttempt: input.sourceRunAttempt,
      runId: Number(input.sourceRunId),
      schedule,
    });
  } catch (error) {
    proof = {
      observation: "UNCONFIRMED",
      reason: `ACTIONS_API_UNAVAILABLE:${toErrorMessage(error)}`,
    };
  }

  const acknowledgement = await client.createIssueComment({
    ...repository,
    body: buildResultBody(input, proof),
    issueNumber,
  });
  if (!Number.isInteger(acknowledgement.id) || acknowledgement.id < 1) {
    throw new Error("RESULT_EVIDENCE_WRITE_UNACKNOWLEDGED");
  }
  return proof.observation;
}

export function readScheduleResultInputFromEnv(
  env: Record<string, string | undefined> = process.env,
): ScheduleResultInput {
  return {
    apiBaseUrl: env.GITHUB_API_URL,
    batchId: readActionInput(env, "batch-id"),
    businessJobId: readActionInput(env, "business-job-id"),
    businessJobName: readActionInput(env, "business-job-name"),
    businessResultHint: readActionInput(env, "business-result"),
    controlJobId: readActionInput(env, "control-job-id"),
    controlJobName: readActionInput(env, "control-job-name"),
    controlResultHint: readActionInput(env, "control-result"),
    definitionPath: readActionInput(env, "definition-path"),
    eventName: env.GITHUB_EVENT_NAME ?? "",
    githubToken: readActionInput(env, "github-token") || env.GITHUB_TOKEN || "",
    issueNumber: readActionInput(env, "issue-number"),
    repository: env.GITHUB_REPOSITORY ?? "",
    repositoryId: env.GITHUB_REPOSITORY_ID ?? "",
    requestDigest: readActionInput(env, "request-digest"),
    requestId: readActionInput(env, "request-id"),
    scheduleId: readActionInput(env, "schedule-id"),
    sourceRunAttempt: Number.parseInt(env.GITHUB_RUN_ATTEMPT ?? "", 10),
    sourceRunId: env.GITHUB_RUN_ID ?? "",
    workflowPath: readWorkflowPath(env.GITHUB_WORKFLOW_REF ?? ""),
    workflowSha: env.GITHUB_WORKFLOW_SHA ?? "",
  };
}

export async function run(env = process.env): Promise<NativeScheduleResult> {
  return recordNativeScheduleResult(readScheduleResultInputFromEnv(env));
}

function assertContext(input: ScheduleResultInput): void {
  if (
    input.eventName !== "schedule" ||
    !input.batchId ||
    !input.scheduleId ||
    !input.repositoryId ||
    !isPositiveIntegerString(input.sourceRunId) ||
    !Number.isInteger(input.sourceRunAttempt) ||
    input.sourceRunAttempt < 1 ||
    !input.requestId ||
    !input.requestDigest.startsWith("sha256:") ||
    !input.workflowPath ||
    !input.workflowSha ||
    !input.businessJobId ||
    !input.businessJobName ||
    !input.controlJobId ||
    !input.controlJobName ||
    !input.definitionPath
  ) {
    throw new Error("NATIVE_SCHEDULE_RESULT_CONTEXT_REQUIRED");
  }
}

function isPositiveIntegerString(value: string): boolean {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0;
}

function readRequestApprovedBatchRevision(body: string): {
  governedChangeId: string;
  targetRevisionDigest: string;
} {
  const match = body.match(
    /### Canonical payload\s*```json\s*([\s\S]*?)\s*```/u,
  );
  if (!match?.[1]) throw new Error("NATIVE_SCHEDULE_REQUEST_UNVERIFIED");
  try {
    const payload = JSON.parse(match[1]) as {
      spec?: {
        approvedBatchRevision?: {
          governedChangeId?: unknown;
          targetRevisionDigest?: unknown;
        };
      };
    };
    const revision = payload.spec?.approvedBatchRevision;
    if (
      typeof revision?.governedChangeId !== "string" ||
      typeof revision.targetRevisionDigest !== "string"
    ) {
      throw new Error("NATIVE_SCHEDULE_REQUEST_UNVERIFIED");
    }
    return revision as {
      governedChangeId: string;
      targetRevisionDigest: string;
    };
  } catch (error) {
    throw error instanceof Error
      ? error
      : new Error("NATIVE_SCHEDULE_REQUEST_UNVERIFIED");
  }
}

function buildResultBody(
  input: ScheduleResultInput,
  proof: {
    observation: NativeScheduleResult;
    reason?: string;
    run?: { id: number; runAttempt: number };
    controlGate?: { allowed: boolean; reasonCode?: string };
    controlJob?: { jobId: number; conclusion: string | null };
    entryGate?: { allowed: boolean; reasonCode?: string };
    businessJob?: {
      jobId: number;
      runStepConclusion?: string | null;
      conclusion: string | null;
    };
  },
): string {
  return [
    "## BatchPlane Native Schedule Result",
    "",
    `- Observation: ${proof.observation}`,
    `- Source Run: \`${input.sourceRunId}\``,
    `- Run attempt: ${input.sourceRunAttempt}`,
    "",
    "<!-- batchplane:schedule-result",
    `requestId=${input.requestId}`,
    `requestDigest=${input.requestDigest}`,
    `batchId=${input.batchId}`,
    `scheduleId=${input.scheduleId}`,
    `repositoryId=${input.repositoryId}`,
    `sourceRunId=${input.sourceRunId}`,
    "requestSourceRunAttempt=1",
    `controlJobId=${input.controlJobId}`,
    `controlJobName=${input.controlJobName}`,
    `businessJobId=${input.businessJobId}`,
    `businessJobName=${input.businessJobName}`,
    `workflowRunId=${proof.run?.id ?? ""}`,
    `workflowRunAttempt=${proof.run?.runAttempt ?? ""}`,
    `controlApiJobId=${proof.controlJob?.jobId ?? ""}`,
    `controlJobConclusion=${proof.controlJob?.conclusion ?? ""}`,
    `businessApiJobId=${proof.businessJob?.jobId ?? ""}`,
    `controlGateAllowed=${proof.controlGate?.allowed ?? ""}`,
    `controlGateReason=${proof.controlGate?.reasonCode ?? ""}`,
    `entryGateAllowed=${proof.entryGate?.allowed ?? ""}`,
    `entryGateReason=${proof.entryGate?.reasonCode ?? ""}`,
    `businessStepConclusion=${proof.businessJob?.runStepConclusion ?? ""}`,
    `businessJobConclusion=${proof.businessJob?.conclusion ?? ""}`,
    `observation=${proof.observation}`,
    `unconfirmedReason=${proof.reason ?? ""}`,
    `controlResultHint=${input.controlResultHint}`,
    `businessResultHint=${input.businessResultHint}`,
    "-->",
  ].join("\n");
}

function parseIssueNumber(value: string): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1)
    throw new Error("NATIVE_SCHEDULE_ISSUE_MISMATCH");
  return number;
}

function readActionInput(
  env: Record<string, string | undefined>,
  name: string,
): string {
  const key = `INPUT_${name.toUpperCase()}`;
  return (env[key] ?? env[key.replaceAll("-", "_")] ?? "").trim();
}

function readWorkflowPath(workflowRef: string): string {
  const marker = "/.github/workflows/";
  const start = workflowRef.indexOf(marker);
  const end = workflowRef.lastIndexOf("@");
  return start >= 0 && end > start ? workflowRef.slice(start + 1, end) : "";
}

function parseRepository(repository: string): { owner: string; repo: string } {
  const [owner = "", repo = "", ...rest] = repository.split("/");
  if (!owner || !repo || rest.length > 0)
    throw new Error("GITHUB_REPOSITORY_REQUIRED");
  return { owner, repo };
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await run();
}
