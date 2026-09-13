import {
  createGitHubLiteMockState,
  createMockGitHubLiteClient,
} from "@batchplane/github-lite";
import { isBusinessFailure } from "@batchplane/ui-client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGitHubLiteRuntime } from "./github-lite-runtime";
import { createRuntimeBatchPlaneClient } from "./runtime-batch-plane-client";
import {
  createBatchPlaneRuntime,
  createRuntimeFixtureMockState,
  readRuntimeSession,
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
  it("preserves manual audit metadata and reads each Issue/comments once", async () => {
    const client = createMockGitHubLiteClient(createGitHubLiteMockState());
    const listIssues = vi.spyOn(client, "listIssues"),
      comments = vi.spyOn(client, "listIssueComments");
    const runtime = createGitHubLiteRuntime(
      { owner: "always0ne", repo: "batch", token: "fixture-token" },
      { client },
    );
    const items = await runtime.audit.listAuditTimeline({ limit: 100 });
    expect(listIssues).toHaveBeenCalledTimes(1);
    for (const issue of client.state.issues)
      expect(
        comments.mock.calls.filter(
          ([input]) => input.issueNumber === issue.number,
        ),
      ).toHaveLength(1);
    const failed = client.state.workflowRuns.find(
      (run) => run.conclusion === "failure",
    )!;
    expect(
      items.find((item) => item.itemId === `workflow-run-${failed.id}`),
    ).toMatchObject({
      subjectId: String(failed.id),
      occurredAt: failed.updatedAt,
      metadata: {
        conclusion: "failure",
        status: "completed",
        runId: failed.id,
      },
    });
  });
  it("orders audit by update time before limiting either event source window", async () => {
    const state = createGitHubLiteMockState();
    const manual = {
      ...state.workflowRuns.find((run) => run.event === "workflow_dispatch")!,
      updatedAt: "2026-09-13T01:00:00.000Z",
    };
    state.issues = [];
    state.issueComments = [];
    state.pullRequests = [];
    state.executionScenarios = [];
    state.workflowRuns = [
      ...Array.from({ length: 20 }, (_, index) => ({
        ...manual,
        event: "schedule" as const,
        id: manual.id + index + 1,
        requestId: undefined,
        updatedAt: "2026-09-12T01:00:00.000Z",
      })),
      manual,
    ];
    const client = createMockGitHubLiteClient(state);
    const listWorkflowRuns = vi.spyOn(client, "listWorkflowRuns");
    const runtime = createGitHubLiteRuntime(
      { owner: "always0ne", repo: "batch", token: "fixture-token" },
      { client },
    );

    const items = await runtime.audit.listAuditTimeline({ limit: 1 });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      itemId: `workflow-run-${manual.id}`,
      occurredAt: manual.updatedAt,
    });
    expect(listWorkflowRuns).toHaveBeenCalledTimes(2);
    for (const event of ["workflow_dispatch", "schedule"])
      expect(listWorkflowRuns).toHaveBeenCalledWith(
        expect.objectContaining({ event, perPage: 20 }),
      );

    const runs = await runtime.executions.listExecutionRuns({ limit: 20 });
    expect(runs).toHaveLength(20);
    expect(runs.some((run) => run.runId === String(manual.id))).toBe(false);
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
    const runtime = createGitHubLiteRuntime(
      { owner: "always0ne", repo: "batch", token: "fixture-token" },
      { client: createMockGitHubLiteClient(state) },
    );

    const items = await runtime.audit.listAuditTimeline({ limit: 2 });
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
  it("does not turn a run read error into an empty Dashboard", async () => {
    writeRuntimeFixtureSelection("business-failed");
    const runtime = createBatchPlaneRuntime(readRuntimeSession()!);
    runtime.executions.listExecutionRuns = async () => {
      throw new Error("Run API unavailable");
    };
    const client = createRuntimeBatchPlaneClient({
      createRuntime: () => runtime,
    });
    await expect(client.listExecutionRuns()).rejects.toThrow(
      "Run API unavailable",
    );
    await expect(client.getDashboardSummary()).rejects.toThrow(
      "Run API unavailable",
    );
  });
});
