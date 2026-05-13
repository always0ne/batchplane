export type GateMode = "lite" | "server";

export type GateInput = {
  mode: GateMode | string;
  batchId: string;
  configPath: string;
  requestId?: string;
  approvalSource?: string;
  approvalRef?: string;
  requestDigest?: string;
  runAttempt?: number;
};

export type GateResult = {
  result: "ALLOW" | "DENY";
  reasonCode?: string;
  message: string;
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
        "GitHub Actions reruns are not authorized by BatchTrail. Create a new execution request or approved retry instead.",
    };
  }

  if (!input.requestId) {
    return {
      result: "DENY",
      reasonCode: "EXECUTION_REQUEST_REQUIRED",
      message: "Execution request evidence is required.",
    };
  }

  if (!input.approvalSource || !input.approvalRef) {
    return {
      result: "DENY",
      reasonCode: "APPROVAL_EVIDENCE_REQUIRED",
      message: "Approval evidence source and reference are required.",
    };
  }

  if (!input.requestDigest?.startsWith("sha256:")) {
    return {
      result: "DENY",
      reasonCode: "REQUEST_DIGEST_REQUIRED",
      message: "Approved request digest is required.",
    };
  }

  return { result: "ALLOW", message: "Execution request evidence is present." };
}

export function readGateInputFromEnv(
  env: Record<string, string | undefined> = process.env,
): GateInput {
  return {
    mode: readActionInput(env, "mode"),
    batchId: readActionInput(env, "batch-id"),
    configPath: readActionInput(env, "config-path") || ".batch-governance",
    requestId: readOptionalActionInput(env, "request-id"),
    approvalSource: readOptionalActionInput(env, "approval-source"),
    approvalRef: readOptionalActionInput(env, "approval-ref"),
    requestDigest: readOptionalActionInput(env, "request-digest"),
    runAttempt: readRunAttempt(env),
  };
}

export function runGateFromEnv(
  env: Record<string, string | undefined> = process.env,
): GateResult {
  const result = verifyLiteInput(readGateInputFromEnv(env));

  if (result.result === "DENY") {
    console.error(`BatchTrail Gate denied execution: ${result.reasonCode}`);
    console.error(result.message);
    process.exitCode = 1;
    return result;
  }

  console.log(`BatchTrail Gate allowed execution: ${result.message}`);
  return result;
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

function readRunAttempt(env: Record<string, string | undefined>): number {
  const value = Number.parseInt(env.GITHUB_RUN_ATTEMPT ?? "1", 10);

  return Number.isFinite(value) && value > 0 ? value : 1;
}

if (
  process.env.GITHUB_ACTIONS === "true" &&
  process.env.BATCHTRAIL_GATE_DISABLE_AUTO_RUN !== "true"
) {
  runGateFromEnv();
}
