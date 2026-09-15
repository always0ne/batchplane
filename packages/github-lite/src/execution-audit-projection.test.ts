import { describe, expect, it } from "vitest";
import { toInspectedRunAuditItem } from "./execution-audit-projection.js";
import type { ExecutionRunFacts } from "./execution-run-projection.js";

describe("execution audit projection", () => {
  it("uses the raw workflow run ID for a native execution locator", () => {
    const run: ExecutionRunFacts = {
      batchId: "payment.daily-close",
      nativeSchedule: {
        executionLocator: "native:request-7:900:1",
        observation: "SUCCEEDED",
        scheduleId: "weekday-close",
        sourceRunAttempt: 1,
        sourceRunId: "900",
      },
      requestId: "request-7",
      runId: "native:request-7:900:1",
      sourceStatus: "completed",
      status: "SUCCEEDED",
      workflowRunId: "900",
    };

    expect(toInspectedRunAuditItem(run).metadata).toMatchObject({
      runId: 900,
    });
  });
});
