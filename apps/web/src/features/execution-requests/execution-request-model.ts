import {
  createParameterDigest,
  createRequestDigest,
  type CanonicalValue,
} from "@batchtrail/digest";
import type {
  BatchDefinition,
  ExecutionRequest,
  RunnerLabel,
} from "@batchtrail/domain";

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
    execution: {
      artifactPath?: string;
      command: string;
      gateRequired: boolean;
      runsOn: RunnerLabel;
    };
    parameters?: Record<
      string,
      | {
          sensitive?: false;
          value: string;
        }
      | {
          sensitive: true;
          valueDigest: string;
        }
    >;
    workflow: {
      path: string;
      ref: string;
    };
  };
};

export type BuildExecutionRequestIssueParams = {
  batch: BatchDefinition;
  expiresAt: Date;
  parameters?: ExecutionRequestParameterInput[];
  reason?: string;
  requestId?: string;
  requestedAt: Date;
  requestedBy: string;
  workflowRef?: string;
};

export type ExecutionRequestIssue = {
  body: string;
  labels: string[];
  payload: ExecutionRequestPayload;
  request: ExecutionRequest;
  title: string;
};

export type ExecutionRequestParameterInput = {
  name: string;
  sensitive: boolean;
  value: string;
};

export async function buildExecutionRequestIssue({
  batch,
  expiresAt,
  parameters = [],
  reason = "Manual request from BatchPlane Lite.",
  requestId,
  requestedAt,
  requestedBy,
  workflowRef,
}: BuildExecutionRequestIssueParams): Promise<ExecutionRequestIssue> {
  const effectiveRequestId =
    requestId ?? createExecutionRequestId(batch.batchId, requestedAt);
  const requestedAtIso = requestedAt.toISOString();
  const expiresAtIso = expiresAt.toISOString();
  const parameterPayload = await buildParameterPayload(parameters);
  const effectiveWorkflowRef = workflowRef?.trim() || batch.workflow.ref;
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
      execution: {
        ...(batch.execution?.artifactPath
          ? { artifactPath: batch.execution.artifactPath }
          : {}),
        command: batch.execution?.command ?? "",
        gateRequired: batch.gateRequired,
        runsOn: batch.execution?.runsOn ?? "",
      },
      expiresAt: expiresAtIso,
      reason,
      requestedAt: requestedAtIso,
      requestedBy,
      ...(Object.keys(parameterPayload).length > 0
        ? { parameters: parameterPayload }
        : {}),
      workflow: {
        path: batch.workflow.path,
        ref: effectiveWorkflowRef,
      },
    },
  };
  const requestDigest = await createRequestDigest(
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
    labels: ["batchtrail:execution-request"],
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
    "## BatchPlane Execution Request",
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

async function buildParameterPayload(
  parameters: ExecutionRequestParameterInput[],
): Promise<NonNullable<ExecutionRequestPayload["spec"]["parameters"]>> {
  const entries = await Promise.all(
    parameters
      .map((parameter) => ({
        name: parameter.name.trim(),
        sensitive: parameter.sensitive,
        value: parameter.value,
      }))
      .filter((parameter) => parameter.name.length > 0)
      .map(async (parameter) => {
        if (parameter.sensitive) {
          return [
            parameter.name,
            {
              sensitive: true,
              valueDigest: await createParameterDigest({
                [parameter.name]: parameter.value,
              }),
            },
          ] as const;
        }

        return [
          parameter.name,
          {
            value: parameter.value,
          },
        ] as const;
      }),
  );

  return Object.fromEntries(entries);
}
