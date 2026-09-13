import { describe, expect, it } from "vitest";

import { parseExecutionGateResult } from "./execution-gate-result.js";

const expected = {
  gateJobName: "BatchPlane Gate",
  gateStep: {
    completedAt: "2026-05-14T01:01:00.000Z",
    name: "Verify approved execution evidence",
    nextStepStartedAt: "2026-05-14T01:01:01.000Z",
    startedAt: "2026-05-14T01:00:00.000Z",
  },
  repository: "always0ne/batch",
  runAttempt: 2,
  runId: 203,
};

const occurrence = {
  batchId: "payment.daily-close",
  requestDigest: `sha256:${"a".repeat(64)}`,
  requestId: `btr-schedule-${"b".repeat(64)}`,
  scheduleId: "weekday-close",
};

function record(overrides: Record<string, unknown> = {}) {
  return `BATCHPLANE_GATE_RESULT ${JSON.stringify({
    gateJob: "batchplane-gate",
    gateJobName: "BatchPlane Gate",
    gateStep: "Verify approved execution evidence",
    message: "Execution request evidence is present.",
    repository: "always0ne/batch",
    result: "ALLOW",
    runAttempt: 2,
    runId: "203",
    version: 1,
    ...overrides,
  })}`;
}

function loggedRecord(
  overrides: Record<string, unknown> = {},
  timestamp = "2026-05-14T01:00:00.000Z",
) {
  return `${timestamp} ${record(overrides)}`;
}

describe("parseExecutionGateResult", () => {
  it("parses a matching ALLOW result from the Gate job log", () => {
    expect(
      parseExecutionGateResult({
        content: loggedRecord(),
        expected,
      }),
    ).toEqual({
      allowed: true,
      message: "Execution request evidence is present.",
    });
  });

  it("parses a matching DENY result and its reason code", () => {
    expect(
      parseExecutionGateResult({
        content: loggedRecord({
          message: "Execution request evidence is required.",
          reasonCode: "EXECUTION_REQUEST_REQUIRED",
          result: "DENY",
        }),
        expected,
      }),
    ).toEqual({
      allowed: false,
      message: "Execution request evidence is required.",
      reasonCode: "EXECUTION_REQUEST_REQUIRED",
    });
  });

  it("requires the full native occurrence identity when one is expected", () => {
    const nativeExpected = { ...expected, occurrence };

    expect(
      parseExecutionGateResult({
        content: loggedRecord(occurrence),
        expected: nativeExpected,
      }),
    ).toMatchObject({
      allowed: true,
      batchId: occurrence.batchId,
      requestDigest: occurrence.requestDigest,
      requestId: occurrence.requestId,
      scheduleId: occurrence.scheduleId,
    });

    for (const key of Object.keys(occurrence) as Array<
      keyof typeof occurrence
    >) {
      expect(
        parseExecutionGateResult({
          content: loggedRecord({
            ...occurrence,
            [key]: `${occurrence[key]}-other`,
          }),
          expected: nativeExpected,
        }),
      ).toBeUndefined();
    }
  });

  it("accepts only a requestless native controller DENY for a matching batch and schedule", () => {
    const nativeExpected = { ...expected, occurrence };
    const requestlessDenial = {
      batchId: occurrence.batchId,
      message: "Native schedule controller denied this occurrence.",
      result: "DENY",
      scheduleId: occurrence.scheduleId,
    };

    expect(
      parseExecutionGateResult({
        content: loggedRecord(requestlessDenial),
        expected: nativeExpected,
      }),
    ).toMatchObject({ allowed: false, batchId: occurrence.batchId });
    expect(
      parseExecutionGateResult({
        content: loggedRecord({ ...requestlessDenial, result: "ALLOW" }),
        expected: nativeExpected,
      }),
    ).toBeUndefined();
    expect(
      parseExecutionGateResult({
        content: loggedRecord({
          ...requestlessDenial,
          requestId: occurrence.requestId,
        }),
        expected: nativeExpected,
      }),
    ).toBeUndefined();
  });

  it("parses GitHub's high-precision UTC log timestamp", () => {
    expect(
      parseExecutionGateResult({
        content: `2026-05-14T01:01:00.0328931Z ${record()}`,
        expected,
      }),
    ).toEqual({
      allowed: true,
      message: "Execution request evidence is present.",
    });
  });

  it("accepts the final millisecond of GitHub's reported completion second", () => {
    expect(
      parseExecutionGateResult({
        content: `2026-05-14T01:01:00.9999999Z ${record()}`,
        expected,
      }),
    ).toEqual({
      allowed: true,
      message: "Execution request evidence is present.",
    });
  });

  it.each([
    ["missing", ""],
    ["malformed", "2026-05-14T01:00:00.000Z BATCHPLANE_GATE_RESULT {not-json"],
    [
      "a malformed marker beside a matching record",
      `${loggedRecord()}\n2026-05-14T01:00:01.000Z BATCHPLANE_GATE_RESULT {not-json`,
    ],
    ["mismatched run", loggedRecord({ runId: "204" })],
    ["mismatched attempt", loggedRecord({ runAttempt: 1 })],
    ["mismatched repository", loggedRecord({ repository: "always0ne/other" })],
    [
      "mismatched Gate job",
      loggedRecord({ gateJobName: "Run governed batch" }),
    ],
    ["mismatched Gate step", loggedRecord({ gateStep: "Other step" })],
    [
      "marker outside the observed Gate step",
      loggedRecord({}, "2026-05-14T01:02:00.000Z"),
    ],
    [
      "marker from the next observed step",
      loggedRecord({}, "2026-05-14T01:01:01.000Z"),
    ],
    [
      "ambiguous",
      `${loggedRecord()}\n${loggedRecord({}, "2026-05-14T01:00:01.000Z")}`,
    ],
  ])("returns unknown for %s evidence", (_name, content) => {
    expect(parseExecutionGateResult({ content, expected })).toBeUndefined();
  });
});
