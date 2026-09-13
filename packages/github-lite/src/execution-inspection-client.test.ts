import type { BatchPlaneRuntimePorts } from "@batchplane/domain";
import { ExecutionInspectionError } from "@batchplane/ui-client";
import { describe, expect, it, vi } from "vitest";
import { createGitHubLiteExecutionInspectionClient } from "./execution-inspection-client.js";
import { GitHubLiteApiError } from "./index.js";
describe("execution inspection adapter boundary", () => {
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
      jobId: "exact-job",
      sizeBytes: content.length,
      truncated: false,
    }));
    const runtime = {
      executions: { getExecutionRunJobLog: read },
    } as unknown as BatchPlaneRuntimePorts;
    const log = await createGitHubLiteExecutionInspectionClient({
      runtime,
    }).getExecutionRunJobLog({ jobId: "exact-job" });
    expect(read).toHaveBeenCalledWith({ jobId: "exact-job" });
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
      const runtime = {
        executions: {
          [method]: async () => {
            throw new GitHubLiteApiError("denied", "forbidden", 403);
          },
        },
      } as unknown as BatchPlaneRuntimePorts;
      const client = createGitHubLiteExecutionInspectionClient({ runtime });
      const invoke = client[method] as (input: never) => Promise<unknown>;
      await expect(invoke({} as never)).rejects.toEqual(
        new ExecutionInspectionError({ type: "access-denied" }),
      );
    },
  );
  it("uses the verified write response without a follow-up reread", async () => {
    const confirmed = { followUpId: "verified" };
    const read = vi.fn(async () => {
      throw new Error("read failed");
    });
    const runtime = {
      executions: {
        createFailureFollowUp: async () => confirmed,
        getExecutionRun: read,
      },
    } as unknown as BatchPlaneRuntimePorts;
    const result = await createGitHubLiteExecutionInspectionClient({
      runtime,
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
