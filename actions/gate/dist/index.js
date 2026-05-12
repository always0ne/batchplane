export function verifyLiteInput(input) {
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
export function readGateInputFromEnv(env = process.env) {
    return {
        mode: readActionInput(env, "mode"),
        batchId: readActionInput(env, "batch-id"),
        configPath: readActionInput(env, "config-path") || ".batch-governance",
        requestId: readOptionalActionInput(env, "request-id"),
        approvalSource: readOptionalActionInput(env, "approval-source"),
        approvalRef: readOptionalActionInput(env, "approval-ref"),
        requestDigest: readOptionalActionInput(env, "request-digest"),
    };
}
export function runGateFromEnv(env = process.env) {
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
function readActionInput(env, name) {
    const envKey = `INPUT_${name.toUpperCase()}`;
    const fallbackKey = envKey.replaceAll("-", "_");
    return (env[envKey] ?? env[fallbackKey] ?? "").trim();
}
function readOptionalActionInput(env, name) {
    const value = readActionInput(env, name);
    return value || undefined;
}
if (process.env.GITHUB_ACTIONS === "true" &&
    process.env.BATCHTRAIL_GATE_DISABLE_AUTO_RUN !== "true") {
    runGateFromEnv();
}
