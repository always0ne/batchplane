import { appendFileSync, readFileSync } from "node:fs";
import { verifyLiteAuthorization } from "./gate-authorization.js";
import { parseRepository } from "./gate-github-client.js";
import type { GateInput, GateResult } from "./gate-types.js";

export function readGateInputFromEnv(
  env: Record<string, string | undefined> = process.env,
): GateInput {
  const eventName = env.GITHUB_EVENT_NAME;
  const eventSchedule = readNativeScheduleEvent(env);
  const workflowPath = readWorkflowPath(env.GITHUB_WORKFLOW_REF ?? "");
  const workflowRef = readWorkflowRef(env.GITHUB_WORKFLOW_REF ?? "");
  const recordEvidence = readActionInput(env, "record-evidence") === "true";
  return {
    mode: readActionInput(env, "mode"),
    batchId: readActionInput(env, "batch-id"),
    configPath: readActionInput(env, "config-path") || ".batch-governance",
    ref: readOptionalActionInput(env, "ref"),
    ...(eventName ? { eventName } : {}),
    ...(eventSchedule ? { eventSchedule } : {}),
    ...(env.GITHUB_REPOSITORY_ID
      ? { repositoryId: env.GITHUB_REPOSITORY_ID }
      : {}),
    ...(env.GITHUB_RUN_ID ? { sourceRunId: env.GITHUB_RUN_ID } : {}),
    ...(workflowPath ? { workflowPath } : {}),
    ...(workflowRef ? { workflowRef } : {}),
    ...(readOptionalActionInput(env, "issue-number")
      ? { issueNumber: readOptionalActionInput(env, "issue-number") }
      : {}),
    ...(recordEvidence ? { recordEvidence } : {}),
    ...(readOptionalActionInput(env, "controller-reason")
      ? { controllerReason: readOptionalActionInput(env, "controller-reason") }
      : {}),
    ...(readOptionalActionInput(env, "gate-job-name")
      ? { gateJobName: readOptionalActionInput(env, "gate-job-name") }
      : {}),
    ...(readOptionalActionInput(env, "gate-step-name")
      ? { gateStepName: readOptionalActionInput(env, "gate-step-name") }
      : {}),
    scheduleId: readOptionalActionInput(env, "schedule-id"),
    requestId: readOptionalActionInput(env, "request-id"),
    approvalSource: readOptionalActionInput(env, "approval-source"),
    approvalRef: readOptionalActionInput(env, "approval-ref"),
    requestDigest: readOptionalActionInput(env, "request-digest"),
    runAttempt: readRunAttempt(env),
    githubToken:
      readOptionalActionInput(env, "github-token") ?? env.GITHUB_TOKEN,
    repository: env.GITHUB_REPOSITORY,
    actor: env.GITHUB_ACTOR,
    expectedDispatcherActor:
      readOptionalActionInput(env, "dispatcher-actor") ?? "github-actions[bot]",
    apiBaseUrl: env.GITHUB_API_URL,
    ...(env.GITHUB_WORKFLOW_SHA
      ? { workflowSha: env.GITHUB_WORKFLOW_SHA }
      : {}),
  };
}

export async function runGateFromEnv(
  env: Record<string, string | undefined> = process.env,
): Promise<GateResult> {
  const input = readGateInputFromEnv(env);
  let result = await verifyLiteAuthorization(input);

  if (input.recordEvidence) {
    try {
      await recordNativeScheduleGateDecision(input, result);
    } catch (error) {
      const message = `Gate decision evidence could not be recorded: ${toErrorMessage(error)}`;
      if (result.result === "ALLOW") {
        result = deny("GATE_EVIDENCE_RECORDING_FAILED", message);
      } else {
        console.error(message);
      }
    }
  }
  writeGateOutputs(result, env);
  writeGateSummary(result, input, env);
  writeGateLogRecord(result, input, env);

  if (result.result === "DENY") {
    console.error(`BatchPlane Gate denied execution: ${result.reasonCode}`);
    console.error(result.message);
    process.exitCode = 1;
    return result;
  }

  console.log(`BatchPlane Gate allowed execution: ${result.message}`);
  return result;
}

async function recordNativeScheduleGateDecision(
  input: GateInput,
  result: GateResult,
): Promise<void> {
  if (
    input.eventName !== "schedule" ||
    !input.issueNumber ||
    !input.githubToken ||
    !input.repository
  ) {
    throw new Error(
      "Native Gate evidence requires issue, repository, and token inputs.",
    );
  }

  const issueNumber = Number(input.issueNumber);
  if (!Number.isInteger(issueNumber) || issueNumber < 1) {
    throw new Error("Native Gate evidence requires a positive Issue number.");
  }

  const { owner, repo } = parseRepository(input.repository);
  const body = [
    "## BatchPlane Native Schedule Gate",
    "",
    `- Decision: ${result.result}`,
    `- Source Run: \`${input.sourceRunId ?? ""}\``,
    `- Run attempt: ${input.runAttempt ?? "unavailable"}`,
    `- Schedule ID: \`${input.scheduleId ?? ""}\``,
    `- Reason: ${result.reasonCode ?? ""}`,
    "",
    "<!-- batchplane:gate-decision",
    `allowed=${result.result === "ALLOW"}`,
    `requestId=${input.requestId ?? ""}`,
    `batchId=${input.batchId}`,
    `requestDigest=${input.requestDigest ?? ""}`,
    `scheduleId=${input.scheduleId ?? ""}`,
    `repositoryId=${input.repositoryId ?? ""}`,
    `sourceRunId=${input.sourceRunId ?? ""}`,
    `sourceRunAttempt=${input.runAttempt ?? ""}`,
    ...(result.reasonCode ? [`reasonCode=${result.reasonCode}`] : []),
    "-->",
  ].join("\n");
  const response = await (input.fetcher ?? fetch)(
    `${(input.apiBaseUrl ?? "https://api.github.com").replace(/\/+$/u, "")}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/comments`,
    {
      body: JSON.stringify({ body }),
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${input.githubToken}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      method: "POST",
    },
  );

  if (!response.ok) {
    throw new Error(
      `GitHub API request failed: ${response.status} ${await response.text()}`,
    );
  }

  const acknowledgement = (await response.json()) as { id?: unknown };
  if (
    !Number.isInteger(acknowledgement.id) ||
    (acknowledgement.id as number) < 1
  ) {
    throw new Error(
      "GitHub Gate decision write acknowledgement was missing a comment ID.",
    );
  }
}

