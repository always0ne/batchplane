import { beforeEach, describe, expect, it } from "vitest";

import {
  createBatchPlaneRuntime,
  createRuntimeFixtureMockState,
  legacyRuntimeFixtureStorageKey,
  readRuntimeFixtureSelection,
  readRuntimeSession,
  runtimeFixtureStorageKey,
  writeRuntimeFixtureSelection,
} from "./runtime-fixtures";

describe("runtime fixtures", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("stores a development fixture selection in sessionStorage", () => {
    expect(readRuntimeFixtureSelection()).toBe("live");

    sessionStorage.setItem(runtimeFixtureStorageKey, "unknown");
    expect(readRuntimeFixtureSelection()).toBe("live");

    writeRuntimeFixtureSelection("approval-pending");

    expect(sessionStorage.getItem(runtimeFixtureStorageKey)).toBe(
      "approval-pending",
    );
    expect(readRuntimeFixtureSelection()).toBe("approval-pending");
  });

  it("reads legacy BatchTrail fixture keys", () => {
    sessionStorage.setItem(legacyRuntimeFixtureStorageKey, "gate-blocked");

    expect(readRuntimeFixtureSelection()).toBe("gate-blocked");
  });

  it("provides a mock GitHub session when a fixture is selected", () => {
    writeRuntimeFixtureSelection("gate-blocked");

    expect(readRuntimeSession()).toEqual({
      owner: "always0ne",
      repo: "batch",
      token: "fixture-token",
    });
  });

  it.each([
    { fixture: "happy-path", expectedState: "dispatched" },
    { fixture: "approval-pending", expectedState: "requested" },
    { fixture: "business-failed", expectedState: "business-failed" },
    { fixture: "dispatch-failed", expectedState: "failed" },
    { fixture: "gate-blocked", expectedState: "gate-blocked" },
  ] as const)(
    "builds the $fixture runtime fixture state",
    ({ expectedState, fixture }) => {
      const state = createRuntimeFixtureMockState(fixture);

      expect(state.executionScenarios).toHaveLength(1);
      expect(state.executionScenarios[0]?.state).toBe(expectedState);
      expect(state.pullRequests).toEqual([]);
    },
  );

  it("switches runtime behavior between approval and failure fixtures", async () => {
    writeRuntimeFixtureSelection("approval-pending");

    const approvalRuntime = createBatchPlaneRuntime(
      readRuntimeSessionOrThrow(),
    );
    await expect(
      approvalRuntime.approvals.listExecutionRequestIssues(),
    ).resolves.toEqual([
      expect.objectContaining({
        labels: expect.arrayContaining(["batchplane:execution-request"]),
        state: "open",
      }),
    ]);

    writeRuntimeFixtureSelection("dispatch-failed");

    const failedRuntime = createBatchPlaneRuntime(readRuntimeSessionOrThrow());
    await expect(
      failedRuntime.approvals.listExecutionRequestIssues(),
    ).resolves.toEqual([
      expect.objectContaining({
        labels: expect.arrayContaining(["batchplane:dispatch-failed"]),
        state: "open",
      }),
    ]);
  });

  it("provides a requestless, run-scoped Gate DENY fixture", async () => {
    writeRuntimeFixtureSelection("requestless-gate-deny");

    const runs = await createBatchPlaneRuntime(
      readRuntimeSessionOrThrow(),
    ).executions.listExecutionRuns({ limit: 20 });

    expect(runs).toEqual([
      expect.objectContaining({
        gateDecision: expect.objectContaining({ allowed: false }),
        requestId: "",
        status: "BLOCKED",
      }),
    ]);
  });

  it("provides a requestless unknown-verification fixture without a business failure", async () => {
    writeRuntimeFixtureSelection("gate-verification-unknown");

    const runs = await createBatchPlaneRuntime(
      readRuntimeSessionOrThrow(),
    ).executions.listExecutionRuns({ limit: 20 });

    expect(runs).toEqual([
      expect.objectContaining({
        requestId: "",
        status: "FAILED",
      }),
    ]);
    expect(runs[0]?.gateDecision).toBeUndefined();
  });
});

function readRuntimeSessionOrThrow() {
  const session = readRuntimeSession();

  if (!session) {
    throw new Error("Expected runtime session.");
  }

  return session;
}
