import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  createGitHubLiteClient,
  parseBatchDefinitionYaml,
  verifyApprovedBatchRevision,
  verifyNativeScheduleRequestIssue,
} from "@batchplane/github-lite";

import {
  parseYamlDocument,
  type RoleMappingFile,
  type WorkspaceApprovalMode,
  validateBatchDefinitionFile,
  validateRoleMappingFile,
  validateWorkspacePolicyFile,
} from "./gate-schema.js";

export type GateMode = "lite" | "server";

export type GateInput = {
  mode: GateMode | string;
  batchId: string;
  configPath: string;
  ref?: string;
  eventName?: string;
  eventSchedule?: string;
  repositoryId?: string;
  sourceRunId?: string;
  workflowPath?: string;
  workflowRef?: string;
  issueNumber?: string;
  recordEvidence?: boolean;
  controllerReason?: string;
  gateJobName?: string;
  gateStepName?: string;
  scheduleId?: string;
  requestId?: string;
  approvalSource?: string;
  approvalRef?: string;
  requestDigest?: string;
  runAttempt?: number;
  githubToken?: string;
  repository?: string;
  actor?: string;
  expectedDispatcherActor?: string;
  apiBaseUrl?: string;
  fetcher?: typeof fetch;
  workflowSha?: string;
};

export type GateResult = {
  result: "ALLOW" | "DENY";
  reasonCode?: string;
  message: string;
  verifiedSha?: string;
};

type BatchRevisionVerifier = typeof verifyApprovedBatchRevision;

type GateRepositoryRef = {
  owner: string;
  repo: string;
};

type BatchDefinitionSnapshot = {
  gateRequired: boolean;
  enabledScheduleIds: string[];
  enabledScheduleCronById: Map<string, string>;
  status: string;
  workflowPath: string;
  workflowRef: string;
};

type ApprovalCommand = {
  digest: string;
};

export function verifyLiteInput(input: GateInput): GateResult {
  if (input.mode !== "lite") {
    return {
      result: "DENY",
      reasonCode: "UNSUPPORTED_MODE",
      message: "Only lite mode is scaffolded.",
    };
  }

  if (!input.batchId) {
    return {
      result: "DENY",
      reasonCode: "BATCH_ID_REQUIRED",
      message: "Batch ID is required.",
    };
  }

  if ((input.runAttempt ?? 1) > 1) {
    return {
      result: "DENY",
      reasonCode: "RERUN_NOT_AUTHORIZED",
      message:
        "GitHub Actions reruns are not authorized by BatchPlane. Create a new execution request or approved retry instead.",
    };
  }

  if (!input.requestId) {
    return {
      result: "DENY",
      reasonCode: input.controllerReason || "EXECUTION_REQUEST_REQUIRED",
      message: input.controllerReason
        ? `Native schedule controller denied this occurrence: ${input.controllerReason}.`
        : "Execution request evidence is required.",
    };
  }

  if (!input.requestDigest?.startsWith("sha256:")) {
    return {
      result: "DENY",
      reasonCode: "REQUEST_DIGEST_REQUIRED",
      message: "Approved request digest is required.",
    };
  }

  return input.eventName === "schedule"
    ? verifyNativeScheduleInput(input)
    : verifyManualGateInput(input);
}

function verifyManualGateInput(input: GateInput): GateResult {
  if (!input.approvalSource || !input.approvalRef) {
    return deny(
      "APPROVAL_EVIDENCE_REQUIRED",
      "Approval evidence source and reference are required.",
    );
  }

  return {
    result: "ALLOW",
    message: "Manual execution request evidence is present.",
  };
}

function verifyNativeScheduleInput(input: GateInput): GateResult {
  if (
    !input.eventSchedule?.trim() ||
    !input.repositoryId?.trim() ||
    !isPositiveIntegerString(input.sourceRunId) ||
    !Number.isInteger(input.runAttempt) ||
    (input.runAttempt ?? 0) < 1 ||
    !input.workflowPath?.trim() ||
    !input.workflowRef?.trim() ||
    !input.workflowSha?.trim()
  ) {
    return deny(
      "NATIVE_SCHEDULE_CONTEXT_REQUIRED",
      "GitHub schedule event, repository, Run, workflow path, ref, and SHA context are required.",
    );
  }

  return {
    result: "ALLOW",
    message: "Native schedule occurrence context is present.",
  };
}

