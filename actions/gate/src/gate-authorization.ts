import {
  createGitHubLiteClient,
  verifyApprovedBatchRevision,
} from "@batchplane/github-lite";
import { validateBatchPolicyEvidence } from "./gate-batch-policy.js";
import { findGitHubApprovalEvidence } from "./gate-evidence.js";
import {
  createGateGitHubClient,
  parseRepository,
  type GateGitHubClient,
} from "./gate-github-client.js";
import { verifyLiteInput } from "./gate-input.js";
import { verifyManualAuthorization } from "./gate-manual-authorization.js";
import {
  loadNativeScheduleBatch,
  verifyNativeScheduleAuthorization,
} from "./gate-native-authorization.js";
import type {
  ExecutionRequestEvidence,
  GateEvidence,
  GateInput,
  GateRepositoryRef,
  GateResult,
} from "./gate-types.js";

type BatchRevisionVerifier = typeof verifyApprovedBatchRevision;

type RequestContext = {
  client: GateGitHubClient;
  repository: GateRepositoryRef;
  token: string;
};

export async function verifyLiteAuthorization(
  input: GateInput,
  verifyBatchRevision: BatchRevisionVerifier = verifyApprovedBatchRevision,
): Promise<GateResult> {
  const inputResult = verifyLiteInput(input);
  if (inputResult.result === "DENY") {
    return inputResult;
  }

  const requestContext = createRequestContext(input);
  if ("result" in requestContext) {
    return requestContext;
  }

  const evidence = await loadApprovalEvidence(input, requestContext.client);
  if ("result" in evidence) {
    return evidence;
  }

  const request = verifyRequestEvidence(input, evidence);
  if ("result" in request) {
    return request;
  }

  const batchValidation = await validateBatchPolicyEvidence({
    batchId: input.batchId,
    client: requestContext.client,
    configPath: input.configPath,
    inputRef: input.eventName === "schedule" ? input.workflowRef : input.ref,
    eventSchedule:
      input.eventName === "schedule" ? input.eventSchedule : undefined,
    actualWorkflowPath:
      input.eventName === "schedule" ? input.workflowPath : undefined,
    actualWorkflowRef:
      input.eventName === "schedule" ? input.workflowRef : undefined,
    repository: requestContext.repository,
    request,
  });
  if (batchValidation.result === "DENY") {
    return batchValidation;
  }

  const authorization =
    input.eventName === "schedule"
      ? await verifyNativeScheduleAuthorization({
          batch: await loadNativeScheduleBatch({
            client: requestContext.client,
            input,
          }),
          evidence,
          input,
        })
      : await verifyManualAuthorization({
          client: requestContext.client,
          evidence,
          input,
          repository: requestContext.repository,
        });
  if (authorization.result === "DENY") {
    return authorization;
  }

  return verifyApprovedRevision({
    authorization,
    input,
    repository: requestContext.repository,
    request,
    token: requestContext.token,
    verifyBatchRevision,
  });
}

function createRequestContext(input: GateInput): RequestContext | GateResult {
  const expectedActor = input.expectedDispatcherActor ?? "github-actions[bot]";

  if (
    input.eventName !== "schedule" &&
    input.actor &&
    input.actor !== expectedActor
  ) {
    return deny(
      "DIRECT_DISPATCH_NOT_AUTHORIZED",
      `Workflow actor ${input.actor} is not the BatchPlane dispatcher actor ${expectedActor}.`,
    );
  }

  if (!input.githubToken || !input.repository) {
    return deny(
      "GITHUB_EVIDENCE_LOOKUP_REQUIRED",
      "GitHub token and repository are required to verify evidence.",
    );
  }

  const repository = parseRepository(input.repository);
  return {
    client: createGateGitHubClient({
      apiBaseUrl: input.apiBaseUrl ?? "https://api.github.com",
      fetcher: input.fetcher ?? fetch,
      owner: repository.owner,
      repo: repository.repo,
      token: input.githubToken,
    }),
    repository,
    token: input.githubToken,
  };
}

async function loadApprovalEvidence(
  input: GateInput,
  client: GateGitHubClient,
): Promise<GateEvidence | GateResult> {
  try {
    return await findGitHubApprovalEvidence({
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
}

function verifyRequestEvidence(
  input: GateInput,
  evidence: GateEvidence,
): ExecutionRequestEvidence | GateResult {
  const request = evidence.request;
  if (!request) {
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
    request.requestId !== input.requestId ||
    request.batchId !== input.batchId ||
    request.requestDigest !== input.requestDigest
  ) {
    return deny(
      "REQUEST_EVIDENCE_MISMATCH",
      "Execution request evidence does not match workflow inputs.",
    );
  }

  if (request.status !== "REQUESTED") {
    return deny(
      "REQUEST_NOT_REQUESTED",
      `Execution request status is ${request.status}.`,
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
    input.approvalRef !== request.requestId
  ) {
    return deny(
      "APPROVAL_REFERENCE_MISMATCH",
      "Approval reference does not match the execution request.",
    );
  }

  return request;
}

async function verifyApprovedRevision({
  authorization,
  input,
  repository,
  request,
  token,
  verifyBatchRevision,
}: {
  authorization: GateResult;
  input: GateInput;
  repository: GateRepositoryRef;
  request: ExecutionRequestEvidence;
  token: string;
  verifyBatchRevision: BatchRevisionVerifier;
}): Promise<GateResult> {
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
      token,
    }),
    executionWorkflowSha: input.workflowSha,
    expectedRevision: request.approvedBatchRevision,
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

function parseNativeIssueNumber(value: string | undefined): number {
  const issueNumber = Number(value);
  if (!Number.isInteger(issueNumber) || issueNumber < 1) {
    throw new Error("NATIVE_SCHEDULE_ISSUE_MISMATCH");
  }
  return issueNumber;
}

function isCommitSha(value: string): boolean {
  return /^[0-9a-f]{40}$/iu.test(value);
}

function deny(reasonCode: string, message: string): GateResult {
  return { message, reasonCode, result: "DENY" };
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
