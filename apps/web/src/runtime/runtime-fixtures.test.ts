import { beforeEach, describe, expect, it } from "vitest";
import type { ExecutionRun } from "@batchplane/domain";

import {
  createBatchPlaneRuntime,
  createRuntimeBatchRevisionClient,
  createRuntimeGovernedChangeClient,
  createRuntimeFixtureMockState,
  legacyRuntimeFixtureStorageKey,
  readRuntimeFixtureSelection,
  readRuntimeSession,
  runtimeFixtureStorageKey,
  writeRuntimeFixtureSelection,
} from "./runtime-fixtures";
import { parseNativeScheduleExecutionLocator } from "@batchplane/github-lite";

import { createRuntimeBatchPlaneClient } from "./runtime-batch-plane-client";

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

  it("builds the verified Batch control fixture through a separately approved governed change", async () => {
    writeRuntimeFixtureSelection("batch-control-verified");

    await expect(
      createRuntimeBatchRevisionClient(
        readRuntimeSessionOrThrow(),
      ).verifyApprovedBatchRevision({ batchId: "payment.daily-close" }),
    ).resolves.toMatchObject({
      controlStatus: "VERIFIED",
      verifiedSha: expect.stringMatching(/^[0-9a-f]{40}$/u),
    });
  });

  it("provides a clean bypass fixture with review and restoration remediation available", async () => {
    writeRuntimeFixtureSelection("batch-control-bypassed-clean");
    const session = readRuntimeSessionOrThrow();
    const governedChanges = createRuntimeGovernedChangeClient(session);

    await expect(
      createRuntimeBatchRevisionClient(session).verifyApprovedBatchRevision({
        batchId: "payment.daily-close",
      }),
    ).resolves.toMatchObject({ controlStatus: "BYPASSED" });
    await expect(
      governedChanges.getBatchRemediationCapability({
        batchId: "payment.daily-close",
      }),
    ).resolves.toEqual({
      availableKinds: ["REVIEW_CURRENT", "RESTORE_LAST_APPROVED"],
      canRequest: true,
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

  it("provides attempt-scoped native schedule evidence for mixed schedules on one Run", async () => {
    writeRuntimeFixtureSelection("native-schedule-mixed");
    const runtime = createBatchPlaneRuntime(readRuntimeSessionOrThrow());

    const runs = await runtime.executions.listExecutionRuns({ limit: 20 });

    expect(runs).toHaveLength(4);
    expect(runs.map((run) => run.runId)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^native:/u)]),
    );
    expect(runs.map((run) => run.status)).toEqual(
      expect.arrayContaining(["SUCCEEDED", "FAILED", "BLOCKED", "UNCONFIRMED"]),
    );
    const unconfirmed = runs.find(hasUnconfirmedNativeSchedule);
    expect(unconfirmed?.jobs).toHaveLength(2);
    expect(
      parseNativeScheduleExecutionLocator(unconfirmed?.runId ?? ""),
    ).toEqual({
      requestId: `btr-schedule-${"b".repeat(64)}`,
      runAttempt: 2,
      sourceRunId: "900",
    });
    await expect(
      runtime.executions.getExecutionRun({ runId: unconfirmed?.runId ?? "" }),
    ).resolves.toMatchObject({
      jobs: expect.arrayContaining([
        expect.objectContaining({ name: "Schedule [weekday-open]" }),
        expect.objectContaining({ name: "Run [weekday-open]" }),
      ]),
      runId: unconfirmed?.runId,
    });
  });

  it("keeps scheduled requests out of approval work while retaining exact failure work links", async () => {
    writeRuntimeFixtureSelection("native-schedule-mixed");
    const client = createRuntimeBatchPlaneClient();

    const [workspace, approvals, myWork, audit] = await Promise.all([
      client.listWorkspaceRequests(),
      client.listApprovalRequests(),
      client.getMyWork(),
      createBatchPlaneRuntime(
        readRuntimeSessionOrThrow(),
      ).audit.listAuditTimeline({
        limit: 20,
      }),
    ]);

    const scheduled = workspace.requests.filter(
      (item) =>
        item.kind === "EXECUTION" && item.request.triggerType === "SCHEDULE",
    );
    expect(scheduled).toHaveLength(2);
    expect(
      approvals.requests.filter((item) => item.kind === "EXECUTION"),
    ).toEqual([]);
    expect(
      myWork.items.filter(
        (item) =>
          item.itemType !== "FAILURE_FOLLOW_UP" &&
          item.request.kind === "EXECUTION",
      ),
    ).toEqual([]);
    expect(
      myWork.items
        .filter((item) => item.itemType === "FAILURE_FOLLOW_UP")
        .map((item) => item.attemptLocator)
        .sort(),
    ).toEqual(
      [
        nativeScheduleLocator(`btr-schedule-${"a".repeat(64)}`, 2),
        nativeScheduleLocator(`btr-schedule-${"b".repeat(64)}`, 1),
      ].sort(),
    );
    expect(
      audit
        .filter((item) => item.itemId.startsWith("native-schedule-run-"))
        .map((item) => item.subjectId)
        .sort(),
    ).toEqual(
      [
        nativeScheduleLocator(`btr-schedule-${"a".repeat(64)}`, 1),
        nativeScheduleLocator(`btr-schedule-${"a".repeat(64)}`, 2),
        nativeScheduleLocator(`btr-schedule-${"b".repeat(64)}`, 1),
        nativeScheduleLocator(`btr-schedule-${"b".repeat(64)}`, 2),
      ].sort(),
    );
  });

  it("keeps a canonical in-progress schedule job running despite another shared Run result", async () => {
    writeRuntimeFixtureSelection("native-schedule-running");
    const runtime = createBatchPlaneRuntime(readRuntimeSessionOrThrow());
    const runs = await runtime.executions.listExecutionRuns({ limit: 20 });

    expect(runs).toEqual([
      expect.objectContaining({
        runId: nativeScheduleLocator(`btr-schedule-${"c".repeat(64)}`, 1),
        status: "RUNNING",
      }),
    ]);
    expect(runs[0]).not.toHaveProperty("completedAt");
    const detail = await runtime.executions.getExecutionRun({
      runId: runs[0]!.runId,
    });
    expect(detail).toMatchObject({ status: "RUNNING" });
    expect(detail).not.toHaveProperty("completedAt");
  });

  it("uses only the exact terminal native business job completion, not the shared Run update", async () => {
    writeRuntimeFixtureSelection("native-schedule-mixed");
    const runtime = createBatchPlaneRuntime(readRuntimeSessionOrThrow());
    const runs = await runtime.executions.listExecutionRuns({ limit: 20 });
    expect(runs).toHaveLength(4);
    for (const run of runs) {
      const detail = await runtime.executions.getExecutionRun({
        runId: run.runId,
      });
      if (run.status === "UNCONFIRMED") {
        expect(run).not.toHaveProperty("completedAt");
        expect(detail).not.toHaveProperty("completedAt");
      } else {
        const businessJob = run.jobs?.find((job) => job.role === "BUSINESS");
        expect(businessJob?.completedAt).toBeDefined();
        expect(run.completedAt).toBe(businessJob?.completedAt);
        expect(detail?.completedAt).toBe(businessJob?.completedAt);
        expect(run.completedAt).not.toBe(
          `2026-09-11T01:0${run.runAttempt}:10.000Z`,
        );
      }
    }
  });

  it("retains uncorrelated source Runs and exact historical jobs without requests or human work", async () => {
    writeRuntimeFixtureSelection("native-schedule-source-unconfirmed");
    const runtime = createBatchPlaneRuntime(readRuntimeSessionOrThrow());
    const client = createRuntimeBatchPlaneClient();
    const runs = await runtime.executions.listExecutionRuns({ limit: 20 });
    expect(runs).toHaveLength(2);
    expect(runs.map((run) => run.runAttempt).sort()).toEqual([1, 2]);
    for (const run of runs) {
      expect(run).toMatchObject({
        runId: "900",
        requestId: "",
        status: "UNCONFIRMED",
        evidenceScope: "SOURCE_RUN",
      });
      expect(run.gateDecision).toBeUndefined();
      expect(run).not.toHaveProperty("completedAt");
      expect(run.failureFollowUps ?? []).toEqual([]);
      expect(run.jobs).toHaveLength(4);
      expect(
        run.jobs?.every((job) => job.jobId.startsWith(String(run.runAttempt))),
      ).toBe(true);
      const detail = await runtime.executions.getExecutionRun({
        runId: "900",
        runAttempt: run.runAttempt,
      });
      expect(detail).toMatchObject({
        runId: "900",
        runAttempt: run.runAttempt,
        jobs: run.jobs,
        status: "UNCONFIRMED",
      });
      expect(detail).not.toHaveProperty("completedAt");
      const log = await runtime.executions.getExecutionRunJobLog({
        jobId: run.jobs![1]!.jobId,
      });
      expect(log.content).toContain(`"runAttempt":${run.runAttempt}`);
      expect(log.content).toContain("BATCHPLANE_GATE_RESULT");
    }
    expect(
      (await client.listWorkspaceRequests()).requests.filter(
        (item) => item.kind === "EXECUTION",
      ),
    ).toHaveLength(0);
    expect(
      (await client.listApprovalRequests()).requests.filter(
        (item) => item.kind === "EXECUTION",
      ),
    ).toHaveLength(0);
    expect(
      (await client.getMyWork()).items.filter(
        (item) =>
          item.itemType === "FAILURE_FOLLOW_UP" ||
          item.request.kind === "EXECUTION",
      ),
    ).toHaveLength(0);
    expect(await runtime.audit.listAuditTimeline({ limit: 20 })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metadata: expect.objectContaining({
            evidenceScope: "SOURCE_RUN",
            executionLocator: "900",
            observation: "UNCONFIRMED",
            runAttempt: 1,
          }),
        }),
        expect.objectContaining({
          metadata: expect.objectContaining({
            evidenceScope: "SOURCE_RUN",
            executionLocator: "900",
            observation: "UNCONFIRMED",
            runAttempt: 2,
          }),
        }),
      ]),
    );
  });
});

function nativeScheduleLocator(requestId: string, runAttempt: number): string {
  return `native:${requestId}:900:${runAttempt}`;
}

function hasUnconfirmedNativeSchedule(
  run: ExecutionRun,
): run is ExecutionRun & {
  nativeSchedule: { observation: "UNCONFIRMED" };
} {
  const nativeSchedule = (
    run as ExecutionRun & { nativeSchedule?: { observation?: unknown } }
  ).nativeSchedule;
  return nativeSchedule?.observation === "UNCONFIRMED";
}

function readRuntimeSessionOrThrow() {
  const session = readRuntimeSession();

  if (!session) {
    throw new Error("Expected runtime session.");
  }

  return session;
}
