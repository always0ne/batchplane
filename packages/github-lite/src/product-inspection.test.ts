import { describe, expect, it, vi } from "vitest";
import { createGitHubLiteMockState } from "./mock-state.js";
import { createMockGitHubLiteClient } from "./mock-client.js";
import { createGitHubLiteBatchPlaneClient } from "./product-client.js";
describe("execution inspection product integration", () => {
  it("preserves manual audit metadata and reads each Issue/comments once", async () => {
    const client = createMockGitHubLiteClient(createGitHubLiteMockState());
    const listIssues = vi.spyOn(client, "listIssues"),
      comments = vi.spyOn(client, "listIssueComments");
    const runtime = createGitHubLiteBatchPlaneClient({
      client,
      repositoryRef: { owner: "always0ne", repo: "batch" },
    });
    const items = await runtime.listAuditTimeline({ limit: 100 });
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
    const runtime = createGitHubLiteBatchPlaneClient({
      client,
      repositoryRef: { owner: "always0ne", repo: "batch" },
    });

    const items = await runtime.listAuditTimeline({ limit: 1 });
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

    const runs = await runtime.listExecutionRuns({ limit: 20 });
    expect(runs).toHaveLength(20);
    expect(runs.some((run) => run.runId === String(manual.id))).toBe(false);
  });
  it("does not turn a run read error into an empty Dashboard", async () => {
    const github = createMockGitHubLiteClient(createGitHubLiteMockState());
    vi.spyOn(github, "listWorkflowRuns").mockRejectedValue(
      new Error("Run API unavailable"),
    );
    const client = createGitHubLiteBatchPlaneClient({
      client: github,
      repositoryRef: { owner: "always0ne", repo: "batch" },
    });
    await expect(client.listExecutionRuns()).rejects.toThrow(
      "Run API unavailable",
    );
    await expect(client.getDashboardSummary()).rejects.toThrow(
      "Run API unavailable",
    );
  });
});
