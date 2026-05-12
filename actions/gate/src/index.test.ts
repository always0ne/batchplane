import { afterEach, describe, expect, it, vi } from "vitest";

import { readGateInputFromEnv, runGateFromEnv, verifyLiteInput } from ".";

describe("Gate action runtime", () => {
  afterEach(() => {
    process.exitCode = undefined;
    vi.restoreAllMocks();
  });

  it("allows lite executions with request and approval evidence", () => {
    expect(
      verifyLiteInput({
        approvalRef: "btr-20260513010203-payment.daily-close-abcdef12",
        approvalSource: "issue",
        batchId: "payment.daily-close",
        configPath: ".batch-governance",
        mode: "lite",
        requestDigest:
          "sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        requestId: "btr-20260513010203-payment.daily-close-abcdef12",
      }),
    ).toEqual({
      result: "ALLOW",
      message: "Execution request evidence is present.",
    });
  });

  it("denies lite executions without a request digest", () => {
    expect(
      verifyLiteInput({
        approvalRef: "btr-20260513010203-payment.daily-close-abcdef12",
        approvalSource: "issue",
        batchId: "payment.daily-close",
        configPath: ".batch-governance",
        mode: "lite",
        requestId: "btr-20260513010203-payment.daily-close-abcdef12",
      }),
    ).toEqual({
      result: "DENY",
      reasonCode: "REQUEST_DIGEST_REQUIRED",
      message: "Approved request digest is required.",
    });
  });

  it("reads GitHub action inputs from environment variables", () => {
    expect(
      readGateInputFromEnv({
        "INPUT_APPROVAL-REF": "btr-20260513010203-payment.daily-close-abcdef12",
        "INPUT_APPROVAL-SOURCE": "issue",
        "INPUT_BATCH-ID": "payment.daily-close",
        INPUT_MODE: "lite",
        "INPUT_REQUEST-DIGEST":
          "sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        "INPUT_REQUEST-ID": "btr-20260513010203-payment.daily-close-abcdef12",
      }),
    ).toEqual({
      approvalRef: "btr-20260513010203-payment.daily-close-abcdef12",
      approvalSource: "issue",
      batchId: "payment.daily-close",
      configPath: ".batch-governance",
      mode: "lite",
      requestDigest:
        "sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      requestId: "btr-20260513010203-payment.daily-close-abcdef12",
    });
  });

  it("sets a failing exit code when Gate denies execution", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(
      runGateFromEnv({
        "INPUT_BATCH-ID": "payment.daily-close",
        INPUT_MODE: "lite",
      }),
    ).toMatchObject({
      result: "DENY",
      reasonCode: "EXECUTION_REQUEST_REQUIRED",
    });
    expect(process.exitCode).toBe(1);
  });
});
