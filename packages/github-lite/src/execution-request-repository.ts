import type { GitHubRepositoryContext } from "./github-types.js";
import { verifyApprovedBatchRevision } from "./approved-batch-revision.js";

import { toRepositoryIssue } from "./inspection-context.js";
import {
  getBatchDefinitionPath,
  parseBatchDefinitionYaml,
} from "./batch-definition-codec.js";
import { validateApprovedParameters } from "./parameter-materialization.js";
import { hasParameterDelivery } from "./parameter-workflow.js";
import {
  createExecutionRequestDigest,
  type ExecutionRequestPayload,
} from "./execution-request-evidence.js";

export async function createApprovedExecutionRequest(
  { client, repositoryRef }: GitHubRepositoryContext,
  { body, labels, title }: { body: string; labels: string[]; title: string },
) {
  const requestRevision = readExecutionRequestRevisionBinding(body);
  const requestBatchId = readExecutionRequestBatchId(body);
  if (!requestRevision || !requestBatchId) {
    throw new Error(
      "Execution request is missing approved Batch revision evidence.",
    );
  }
  const verification = await verifyApprovedBatchRevision({
    batchId: requestBatchId,
    client,
    expectedRevision: requestRevision,
    repository: repositoryRef,
  });
  if (verification.controlStatus !== "VERIFIED")
    throw new Error(verification.reasonCode);
  const payload = readCanonicalExecutionPayload(body);
  const file = await client.getFile({
    ...repositoryRef,
    path: getBatchDefinitionPath(requestBatchId),
    ref: verification.verifiedSha,
  });
  if (!file) throw new Error("PARAMETER_SAVED_SOURCE_UNAVAILABLE");
  const batch = parseBatchDefinitionYaml(file.content);
  if (batch.parameters?.length || payload?.spec.parameters !== undefined) {
    if (
      !payload ||
      payload.metadata.batchId !== requestBatchId ||
      payload.metadata.requestId !== readMarker(body, "requestId") ||
      (await createExecutionRequestDigest(payload)) !==
        readMarker(body, "requestDigest")
    )
      throw new Error("PARAMETER_REQUEST_DIGEST_MISMATCH");
    validateApprovedParameters(payload, batch, verification.verifiedSha);
    const workflow = await client.getFile({
      ...repositoryRef,
      path: batch.workflow.path,
      ref: verification.verifiedSha,
    });
    if (!workflow || !hasParameterDelivery(workflow.content, batch))
      throw new Error("PARAMETER_WORKFLOW_UPDATE_REQUIRED");
  }
  return toRepositoryIssue(
    await client.createIssue({ ...repositoryRef, body, labels, title }),
  );
}

export function readCanonicalExecutionPayload(
  body: string,
): ExecutionRequestPayload | null {
  const match = /### Canonical payload\s*```json\s*([\s\S]*?)\s*```/u.exec(
    body,
  );
  if (!match?.[1]) return null;
  try {
    const value: unknown = JSON.parse(match[1]);
    if (!value || typeof value !== "object") return null;
    const payload = value as ExecutionRequestPayload;
    return payload.kind === "ExecutionRequest" &&
      payload.metadata &&
      payload.spec
      ? payload
      : null;
  } catch {
    return null;
  }
}

function readMarker(body: string, key: string): string | null {
  const marker = /<!--\s*batchplane:execution-request\s*([\s\S]*?)-->/u.exec(
    body,
  )?.[1];
  if (!marker) return null;
  return (
    marker
      .split("\n")
      .find((line) => line.startsWith(`${key}=`))
      ?.slice(key.length + 1)
      .trim() ?? null
  );
}

export async function getApprovedExecutionRevision(
  { client, repositoryRef }: GitHubRepositoryContext,
  { batchId }: { batchId: string },
) {
  const verification = await verifyApprovedBatchRevision({
    batchId,
    client,
    repository: repositoryRef,
  });
  if (verification.controlStatus !== "VERIFIED")
    throw new Error(verification.reasonCode);
  return {
    ...verification.approvedRevision,
    verifiedSha: verification.verifiedSha,
  };
}

function readExecutionRequestRevisionBinding(body: string): {
  governedChangeId: string;
  targetRevisionDigest: string;
} | null {
  const match = /### Canonical payload\s*```json\s*([\s\S]*?)\s*```/u.exec(
    body,
  );

  if (!match?.[1]) return null;
  try {
    const payload = JSON.parse(match[1]) as {
      spec?: {
        approvedBatchRevision?: {
          governedChangeId?: string;
          targetRevisionDigest?: string;
        };
      };
    };
    const revision = payload.spec?.approvedBatchRevision;

    return revision?.governedChangeId &&
      revision.targetRevisionDigest?.startsWith("sha256:")
      ? {
          governedChangeId: revision.governedChangeId,
          targetRevisionDigest: revision.targetRevisionDigest,
        }
      : null;
  } catch {
    return null;
  }
}

function readExecutionRequestBatchId(body: string): string | null {
  const marker =
    /<!--\s*batchplane:execution-request[\s\S]*?^batchId=(.+)$/mu.exec(body);

  return marker?.[1]?.trim() || null;
}