export async function verifyLiteAuthorization(
  input: GateInput,
  verifyBatchRevision: BatchRevisionVerifier = verifyApprovedBatchRevision,
): Promise<GateResult> {
  const inputResult = verifyLiteInput(input);

  if (inputResult.result === "DENY") {
    return inputResult;
  }

  const expectedActor = input.expectedDispatcherActor ?? "github-actions[bot]";

  if (
    input.eventName !== "schedule" &&
    input.actor &&
    input.actor !== expectedActor
  ) {
    return {
      result: "DENY",
      reasonCode: "DIRECT_DISPATCH_NOT_AUTHORIZED",
      message: `Workflow actor ${input.actor} is not the BatchPlane dispatcher actor ${expectedActor}.`,
    };
  }

  if (!input.githubToken || !input.repository) {
    return {
      result: "DENY",
      reasonCode: "GITHUB_EVIDENCE_LOOKUP_REQUIRED",
      message: "GitHub token and repository are required to verify evidence.",
    };
  }

  const repository = parseRepository(input.repository);
  const client = createGateGitHubClient({
    apiBaseUrl: input.apiBaseUrl ?? "https://api.github.com",
    fetcher: input.fetcher ?? fetch,
    owner: repository.owner,
    repo: repository.repo,
    token: input.githubToken,
  });

  let evidence: GateEvidence;

  try {
    evidence = await findGitHubApprovalEvidence({
      client,
      issueNumber:
        input.eventName === "schedule"
          ? parseNativeIssueNumber(input.issueNumber)
          : undefined,
      loadApproval: input.eventName !== "schedule",
      requestId: input.requestId ?? "",
    });
  } catch (error) {
    return deny(
      "GITHUB_EVIDENCE_LOOKUP_FAILED",
      `GitHub evidence lookup failed: ${toErrorMessage(error)}`,
    );
  }

  if (!evidence.request) {
    return deny(
      "REQUEST_EVIDENCE_NOT_FOUND",
      "Execution request Issue evidence was not found.",
    );
  }

  if (input.eventName === "schedule") {
    const suppliedIssueNumber = Number(input.issueNumber);
    if (
      !Number.isInteger(suppliedIssueNumber) ||
      suppliedIssueNumber < 1 ||
      evidence.issueNumber !== suppliedIssueNumber
    ) {
      return deny(
        "NATIVE_SCHEDULE_ISSUE_MISMATCH",
        "The schedule control Issue number does not identify the exact canonical request evidence.",
      );
    }
  }

  if (
    evidence.request.requestId !== input.requestId ||
    evidence.request.batchId !== input.batchId ||
    evidence.request.requestDigest !== input.requestDigest
  ) {
    return deny(
      "REQUEST_EVIDENCE_MISMATCH",
      "Execution request evidence does not match workflow inputs.",
    );
  }

  if (evidence.request.status !== "REQUESTED") {
    return deny(
      "REQUEST_NOT_REQUESTED",
      `Execution request status is ${evidence.request.status}.`,
    );
  }

  if (input.eventName !== "schedule" && input.approvalSource !== "issue") {
    return deny(
      "APPROVAL_SOURCE_NOT_SUPPORTED",
      `Approval source ${input.approvalSource} is not supported.`,
    );
  }

  if (
    input.eventName !== "schedule" &&
    input.approvalRef !== evidence.request.requestId
  ) {
    return deny(
      "APPROVAL_REFERENCE_MISMATCH",
      "Approval reference does not match the execution request.",
    );
  }

  const batchValidation = await validateBatchPolicyEvidence({
    batchId: input.batchId,
    client,
    configPath: input.configPath,
    inputRef: input.eventName === "schedule" ? input.workflowRef : input.ref,
    eventSchedule:
      input.eventName === "schedule" ? input.eventSchedule : undefined,
    actualWorkflowPath:
      input.eventName === "schedule" ? input.workflowPath : undefined,
    actualWorkflowRef:
      input.eventName === "schedule" ? input.workflowRef : undefined,
    repository,
    request: evidence.request,
  });

  if (batchValidation.result === "DENY") {
    return batchValidation;
  }

  const authorization =
    input.eventName === "schedule"
      ? await verifyNativeScheduleAuthorization({
          batch: await loadNativeScheduleBatch({ client, input }),
          evidence,
          input,
        })
      : await verifyManualAuthorization({
          client,
          evidence,
          input,
          repository,
        });

  if (authorization.result === "DENY") {
    return authorization;
  }

  if (!input.workflowSha) {
    return deny(
      "WORKFLOW_SOURCE_SHA_REQUIRED",
      "The immutable workflow source SHA is required to verify registered Batch artifacts.",
    );
  }

  const revisionValidation = await verifyBatchRevision({
    batchId: input.batchId,
    client: createGitHubLiteClient({
      apiBaseUrl: input.apiBaseUrl ?? "https://api.github.com",
      fetcher: input.fetcher ?? fetch,
      token: input.githubToken,
    }),
    executionWorkflowSha: input.workflowSha,
    expectedRevision: evidence.request.approvedBatchRevision,
    repository,
  });
  if (revisionValidation.controlStatus !== "VERIFIED") {
    return deny(
      revisionValidation.reasonCode,
      revisionValidation.controlStatus === "UNKNOWN"
        ? "Approved Batch revision could not be verified."
        : "Batch revision does not match the latest approved governed change.",
    );
  }
  if (!isCommitSha(revisionValidation.verifiedSha)) {
    return deny(
      "VERIFIED_SHA_INVALID",
      "Approved Batch revision did not resolve to an immutable commit SHA.",
    );
  }

  return {
    result: "ALLOW",
    verifiedSha: revisionValidation.verifiedSha,
    message: authorization.message,
  };
}