function readActionInput(
  env: Record<string, string | undefined>,
  name: string,
): string {
  const envKey = `INPUT_${name.toUpperCase()}`;
  const fallbackKey = envKey.replaceAll("-", "_");

  return (env[envKey] ?? env[fallbackKey] ?? "").trim();
}

function readOptionalActionInput(
  env: Record<string, string | undefined>,
  name: string,
): string | undefined {
  const value = readActionInput(env, name);

  return value || undefined;
}

function readRunAttempt(
  env: Record<string, string | undefined>,
): number | undefined {
  const raw = env.GITHUB_RUN_ATTEMPT;
  const value = raw ? Number(raw) : Number.NaN;
  const valid = Number.isInteger(value) && value > 0;

  if (env.GITHUB_EVENT_NAME === "schedule") {
    return valid ? value : undefined;
  }

  return valid ? value : 1;
}

function readNativeScheduleEvent(
  env: Record<string, string | undefined>,
): string {
  const path = env.GITHUB_EVENT_PATH;
  if (!path) return "";
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as {
      schedule?: unknown;
    };
    return typeof value.schedule === "string" ? value.schedule : "";
  } catch {
    return "";
  }
}

function readWorkflowPath(workflowRef: string): string {
  const marker = "/.github/workflows/";
  const start = workflowRef.indexOf(marker);
  const end = workflowRef.lastIndexOf("@");
  return start >= 0 && end > start ? workflowRef.slice(start + 1, end) : "";
}

function readWorkflowRef(workflowRef: string): string {
  const separator = workflowRef.lastIndexOf("@");
  const value = separator >= 0 ? workflowRef.slice(separator + 1) : "";
  return value.replace(/^refs\/heads\//u, "").trim();
}

function writeGateOutputs(
  result: GateResult,
  env: Record<string, string | undefined>,
): void {
  const outputPath = env.GITHUB_OUTPUT;

  if (!outputPath) {
    return;
  }

  appendFileSync(
    outputPath,
    [
      `result=${result.result}`,
      `reason_code=${result.reasonCode ?? ""}`,
      `message=${escapeOutputValue(result.message)}`,
      `verified_sha=${result.verifiedSha ?? ""}`,
    ].join("\n") + "\n",
    "utf8",
  );
}

function writeGateSummary(
  result: GateResult,
  input: GateInput,
  env: Record<string, string | undefined>,
): void {
  const summaryPath = env.GITHUB_STEP_SUMMARY;

  if (!summaryPath) {
    return;
  }

  const lines = [
    "## BatchPlane Gate Result",
    "",
    `- Result: ${result.result}`,
    `- Reason code: ${result.reasonCode ?? "N/A"}`,
    `- Message: ${result.message}`,
    `- Batch ID: ${input.batchId}`,
    `- Request ID: ${input.requestId ?? ""}`,
    `- Approval source: ${input.approvalSource ?? ""}`,
    `- Approval ref: ${input.approvalRef ?? ""}`,
  ];

  appendFileSync(summaryPath, `${lines.join("\n")}\n`, "utf8");
}

function writeGateLogRecord(
  result: GateResult,
  input: GateInput,
  env: Record<string, string | undefined>,
): void {
  const runId = env.GITHUB_RUN_ID?.trim();
  const repository = input.repository?.trim();
  const job = env.GITHUB_JOB?.trim();

  if (!runId || !repository || !job) {
    return;
  }

  console.log(
    `BATCHPLANE_GATE_RESULT ${JSON.stringify({
      gateJob: job,
      gateJobName: input.gateJobName ?? "BatchPlane Gate",
      gateStep: input.gateStepName ?? "Verify approved execution evidence",
      message: result.message,
      repository,
      result: result.result,
      runAttempt: input.runAttempt ?? 0,
      runId,
      version: 1,
      ...(input.batchId ? { batchId: input.batchId } : {}),
      ...(input.requestDigest ? { requestDigest: input.requestDigest } : {}),
      ...(input.requestId ? { requestId: input.requestId } : {}),
      ...(input.scheduleId ? { scheduleId: input.scheduleId } : {}),
      ...(result.reasonCode ? { reasonCode: result.reasonCode } : {}),
    })}`,
  );
}

function escapeOutputValue(value: string): string {
  return value.replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

function deny(reasonCode: string, message: string): GateResult {
  return { message, reasonCode, result: "DENY" };
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
