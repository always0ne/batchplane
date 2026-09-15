import { createGitHubLiteExecutionRunClient } from "./execution-run-client.js";
import { createGitHubLiteFailureFollowUpClient } from "./failure-follow-up-client.js";
import { createMockGitHubLiteClient } from "./mock-client.js";
import { createGitHubLiteMockState } from "./mock-state.js";
import type { FailureFollowUp } from "@batchplane/domain";
import { ExecutionInspectionError } from "@batchplane/ui-client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGitHubLiteExecutionInspectionClient } from "./execution-inspection-client.js";
import type { ExecutionRunFacts } from "./execution-run-projection.js";
import { GitHubLiteApiError } from "./github-types.js";
vi.mock("./execution-run-client.js", () => ({
  createGitHubLiteExecutionRunClient: vi.fn(),
}));
vi.mock("./failure-follow-up-client.js", () => ({
  createGitHubLiteFailureFollowUpClient: vi.fn(),
}));
function createContext() {
  return {
    client: createMockGitHubLiteClient(createGitHubLiteMockState()),
    repositoryRef: { owner: "always0ne", repo: "batch" },
  };
}
describe("execution inspection adapter boundary", () => {
  beforeEach(() => {
    vi.mocked(createGitHubLiteExecutionRunClient).mockReturnValue({
      getExecutionRun: vi.fn(),
      listExecutionRuns: vi.fn(),
    });
    vi.mocked(createGitHubLiteFailureFollowUpClient).mockReturnValue({
      createFailureFollowUp: vi.fn(),
      reviewFailureFollowUp: vi.fn(),
    });
  });
  it("projects neutral run fields without leaking raw GitHub correlation fields", async () => {
    const run: ExecutionRunFacts = {
      batchId: "payment.daily-close",
      nativeSchedule: {
        executionLocator: "native:request-7:992:1",
        observation: "SUCCEEDED",
        scheduleId: "daily",
        sourceRunAttempt: 1,
        sourceRunId: "992",
      },
      requestId: "request-7",
      requestIssueNumber: 17,
      requestIssueUrl: "https://github.example/issues/17",
      runId: "native:request-7:992:1",
      sourceStatus: "completed",
      status: "SUCCEEDED",
      workflowName: "Daily close",
      workflowPath: ".github/workflows/daily-close.yml",
      workflowRunId: "992",
      workflowRunUrl: "https://github.example/actions/runs/992",
    };
    vi.mocked(createGitHubLiteExecutionRunClient).mockReturnValue({
      getExecutionRun: vi.fn(),
      listExecutionRuns: async () => [run],
    });

    const [presentation] = await createGitHubLiteExecutionInspectionClient({
      ...createContext(),
    }).listExecutionRuns();

    expect(presentation).toMatchObject({
      executionTarget: {
        location: ".github/workflows/daily-close.yml",
        name: "Daily close",
      },
      nativeSchedule: run.nativeSchedule,
      sourceUrl: "https://github.example/actions/runs/992",
    });
    for (const rawKey of [
      "requestIssueNumber",
      "requestIssueUrl",
      "workflowName",
      "workflowPath",
      "workflowRunId",
      "workflowRunUrl",
    ]) {
      expect(presentation).not.toHaveProperty(rawKey);
    }
  });

  it("selects the native business command section without changing full log bytes", async () => {
    const content = [
      "2026-09-11T01:00:00Z BATCHPLANE_GATE_RESULT allowed=true",
      "2026-09-11T01:00:01Z ##[group]BatchPlane batch command",
      "2026-09-11T01:00:01Z npm run close",
      "2026-09-11T01:00:02Z Closed 12 batches.",
      "2026-09-11T01:00:03Z ##[endgroup]",
      "2026-09-11T01:00:04Z Cleanup",
    ].join("\r\n");
    const read = vi.fn(async () => ({
      content,
      jobId: 42,
      sizeBytes: content.length,
      truncated: false,
    }));
    const context = createContext();
    context.client.getWorkflowJobLog = read;
    const log = await createGitHubLiteExecutionInspectionClient(
      context,
    ).getExecutionRunJobLog({ jobId: "42" });
    expect(read).toHaveBeenCalledWith({ ...context.repositoryRef, jobId: 42 });
    expect(log.content).toBe(content);
    expect(log.businessSection).toMatchObject({
      focused: true,
      content: expect.stringContaining("Closed 12 batches."),
    });
    expect(log.businessSection.content).not.toContain("BATCHPLANE_GATE_RESULT");
    expect(log.businessSection.content).not.toContain("Cleanup");
  });
  it.each([
    "listExecutionRuns",
    "getExecutionRun",
    "createFailureFollowUp",
    "reviewFailureFollowUp",
  ] as const)(
    "maps %s provider failures without an empty or successful substitute",
    async (method) => {
      const fail = vi
        .fn()
        .mockRejectedValue(new GitHubLiteApiError("denied", "forbidden", 403));
      vi.mocked(createGitHubLiteExecutionRunClient).mockReturnValue({
        getExecutionRun: fail,
        listExecutionRuns: fail,
      });
      vi.mocked(createGitHubLiteFailureFollowUpClient).mockReturnValue({
        createFailureFollowUp: fail,
        reviewFailureFollowUp: fail,
      });
      const client = createGitHubLiteExecutionInspectionClient(createContext());
      const invoke = () => {
        if (method === "listExecutionRuns") return client.listExecutionRuns();
        if (method === "getExecutionRun")
          return client.getExecutionRun({ runId: "42" });
        if (method === "createFailureFollowUp")
          return client.createFailureFollowUp({
            runId: "42",
            owner: "ops",
            actionTaken: "Fix",
            explanation: "Cause",
            status: "RESOLVED",
          });
        return client.reviewFailureFollowUp({
          runId: "42",
          followUpId: "follow-up",
          decision: "APPROVED",
          reason: "Verified",
        });
      };
      await expect(invoke()).rejects.toEqual(
        new ExecutionInspectionError({ type: "access-denied" }),
      );
    },
  );
  it("uses the verified write response without a follow-up reread", async () => {
    const confirmed: FailureFollowUp = {
      followUpId: "verified",
      runId: "native:opaque",
      requestId: "request",
      batchId: "payment.daily-close",
      status: "RESOLVED",
      reviewStatus: "AWAITING_REVIEW",
      reviews: [],
      owner: "original",
      author: "operator",
      explanation: "Cause",
      actionTaken: "Fix",
      createdAt: "2026-09-15T00:00:00Z",
    };
    const read = vi.fn(async () => {
      throw new Error("read failed");
    });
    vi.mocked(createGitHubLiteExecutionRunClient).mockReturnValue({
      getExecutionRun: read,
      listExecutionRuns: vi.fn(),
    });
    vi.mocked(createGitHubLiteFailureFollowUpClient).mockReturnValue({
      createFailureFollowUp: async () => confirmed,
      reviewFailureFollowUp: vi.fn(),
    });
    const result = await createGitHubLiteExecutionInspectionClient({
      ...createContext(),
    }).createFailureFollowUp({
      runId: "native:opaque",
      owner: "original",
      explanation: "Cause",
      actionTaken: "Fix",
      status: "RESOLVED",
    });
    expect(result).toBe(confirmed);
    expect(read).not.toHaveBeenCalled();
  });
});
