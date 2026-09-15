import type { GateInput, GateResult } from "./gate-types.js";

export function verifyLiteInput(input: GateInput): GateResult {
  if (input.mode !== "lite") {
    return deny("UNSUPPORTED_MODE", "Only lite mode is scaffolded.");
  }

  if (!input.batchId) {
    return deny("BATCH_ID_REQUIRED", "Batch ID is required.");
  }

  if ((input.runAttempt ?? 1) > 1) {
    return deny(
      "RERUN_NOT_AUTHORIZED",
      "GitHub Actions reruns are not authorized by BatchPlane. Create a new execution request or approved retry instead.",
    );
  }

  if (!input.requestId) {
    return deny(
      input.controllerReason || "EXECUTION_REQUEST_REQUIRED",
      input.controllerReason
        ? `Native schedule controller denied this occurrence: ${input.controllerReason}.`
        : "Execution request evidence is required.",
    );
  }

  if (!input.requestDigest?.startsWith("sha256:")) {
    return deny(
      "REQUEST_DIGEST_REQUIRED",
      "Approved request digest is required.",
    );
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
    message: "Manual execution request evidence is present.",
    result: "ALLOW",
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
    message: "Native schedule occurrence context is present.",
    result: "ALLOW",
  };
}

function isPositiveIntegerString(value: string | undefined): boolean {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0;
}

function deny(reasonCode: string, message: string): GateResult {
  return { message, reasonCode, result: "DENY" };
}
