import {
  createGitHubLiteBatchPlaneClient,
  createMockGitHubLiteClient,
} from "@batchplane/github-lite";
import { isBusinessFailure } from "@batchplane/ui-client";
import { beforeEach, describe, expect, it } from "vitest";
import { createRuntimeBatchPlaneClient } from "./runtime-batch-plane-client";
import {
  createRuntimeFixtureMockState,
  writeRuntimeFixtureSelection,
} from "./runtime-fixtures";

describe("execution inspection product integration", () => {
  beforeEach(() => sessionStorage.clear());
  it.each([
    ["native-schedule-success", 1, 0, 0],
    ["native-schedule-failure", 1, 1, 0],
    ["native-schedule-blocked", 1, 0, 1],
    ["native-schedule-unconfirmed", 1, 0, 0],
    ["native-schedule-running", 1, 0, 0],
    ["native-schedule-mixed", 4, 1, 1],
    ["native-schedule-source-unconfirmed", 2, 0, 0],
    ["gate-verification-unknown", 1, 0, 0],
    ["business-failed", 1, 1, 0],
  ] as const)(
    "shares %s run/failure/approval/Dashboard facts",
    async (fixture, total, failed, blocked) => {
      writeRuntimeFixtureSelection(fixture);
      const client = createRuntimeBatchPlaneClient();
      const [runs, summary, approvals] = await Promise.all([
        client.listExecutionRuns({ limit: 100 }),
        client.getDashboardSummary(),
        client.listApprovalRequests(),
      ]);
      expect(runs).toHaveLength(total);
      expect(runs.filter(isBusinessFailure)).toHaveLength(failed);
      expect(summary.failedRunCount).toBe(failed);
      expect(summary.gateBlockedRunCount).toBe(blocked);
      expect(summary.pendingApprovals).toEqual(approvals.requests);
      if (fixture.startsWith("native-")) {
        expect(summary.pendingApprovals).toHaveLength(1);
        expect(
          summary.pendingApprovals.every(
            (item) => item.kind === "GOVERNED_CHANGE",
          ),
        ).toBe(true);
      }
      if (fixture === "native-schedule-running")
        expect(runs[0]).toMatchObject({ status: "RUNNING" });
      if (fixture === "native-schedule-running")
        expect(runs[0]).not.toHaveProperty("completedAt");
    },
  );
  it("uses exact shared native attempts in request, Batch recent, audit and job logs", async () => {
    writeRuntimeFixtureSelection("native-schedule-mixed");
    const client = createRuntimeBatchPlaneClient();
    const runs = await client.listExecutionRuns({ limit: 100 });
    const audit = await client.listAuditTimeline({ limit: 100 });
    expect(
      audit
        .flatMap((item) => (item.execution ? [item.execution.locator] : []))
        .sort(),
    ).toEqual(runs.map((run) => run.runId).sort());
    const batch = await client.getBatchDetail({
      batchId: "payment.daily-close",
    });
    expect(batch.type).toBe("active");
    if (batch.type !== "active")
      throw new Error("Expected active fixture batch");
    expect(batch.recentExecutionRequests).toHaveLength(2);
    for (const request of batch.recentExecutionRequests) {
      expect(request.scheduled).toBe(true);
      const detail = await client.getExecutionRequest({
        requestLocator: request.locator,
      });
      expect(detail?.attempts.type).toBe("loaded");
      if (detail?.attempts.type === "loaded")
        expect(
          detail.attempts.attempts
            .map((attempt) => attempt.attemptLocator)
            .sort(),
        ).toEqual(
          runs
            .filter((run) => run.requestId === request.requestId)
            .map((run) => run.runId)
            .sort(),
        );
    }
    for (const run of runs) {
      const detail = await client.getExecutionRun({ runId: run.runId });
      expect(detail?.jobs?.map((job) => job.jobId)).toEqual(
        run.jobs?.map((job) => job.jobId),
      );
      const business = detail?.jobs?.find((job) => job.role === "BUSINESS");
      if (!business) throw new Error("Missing exact business job");
      const log = await client.getExecutionRunJobLog({ jobId: business.jobId });
      if (run.status === "SUCCEEDED" || run.status === "FAILED") {
        expect(log.content).toContain("BATCHPLANE_GATE_RESULT");
        expect(log.businessSection.focused).toBe(true);
        expect(log.businessSection.content).toContain(
          "BatchPlane batch command",
        );
        expect(log.businessSection.content).not.toContain(
          "BATCHPLANE_GATE_RESULT",
        );
      }
    }
  });
  it("keeps all native occurrence facts until the final audit timestamp limit", async () => {
    const state = createRuntimeFixtureMockState("native-schedule-mixed");
    state.pullRequests = [];
    state.workflowRuns = [
      ...Array.from({ length: 18 }, (_, index) => ({
        ...state.workflowRuns[0]!,
        id: 1000 + index,
        updatedAt: "2026-09-10T01:00:00.000Z",
      })),
      ...state.workflowRuns,
    ];
    const runtime = createGitHubLiteBatchPlaneClient({
      client: createMockGitHubLiteClient(state),
      repositoryRef: { owner: "always0ne", repo: "batch" },
    });

    const items = await runtime.listAuditTimeline({ limit: 2 });
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.metadata?.executionLocator).sort()).toEqual(
      [
        `native:btr-schedule-${"a".repeat(64)}:900:2`,
        `native:btr-schedule-${"b".repeat(64)}:900:2`,
      ],
    );
    expect(
      items.every((item) => item.occurredAt === "2026-09-11T01:02:10.000Z"),
    ).toBe(true);
  });
});