async function verifyNativeScheduleAuthorization({
  batch,
  evidence,
  input,
}: {
  batch: import("@batchplane/domain").BatchDefinition | null;
  evidence: GateEvidence;
  input: GateInput;
}): Promise<GateResult> {
  const request = evidence.request;
  if (!request || !evidence.issueBody || !batch) {
    return deny(
      "NATIVE_SCHEDULE_REQUEST_UNVERIFIED",
      "Native schedule request or its current Batch snapshot could not be verified.",
    );
  }
  const scheduleMapping = validateScheduleMapping({
    request,
    scheduleId: input.scheduleId,
  });

  if (scheduleMapping.result === "DENY") {
    return scheduleMapping;
  }

  const occurrence = request.schedule;

  if (
    request.triggerType !== "SCHEDULE" ||
    !occurrence ||
    input.runAttempt !== 1 ||
    occurrence.repositoryId !== input.repositoryId ||
    occurrence.sourceRunId !== input.sourceRunId ||
    occurrence.sourceRunAttempt !== input.runAttempt
  ) {
    return deny(
      "NATIVE_SCHEDULE_OCCURRENCE_MISMATCH",
      "Native schedule Run, attempt, repository, or occurrence evidence does not match the request.",
    );
  }

  const verifiedRequest = await verifyNativeScheduleRequestIssue(
    evidence.issueBody,
    {
      approvedBatchRevision: request.approvedBatchRevision,
      batch,
      occurrence: {
        definitionCommitSha: input.workflowSha ?? "",
        definitionPath: `${input.configPath.replace(/\/+$/u, "")}/batches/${input.batchId}.yml`,
        repositoryId: input.repositoryId ?? "",
        scheduleId: input.scheduleId ?? "",
        sourceRunAttempt: input.runAttempt ?? 0,
        sourceRunId: input.sourceRunId ?? "",
      },
      requestDigest: input.requestDigest ?? "",
      requestId: input.requestId ?? "",
    },
  );

  if (!verifiedRequest) {
    return deny(
      "NATIVE_SCHEDULE_REQUEST_UNVERIFIED",
      "Native schedule request marker, digest, source tuple, workflow, revision, or Batch snapshot does not match.",
    );
  }

  return {
    message:
      "Native schedule occurrence and approved Batch revision evidence are verified.",
    result: "ALLOW",
  };
}

async function loadNativeScheduleBatch({
  client,
  input,
}: {
  client: GateGitHubClient;
  input: GateInput;
}): Promise<import("@batchplane/domain").BatchDefinition | null> {
  const ref = input.workflowSha?.trim();
  if (!ref) return null;
  const path = `${input.configPath.replace(/\/+$/u, "")}/batches/${input.batchId}.yml`;
  try {
    const file = await client.getFile(path, ref);
    if (!file) return null;
    return parseBatchDefinitionYaml(file.content);
  } catch {
    return null;
  }
}

async function verifyManualAuthorization({
  client,
  evidence,
  input,
  repository,
}: {
  client: GateGitHubClient;
  evidence: GateEvidence;
  input: GateInput;
  repository: GateRepositoryRef;
}): Promise<GateResult> {
  const request = evidence.request;
  const approval = evidence.approval;

  if (!request || !approval) {
    return deny(
      "EXECUTION_REQUEST_NOT_APPROVED",
      "Execution request does not have approved comment evidence.",
    );
  }

  if (approval.edited) {
    return deny(
      "APPROVAL_COMMENT_EDITED",
      "Execution approval comment was edited after creation.",
    );
  }

  if (
    approval.commandDigest &&
    approval.commandDigest !== request.requestDigest
  ) {
    return deny(
      "REQUEST_DIGEST_MISMATCH",
      "Approval command digest does not match execution request digest.",
    );
  }

  if (
    approval.requestDigest !== input.requestDigest ||
    approval.requestDigest !== request.requestDigest
  ) {
    return deny(
      "REQUEST_DIGEST_MISMATCH",
      "Execution approval digest does not match execution request digest.",
    );
  }

  if (approval.approvalType === "SCHEDULE_DELEGATED") {
    return deny(
      "SCHEDULE_DELEGATED_APPROVAL_NOT_SUPPORTED",
      "Delegated schedule approval evidence is historical and cannot authorize a new execution.",
    );
  }

  let workspaceApprovalMode: WorkspaceApprovalMode;

  try {
    workspaceApprovalMode = await readWorkspaceApprovalMode({
      client,
      configPath: input.configPath,
      ref: request.workflowRef || input.ref,
    });
  } catch (error) {
    return deny(
      "WORKSPACE_POLICY_LOOKUP_FAILED",
      `Workspace policy lookup failed: ${toErrorMessage(error)}`,
    );
  }

  if (approval.approvalType === "WORKSPACE_AUTO_APPROVED") {
    return workspaceApprovalMode === "AUTO_APPROVE"
      ? {
          message:
            "Execution request, Workspace auto-approval evidence, and batch policy are verified.",
          result: "ALLOW",
        }
      : deny(
          "WORKSPACE_AUTO_APPROVAL_NOT_ALLOWED",
          "Workspace auto-approval evidence requires AUTO_APPROVE policy mode.",
        );
  }

  if (
    approval.approver === request.requestedBy &&
    !allowsSelfApproval(workspaceApprovalMode)
  ) {
    return deny(
      "SELF_APPROVAL_NOT_ALLOWED",
      "Requester and approver must be different users.",
    );
  }

  const approverAuthorized = await verifyApproverAuthorization({
    allowMissingRoleMapping:
      approval.approver === request.requestedBy &&
      allowsSelfApproval(workspaceApprovalMode),
    approver: approval.approver,
    client,
    configPath: input.configPath,
    ref: request.workflowRef || input.ref,
    repository,
  });

  if (!approverAuthorized.allowed) {
    return deny(
      "APPROVER_NOT_AUTHORIZED",
      approverAuthorized.message ||
        `Approver @${approval.approver} is not authorized.`,
    );
  }

  return {
    message:
      "Execution request, approval evidence, and batch policy are verified.",
    result: "ALLOW",
  };
}

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

