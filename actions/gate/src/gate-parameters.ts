import {
  hasParameterDelivery,
  createExecutionRequestDigest,
  parseBatchDefinitionYaml,
  validateApprovedParameters,
  type ExecutionRequestPayload,
} from "@batchplane/github-lite";
import { parseCanonicalPayload } from "./gate-evidence.js";
import type { GateGitHubClient } from "./gate-github-client.js";
import type { GateInput, GateResult } from "./gate-types.js";

export async function verifyParameterBinding({
  input,
  issueBody,
  client,
  revision,
}: {
  input: GateInput;
  issueBody: string;
  client: GateGitHubClient;
  revision: GateResult;
}): Promise<GateResult> {
  try {
    const sourceRevision = revision.verifiedSha!;
    const path = `${input.configPath.replace(/\/+$/u, "")}/batches/${input.batchId}.yml`;
    const file = await client.getFile(path, sourceRevision);
    if (!file) throw new Error("PARAMETER_DEFINITION_UNAVAILABLE");
    const batch = parseBatchDefinitionYaml(file.content);
    const payload = parseCanonicalPayload(
      issueBody,
    ) as ExecutionRequestPayload | null;
    if (!payload?.spec || !payload.metadata)
      throw new Error("PARAMETER_REQUEST_INVALID");

    const hasParameters = Boolean(
      batch.parameters?.length ||
      payload.spec.parameters ||
      payload.spec.parameterContractVersion,
    );
    if (!hasParameters) return revision;
    if (
      payload.metadata.batchId !== input.batchId ||
      payload.metadata.requestId !== input.requestId ||
      (await createExecutionRequestDigest(payload)) !== input.requestDigest
    )
      throw new Error("REQUEST_DIGEST_MISMATCH");

    const approvedParameters = validateApprovedParameters(
      payload,
      batch,
      sourceRevision,
    );
    const workflow = await client.getFile(
      batch.workflow.path,
      input.workflowSha,
    );
    if (!workflow || !hasParameterDelivery(workflow.content, batch)) {
      throw new Error("PARAMETER_WORKFLOW_UPDATE_REQUIRED");
    }
    return { ...revision, approvedParameters };
  } catch (error) {
    const code = parameterFailureCode(error);
    return {
      result: "DENY",
      reasonCode: code,
      message: `Approved inputs could not be verified (${code}). The batch command did not start.`,
    };
  }
}

export function parameterFailureCode(error: unknown): string {
  if (
    error instanceof Error &&
    /^(?:PARAMETER_[A-Z_]+|REQUEST_DIGEST_MISMATCH)$/u.test(error.message)
  ) {
    return error.message;
  }
  return "PARAMETER_PREPARATION_FAILED";
}
