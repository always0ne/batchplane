import { createCanonicalDigest, type CanonicalValue } from "@batchtrail/digest";
import type { BatchDefinition, ExecutionRequest } from "@batchtrail/domain";

export type ExecutionRequestPayload = {
  apiVersion: "batchtrail.io/v1";
  kind: "ExecutionRequest";
  metadata: {
    requestId: string;
    batchId: string;
  };
  spec: {
    requestedBy: string;
    requestedAt: string;
    expiresAt: string;
    reason: string;
    batch: {
      name: string;
      owner: string;
      domain: string;
      environment: string;
      criticality: string;
    };
    workflow: {
      path: string;
      ref: string;
    };
  };
};

export type BuildExecutionRequestIssueParams = {
  batch: BatchDefinition;
  expiresAt: Date;
  reason?: string;
  requestId?: string;
  requestedAt: Date;
  requestedBy: string;
};

export type ExecutionRequestIssue = {
  body: string;
  labels: string[];
  payload: ExecutionRequestPayload;
  request: ExecutionRequest;
  title: string;
};

export async function buildExecutionRequestIssue({
  batch,
  expiresAt,
  reason = "Manual request from BatchTrail Repo Mode.",
  requestId,
  requestedAt,
  requestedBy,
}: BuildExecutionRequestIssueParams): Promise<ExecutionRequestIssue> {
  const effectiveRequestId =
    requestId ?? createExecutionRequestId(batch.batchId, requestedAt);
  const requestedAtIso = requestedAt.toISOString();
  const expiresAtIso = expiresAt.toISOString();
  const payload: ExecutionRequestPayload = {
    apiVersion: "batchtrail.io/v1",
    kind: "ExecutionRequest",
    metadata: {
      batchId: batch.batchId,
      requestId: effectiveRequestId,
    },
    spec: {
      batch: {
        criticality: batch.criticality,
        domain: batch.domain,
        environment: batch.environment,
        name: batch.name,
        owner: batch.owner,
      },
      expiresAt: expiresAtIso,
      reason,
      requestedAt: requestedAtIso,
      requestedBy,
      workflow: {
        path: batch.workflow.path,
        ref: batch.workflow.ref,
      },
    },
  };
  const requestDigest = await createCanonicalDigest(
    payload as unknown as CanonicalValue,
  );
  const request: ExecutionRequest = {
    batchId: batch.batchId,
    expiresAt: expiresAtIso,
    requestDigest,
    requestedAt: requestedAtIso,
    requestedBy,
    requestId: effectiveRequestId,
    status: "REQUESTED",
  };

  return {
    body: buildExecutionRequestBody({ payload, request }),
    labels: [],
    payload,
    request,
    title: `Run batch ${batch.batchId}`,
  };
}

export function createExecutionRequestId(
  batchId: string,
  date = new Date(),
  entropy = createEntropy(),
): string {
  const timestamp = date
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replaceAll(".", "")
    .replaceAll("T", "")
    .replaceAll("Z", "")
    .slice(0, 14);
  const slug = batchId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return `btr-${timestamp}-${slug || "batch"}-${entropy}`;
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function buildExecutionRequestBody({
  payload,
  request,
}: {
  payload: ExecutionRequestPayload;
  request: ExecutionRequest;
}): string {
  return [
    "## BatchTrail Execution Request",
    "",
    `- Request ID: \`${request.requestId}\``,
    `- Batch ID: \`${request.batchId}\``,
    `- Requested by: @${request.requestedBy}`,
    `- Requested at: ${request.requestedAt}`,
    `- Expires at: ${request.expiresAt}`,
    `- Request digest: \`${request.requestDigest}\``,
    `- Status: ${request.status}`,
    "",
    "### Canonical payload",
    "",
    "```json",
    JSON.stringify(payload, null, 2),
    "```",
    "",
    "<!-- batchtrail:execution-request",
    `requestId=${request.requestId}`,
    `batchId=${request.batchId}`,
    `requestDigest=${request.requestDigest}`,
    `status=${request.status}`,
    "-->",
  ].join("\n");
}

function createEntropy(): string {
  const bytes = new Uint8Array(4);

  globalThis.crypto.getRandomValues(bytes);

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}