function isPositiveIntegerString(value: string | undefined): boolean {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0;
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

function isCommitSha(value: string): boolean {
  return /^[0-9a-f]{40}$/iu.test(value);
}

type GateEvidence = {
  issueBody?: string;
  issueNumber?: number;
  request: ExecutionRequestEvidence | null;
  approval: ExecutionApprovalEvidence | null;
};

type ExecutionRequestEvidence = {
  approvedBatchRevision: {
    governedChangeId: string;
    targetRevisionDigest: string;
  };
  batchId: string;
  requestedBy: string;
  requestDigest: string;
  requestId: string;
  scheduleId?: string;
  schedule?: {
    repositoryId: string;
    sourceRunAttempt: number;
    sourceRunId: string;
  };
  status: string;
  triggerType?: string;
  workflowPath: string;
  workflowRef: string;
};

type ExecutionApprovalEvidence = {
  approvalType?: string;
  approver: string;
  batchId: string;
  commandDigest: string | null;
  edited: boolean;
  requestDigest: string;
  requestId: string;
};

type GitHubIssueResponse = {
  body: string | null;
  number: number;
  pull_request?: unknown;
};

type GitHubIssueCommentResponse = {
  body: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  user?: {
    login?: string;
  } | null;
};

type GitHubContentFileResponse = {
  content?: string | null;
  encoding?: string | null;
  path?: string | null;
};

type GitHubRepositoryPermissionResponse = {
  permission?: string | null;
  role_name?: string | null;
  user?: {
    login?: string;
  } | null;
};

type GitHubTeamMembershipResponse = {
  role?: string | null;
  state?: string | null;
};

type GateIssueComment = {
  author: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

type GateGitHubClient = ReturnType<typeof createGateGitHubClient>;

type ApproverSelectorSnapshot = {
  githubTeams: string[];
  githubUsers: string[];
  repositoryRoles: string[];
};

function deny(reasonCode: string, message: string): GateResult {
  return {
    message,
    reasonCode,
    result: "DENY",
  };
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function allowsSelfApproval(mode: WorkspaceApprovalMode): boolean {
  return mode === "SELF_APPROVAL_ALLOWED" || mode === "AUTO_APPROVE";
}

async function findGitHubApprovalEvidence({
  client,
  issueNumber,
  loadApproval,
  requestId,
}: {
  client: GateGitHubClient;
  issueNumber?: number;
  loadApproval: boolean;
  requestId: string;
}): Promise<GateEvidence> {
  const issue =
    issueNumber === undefined
      ? await client.findExecutionRequestIssue(requestId)
      : await client.getIssue(issueNumber);

  if (!issue) {
    return { approval: null, request: null };
  }

  const request = parseExecutionRequestEvidence(issue.body);

  if (!request) {
    return { approval: null, request: null };
  }

  const approval = loadApproval
    ? ((await client.listIssueComments(issue.number))
        .map(parseExecutionApprovalEvidence)
        .find((evidence) =>
          evidence
            ? evidence.requestId === request.requestId &&
              evidence.batchId === request.batchId &&
              evidence.requestDigest === request.requestDigest
            : false,
        ) ?? null)
    : null;

  return {
    approval,
    issueBody: issue.body,
    issueNumber: issue.number,
    request,
  };
}

function parseNativeIssueNumber(value: string | undefined): number {
  const issueNumber = Number(value);
  if (!Number.isInteger(issueNumber) || issueNumber < 1) {
    throw new Error("NATIVE_SCHEDULE_ISSUE_MISMATCH");
  }
  return issueNumber;
}

async function validateBatchPolicyEvidence({
  batchId,
  client,
  configPath,
  eventSchedule,
  actualWorkflowPath,
  actualWorkflowRef,
  inputRef,
  repository,
  request,
}: {
  batchId: string;
  client: GateGitHubClient;
  configPath: string;
  eventSchedule?: string;
  actualWorkflowPath?: string;
  actualWorkflowRef?: string;
  inputRef?: string;
  repository: GateRepositoryRef;
  request: ExecutionRequestEvidence;
}): Promise<GateResult> {
  const effectiveConfigPath = configPath.replace(/\/+$/u, "");
  const effectiveRef = inputRef || request.workflowRef;
  const batchPath = `${effectiveConfigPath}/batches/${batchId}.yml`;
  const batchFile = await client.getFile(batchPath, effectiveRef);

  if (!batchFile) {
    return deny(
      "BATCH_NOT_FOUND",
      `Batch definition was not found: ${batchPath} (${effectiveRef || "default ref"}).`,
    );
  }

  const snapshot = parseBatchDefinitionSnapshot(batchFile.content);

  if (!snapshot) {
    return deny(
      "BATCH_DEFINITION_INVALID",
      `Batch definition is invalid: ${batchPath}.`,
    );
  }

  if (snapshot.status !== "ACTIVE") {
    return deny(
      "BATCH_NOT_ACTIVE",
      `Batch ${batchId} is ${snapshot.status} and cannot run.`,
    );
  }

  if (!snapshot.gateRequired) {
    return deny(
      "GATE_REQUIRED",
      `Batch ${batchId} does not enforce BatchPlane Gate.`,
    );
  }

  if (request.workflowRef && snapshot.workflowRef) {
    const requestRef = request.workflowRef.trim();
    const registeredRef = snapshot.workflowRef.trim();

    if (requestRef && registeredRef && requestRef !== registeredRef) {
      return deny(
        "REF_NOT_ALLOWED",
        `Workflow ref ${requestRef} is not allowed for batch ${batchId}; expected ${registeredRef}.`,
      );
    }
  }

  if (request.workflowPath && snapshot.workflowPath) {
    const requestPath = request.workflowPath.trim();
    const registeredPath = snapshot.workflowPath.trim();

    if (requestPath && registeredPath && requestPath !== registeredPath) {
      return deny(
        "WORKFLOW_NOT_ALLOWED",
        `Workflow path ${requestPath} is not registered for batch ${batchId}.`,
      );
    }
  }

  if (actualWorkflowPath && snapshot.workflowPath !== actualWorkflowPath) {
    return deny(
      "WORKFLOW_NOT_ALLOWED",
      `Running workflow ${actualWorkflowPath} is not registered for batch ${batchId}.`,
    );
  }

  if (actualWorkflowRef && snapshot.workflowRef !== actualWorkflowRef) {
    return deny(
      "REF_NOT_ALLOWED",
      `Running workflow ref ${actualWorkflowRef} is not registered for batch ${batchId}.`,
    );
  }

  if (request.triggerType === "SCHEDULE") {
    if (!request.scheduleId) {
      return deny(
        "SCHEDULE_NOT_MAPPED",
        "Scheduled execution request does not contain a schedule identifier.",
      );
    }

    if (!snapshot.enabledScheduleIds.includes(request.scheduleId)) {
      return deny(
        "SCHEDULE_NOT_REGISTERED",
        `Schedule ${request.scheduleId} is not enabled in batch ${batchId}.`,
      );
    }

    if (
      eventSchedule?.trim() &&
      snapshot.enabledScheduleCronById.get(request.scheduleId) !==
        eventSchedule.trim()
    ) {
      return deny(
        "NATIVE_SCHEDULE_CRON_MISMATCH",
        "Native GitHub schedule expression does not match the registered schedule.",
      );
    }
  }

  if (!effectiveRef) {
    return deny(
      "REQUEST_EVIDENCE_MISMATCH",
      `Workflow ref information is missing for batch ${batchId} validation.`,
    );
  }

  if (repository.owner.trim() === "") {
    return deny("UNKNOWN", "Repository owner is required for team validation.");
  }

  return { message: "Batch policy evidence is verified.", result: "ALLOW" };
}

async function readWorkspaceApprovalMode({
  client,
  configPath,
  ref,
}: {
  client: GateGitHubClient;
  configPath: string;
  ref?: string;
}): Promise<WorkspaceApprovalMode> {
  const effectiveRef = ref?.trim();

  if (!effectiveRef) {
    return "SELF_APPROVAL_BLOCKED";
  }

  const workspacePolicyPath = `${configPath.replace(/\/+$/u, "")}/workspace.yml`;
  const workspacePolicyFile = await client.getFile(
    workspacePolicyPath,
    effectiveRef,
  );

  if (!workspacePolicyFile) {
    return "SELF_APPROVAL_BLOCKED";
  }

  const parsed = parseYamlDocument(workspacePolicyFile.content);

  if (!parsed.ok) {
    throw new Error(
      `Workspace policy YAML is invalid: ${workspacePolicyPath}.`,
    );
  }

  const validated = validateWorkspacePolicyFile(parsed.value);

  if (!validated.ok) {
    throw new Error(`Workspace policy is invalid: ${workspacePolicyPath}.`);
  }

  return validated.value.spec.approval.mode;
}

function validateScheduleMapping({
  request,
  scheduleId,
}: {
  request: ExecutionRequestEvidence;
  scheduleId?: string;
}): GateResult {
  if (!scheduleId) {
    return { message: "Schedule mapping is not required.", result: "ALLOW" };
  }

  if (!request.scheduleId || request.scheduleId !== scheduleId) {
    return deny(
      "SCHEDULE_NOT_MAPPED",
      `Schedule ${scheduleId} is not mapped to this execution request.`,
    );
  }

  return { message: "Schedule mapping is verified.", result: "ALLOW" };
}

async function verifyApproverAuthorization({
  allowMissingRoleMapping,
  approver,
  client,
  configPath,
  ref,
  repository,
}: {
  allowMissingRoleMapping?: boolean;
  approver: string;
  client: GateGitHubClient;
  configPath: string;
  ref?: string;
  repository: GateRepositoryRef;
}): Promise<{ allowed: boolean; message?: string }> {
  const effectiveRef = ref?.trim();

  if (!effectiveRef) {
    return {
      allowed: false,
      message: "Workflow ref is required for approver authorization.",
    };
  }

  const roleMappingPath = `${configPath.replace(/\/+$/u, "")}/policies/role-mapping.yml`;
  const roleMappingFile = await client.getFile(roleMappingPath, effectiveRef);

  if (!roleMappingFile) {
    if (allowMissingRoleMapping) {
      return { allowed: true };
    }

    return {
      allowed: false,
      message: `Role mapping file was not found: ${roleMappingPath}.`,
    };
  }

  const selector = parseApproverSelectorFromRoleMappingFile(
    roleMappingFile.content,
  );

  if (!selector) {
    return {
      allowed: false,
      message: `Role mapping file is invalid: ${roleMappingPath}.`,
    };
  }

  const normalizedApprover = approver.trim().toLowerCase();

  if (selector.githubUsers.length > 0) {
    const hasUserMatch = selector.githubUsers
      .map((value) => value.toLowerCase())
      .includes(normalizedApprover);

    if (hasUserMatch) {
      return { allowed: true };
    }
  }

  if (selector.repositoryRoles.length > 0) {
    const permission = await client.getRepositoryPermissionForUser(approver);
    const normalizedRoles = selector.repositoryRoles.map((value) =>
      value.toLowerCase(),
    );
    const actualRole = permission.roleName?.toLowerCase() ?? "";
    const fallbackRole = permission.permission.toLowerCase();

    if (
      normalizedRoles.includes(actualRole) ||
      normalizedRoles.includes(fallbackRole)
    ) {
      return { allowed: true };
    }
  }

  if (selector.githubTeams.length > 0) {
    for (const teamSlug of selector.githubTeams) {
      const membership = await client.getTeamMembershipForUser({
        org: repository.owner,
        teamSlug,
        username: approver,
      });

      if (membership?.state === "active") {
        return { allowed: true };
      }
    }
  }

  return { allowed: false };
}

function createGateGitHubClient({
  apiBaseUrl,
  fetcher,
  owner,
  repo,
  token,
}: {
  apiBaseUrl: string;
  fetcher: typeof fetch;
  owner: string;
  repo: string;
  token: string;
}) {
  async function request<T>(
    path: string,
    options: { allowNotFound?: boolean } = {},
  ): Promise<T | null> {
    const response = await fetcher(`${apiBaseUrl.replace(/\/+$/, "")}${path}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (response.status === 404 && options.allowNotFound) {
      return null;
    }

    if (!response.ok) {
      throw new Error(
        `GitHub API request failed: ${response.status} ${await response.text()}`,
      );
    }

    if (response.status === 204) {
      return null;
    }

    return (await response.json()) as T;
  }

  const repoPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  return {
    async getIssue(issueNumber: number) {
      const issue = await request<GitHubIssueResponse>(
        `${repoPath}/issues/${issueNumber}`,
        { allowNotFound: true },
      );
      if (!issue || issue.pull_request) return null;
      return { body: issue.body ?? "", number: issue.number };
    },

    async findExecutionRequestIssue(requestId: string) {
      for (let page = 1; page <= 5; page += 1) {
        const issues = await request<GitHubIssueResponse[]>(
          `${repoPath}/issues?state=all&per_page=100&page=${page}`,
        );

        if (!issues?.length) {
          return null;
        }

        const issue = issues.find((candidate) => {
          if (candidate.pull_request) {
            return false;
          }

          const request = parseExecutionRequestEvidence(candidate.body ?? "");

          return request?.requestId === requestId;
        });

        if (issue) {
          return {
            body: issue.body ?? "",
            number: issue.number,
          };
        }
      }

      return null;
    },

    async listIssueComments(issueNumber: number) {
      const comments: GateIssueComment[] = [];

      for (let page = 1; page <= 5; page += 1) {
        const response = await request<GitHubIssueCommentResponse[]>(
          `${repoPath}/issues/${issueNumber}/comments?per_page=100&page=${page}`,
        );

        if (!response?.length) {
          break;
        }

        comments.push(
          ...response.map((comment) => ({
            author: comment.user?.login?.trim() ?? "",
            body: comment.body ?? "",
            createdAt: comment.created_at ?? "",
            updatedAt: comment.updated_at ?? "",
          })),
        );
      }

      return comments;
    },

    async getFile(path: string, ref?: string) {
      const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
      const response = await request<GitHubContentFileResponse>(
        `${repoPath}/contents/${encodePath(path)}${query}`,
        { allowNotFound: true },
      );

      if (!response) {
        return null;
      }

      if (response.encoding !== "base64" || !response.content) {
        throw new Error(`Unsupported GitHub file encoding for ${path}.`);
      }

      return {
        content: decodeBase64(response.content),
        path: response.path ?? path,
      };
    },

    async getRepositoryPermissionForUser(username: string) {
      const response = await request<GitHubRepositoryPermissionResponse>(
        `${repoPath}/collaborators/${encodeURIComponent(username)}/permission`,
        { allowNotFound: true },
      );

      if (!response) {
        return {
          permission: "none",
          roleName: "none",
          username,
        };
      }

      return {
        permission:
          normalizePermissionValue(response.permission) ??
          normalizePermissionValue(response.role_name) ??
          "none",
        roleName:
          normalizePermissionValue(response.role_name) ??
          normalizePermissionValue(response.permission) ??
          "none",
        username: response.user?.login?.trim() || username,
      };
    },

    async getTeamMembershipForUser({
      org,
      teamSlug,
      username,
    }: {
      org: string;
      teamSlug: string;
      username: string;
    }) {
      const response = await request<GitHubTeamMembershipResponse>(
        `/orgs/${encodeURIComponent(org)}/teams/${encodeURIComponent(
          teamSlug,
        )}/memberships/${encodeURIComponent(username)}`,
        { allowNotFound: true },
      );

      if (!response) {
        return null;
      }

      return {
        role: response.role ?? "",
        state: response.state ?? "",
      };
    },
  };
}

function parseRepository(repository: string): { owner: string; repo: string } {
  const [owner, repo] = repository.split("/");

  if (!owner || !repo) {
    throw new Error("GITHUB_REPOSITORY must be in owner/repo form.");
  }

  return { owner, repo };
}

function parseExecutionRequestEvidence(
  issueBody: string,
): ExecutionRequestEvidence | null {
  const marker = parseBatchPlaneMarker(issueBody, "execution-request");
  const requestId =
    marker.get("requestId") ?? readMarkdownField(issueBody, "Request ID");
  const batchId =
    marker.get("batchId") ?? readMarkdownField(issueBody, "Batch ID");
  const requestDigest =
    marker.get("requestDigest") ??
    readMarkdownField(issueBody, "Request digest");
  const status = marker.get("status") ?? readMarkdownField(issueBody, "Status");
  const payload = parseCanonicalPayload(issueBody);
  const approvedBatchRevision = readApprovedBatchRevision(payload);
  const workflow = readWorkflowTarget(payload);
  const requestedBy =
    readMarkdownField(issueBody, "Requested by").replace(/^@/, "") ||
    readRequestedBy(payload);
  const scheduleId = readScheduleId(payload);
  const schedule = readNativeScheduleOccurrence(payload);
  const triggerType = readTriggerType(payload);

  if (
    !requestId ||
    !batchId ||
    !requestDigest ||
    !status ||
    !approvedBatchRevision
  ) {
    return null;
  }

  return {
    approvedBatchRevision,
    batchId,
    ...(scheduleId ? { scheduleId } : {}),
    ...(schedule ? { schedule } : {}),
    requestedBy,
    requestDigest,
    requestId,
    ...(triggerType ? { triggerType } : {}),
    status,
    workflowPath: workflow.path,
    workflowRef: workflow.ref,
  };
}

function readApprovedBatchRevision(payload: unknown): {
  governedChangeId: string;
  targetRevisionDigest: string;
} | null {
  if (!payload || typeof payload !== "object") return null;
  const spec = (payload as { spec?: unknown }).spec;
  if (!spec || typeof spec !== "object") return null;
  const revision = (spec as { approvedBatchRevision?: unknown })
    .approvedBatchRevision;
  if (!revision || typeof revision !== "object") return null;
  const governedChangeId = (revision as { governedChangeId?: unknown })
    .governedChangeId;
  const targetRevisionDigest = (revision as { targetRevisionDigest?: unknown })
    .targetRevisionDigest;

  return typeof governedChangeId === "string" &&
    typeof targetRevisionDigest === "string" &&
    governedChangeId.trim() &&
    targetRevisionDigest.startsWith("sha256:")
    ? { governedChangeId, targetRevisionDigest }
    : null;
}

function parseExecutionApprovalEvidence(
  comment: GateIssueComment,
): ExecutionApprovalEvidence | null {
  const commentBody = comment.body;

  if (!commentBody.startsWith("/bgcp approve ")) {
    return null;
  }

  const command = parseApprovalCommand(commentBody);
  const marker = parseBatchPlaneMarker(commentBody, "execution-approval");
  const decision = marker.get("decision");
  const requestId =
    marker.get("requestId") ?? readMarkdownField(commentBody, "Request ID");
  const batchId =
    marker.get("batchId") ?? readMarkdownField(commentBody, "Batch ID");
  const requestDigest =
    marker.get("requestDigest") ??
    readMarkdownField(commentBody, "Request digest");
  const approvalType =
    marker.get("approvalType") ??
    readMarkdownField(commentBody, "Approval type");

  if (decision !== "APPROVED" || !requestId || !batchId || !requestDigest) {
    return null;
  }

  return {
    ...(approvalType ? { approvalType } : {}),
    approver:
      comment.author ||
      readMarkdownField(commentBody, "Approver").replace(/^@/, ""),
    batchId,
    commandDigest: command?.digest ?? null,
    edited: isEditedComment(comment),
    requestDigest,
    requestId,
  };
}

function parseBatchDefinitionSnapshot(
  content: string,
): BatchDefinitionSnapshot | null {
  const parsed = parseYamlDocument(content);

  if (!parsed.ok) {
    return null;
  }

  const validated = validateBatchDefinitionFile(parsed.value);

  if (!validated.ok) {
    return null;
  }

  const value = validated.value;

  return {
    enabledScheduleIds:
      value.spec.schedules
        ?.filter((schedule) => schedule.enabled)
        .map((schedule) => schedule.id) ?? [],
    enabledScheduleCronById: new Map(
      (value.spec.schedules ?? [])
        .filter((schedule) => schedule.enabled)
        .map((schedule) => [schedule.id, schedule.cron]),
    ),
    gateRequired: value.spec.gateRequired,
    status: value.spec.status,
    workflowPath: value.spec.workflow.path,
    workflowRef: value.spec.workflow.ref,
  };
}

function parseApproverSelectorFromRoleMappingFile(
  content: string,
): ApproverSelectorSnapshot | null {
  const parsed = parseYamlDocument(content);

  if (!parsed.ok) {
    return null;
  }

  const validated = validateRoleMappingFile(parsed.value);

  if (!validated.ok) {
    return null;
  }

  const approver = (validated.value as RoleMappingFile).spec.roles.approver;

  return {
    githubTeams: approver.githubTeams ?? [],
    githubUsers: approver.githubUsers ?? [],
    repositoryRoles: approver.repositoryRoles ?? [],
  };
}

function parseCanonicalPayload(issueBody: string): unknown {
  const match = issueBody.match(/```json\s*([\s\S]*?)```/);

  if (!match?.[1]) {
    return null;
  }

  try {
    return JSON.parse(match[1]) as unknown;
  } catch {
    return null;
  }
}

function readWorkflowTarget(payload: unknown): { path: string; ref: string } {
  if (!payload || typeof payload !== "object") {
    return { path: "", ref: "" };
  }

  const spec = (payload as { spec?: unknown }).spec;

  if (!spec || typeof spec !== "object") {
    return { path: "", ref: "" };
  }

  const workflow = (spec as { workflow?: unknown }).workflow;

  if (!workflow || typeof workflow !== "object") {
    return { path: "", ref: "" };
  }

  const path = (workflow as { path?: unknown }).path;
  const ref = (workflow as { ref?: unknown }).ref;

  return {
    path: typeof path === "string" ? path : "",
    ref: typeof ref === "string" ? ref : "",
  };
}

function readRequestedBy(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const spec = (payload as { spec?: unknown }).spec;

  if (!spec || typeof spec !== "object") {
    return "";
  }

  const requestedBy = (spec as { requestedBy?: unknown }).requestedBy;

  return typeof requestedBy === "string" ? requestedBy : "";
}

function readScheduleId(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const spec = (payload as { spec?: unknown }).spec;

  if (!spec || typeof spec !== "object") {
    return "";
  }

  const schedule = (spec as { schedule?: unknown }).schedule;

  if (!schedule || typeof schedule !== "object") {
    return "";
  }

  const scheduleId = (schedule as { scheduleId?: unknown }).scheduleId;

  return typeof scheduleId === "string" ? scheduleId : "";
}

function readNativeScheduleOccurrence(
  payload: unknown,
): ExecutionRequestEvidence["schedule"] | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const spec = (payload as { spec?: unknown }).spec;
  if (!spec || typeof spec !== "object") return undefined;
  const schedule = (spec as { schedule?: unknown }).schedule;
  if (!schedule || typeof schedule !== "object") return undefined;

  const value = schedule as Record<string, unknown>;
  return typeof value.repositoryId === "string" &&
    typeof value.sourceRunId === "string" &&
    Number.isInteger(value.sourceRunAttempt)
    ? {
        repositoryId: value.repositoryId,
        sourceRunAttempt: value.sourceRunAttempt as number,
        sourceRunId: value.sourceRunId,
      }
    : undefined;
}

function readTriggerType(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const spec = (payload as { spec?: unknown }).spec;

  if (!spec || typeof spec !== "object") {
    return "";
  }

  const triggerType = (spec as { triggerType?: unknown }).triggerType;

  return typeof triggerType === "string" ? triggerType : "";
}

function parseApprovalCommand(body: string): ApprovalCommand | null {
  const firstLine = body.split("\n", 1)[0]?.trim();
  const match = firstLine?.match(/^\/bgcp approve\s+requestDigest=(\S+)$/u);

  if (!match?.[1]) {
    return null;
  }

  return { digest: match[1] };
}

function isEditedComment(comment: GateIssueComment): boolean {
  if (!comment.createdAt || !comment.updatedAt) {
    return false;
  }

  return comment.createdAt !== comment.updatedAt;
}

function encodePath(path: string): string {
  return path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function decodeBase64(value: string): string {
  return Buffer.from(value.replace(/\s/g, ""), "base64").toString("utf-8");
}

function normalizePermissionValue(value: string | null | undefined): string {
  const normalized = value?.trim().toLowerCase();

  if (!normalized) {
    return "";
  }

  return normalized;
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

function parseBatchPlaneMarker(
  body: string,
  kind: string,
): Map<string, string> {
  const marker = new Map<string, string>();
  const match = body.match(
    new RegExp(`<!--\\s*batch(?:plane|trail):${kind}\\s*([\\s\\S]*?)-->`),
  );

  if (!match?.[1]) {
    return marker;
  }

  for (const line of match[1].split("\n")) {
    const separatorIndex = line.indexOf("=");

    if (separatorIndex < 0) {
      continue;
    }

    marker.set(
      line.slice(0, separatorIndex).trim(),
      line.slice(separatorIndex + 1).trim(),
    );
  }

  return marker;
}

function readMarkdownField(body: string, label: string): string {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = body.match(new RegExp(`- ${escapedLabel}:\\s*(.+)`));
  const value = match?.[1]?.trim() ?? "";

  return value.replace(/^`|`$/g, "").trim();
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await runGateFromEnv();
}
