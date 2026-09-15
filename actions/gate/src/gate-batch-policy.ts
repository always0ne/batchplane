import type { GateGitHubClient } from "./gate-github-client.js";
import { parseBatchDefinitionSnapshot } from "./gate-evidence.js";
import type {
  ExecutionRequestEvidence,
  GateRepositoryRef,
  GateResult,
} from "./gate-types.js";

export async function validateBatchPolicyEvidence({
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

function deny(reasonCode: string, message: string): GateResult {
  return { message, reasonCode, result: "DENY" };
}
