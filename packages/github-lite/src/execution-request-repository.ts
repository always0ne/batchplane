import type { GitHubRepositoryContext } from "./github-types.js";
import { verifyApprovedBatchRevision } from "./approved-batch-revision.js";

import { toRepositoryIssue } from "./inspection-context.js";

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
  return toRepositoryIssue(
    await client.createIssue({ ...repositoryRef, body, labels, title }),
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
