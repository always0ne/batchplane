import {
  parseBatchDefinitionYaml,
  type GitHubBatchDefinition,
  verifyNativeScheduleRequestIssue,
} from "@batchplane/github-lite";
import type { GateGitHubClient } from "./gate-github-client.js";
import type {
  ExecutionRequestEvidence,
  GateEvidence,
  GateInput,
  GateResult,
} from "./gate-types.js";

export async function verifyNativeScheduleAuthorization({
  batch,
  evidence,
  input,
}: {
  batch: GitHubBatchDefinition | null;
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

export async function loadNativeScheduleBatch({
  client,
  input,
}: {
  client: GateGitHubClient;
  input: GateInput;
}): Promise<GitHubBatchDefinition | null> {
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

function deny(reasonCode: string, message: string): GateResult {
  return { message, reasonCode, result: "DENY" };
}
