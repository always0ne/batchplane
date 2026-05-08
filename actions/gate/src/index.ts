export type GateMode = "lite" | "server";

export type GateInput = {
  mode: GateMode;
  batchId: string;
  configPath: string;
  requestId?: string;
  approvalSource?: string;
  approvalRef?: string;
  requestDigest?: string;
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

  if (!input.requestId) {
    return {
      result: "DENY",
      reasonCode: "EXECUTION_REQUEST_REQUIRED",
      message: "Execution request evidence is required.",
    };
  }

  return { result: "ALLOW", message: "Execution request evidence is present." };
}
