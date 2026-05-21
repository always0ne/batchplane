import { describe, expect, it } from "vitest";

import type { BatchDefinition } from "@batchplane/domain";

import {
  addHours,
  buildExecutionRequestIssue,
  createExecutionRequestId,
} from "./execution-request-model";

const batch: BatchDefinition = {
  batchId: "payment.daily-close",
  criticality: "HIGH",
  domain: "payments",
  environment: "PROD",
  gateRequired: true,
  name: "Daily Close",
  owner: "ops-team",
  status: "ACTIVE",
  execution: {
    command: "echo close payments",
    runsOn: "ubuntu-latest",
  },
  workflow: {
    path: ".github/workflows/daily-close.yml",
    ref: "main",
  },
};

describe("execution request model", () => {
  it("creates a stable request id", () => {
    expect(
      createExecutionRequestId(
        "Payment Daily Close",
        new Date("2026-05-09T01:02:03.000Z"),
        "abcdef12",
      ),
    ).toBe("btr-20260509010203-payment-daily-close-abcdef12");
  });

  it("adds expiration hours", () => {
    expect(
      addHours(new Date("2026-05-09T01:02:03.000Z"), 1).toISOString(),
    ).toBe("2026-05-09T02:02:03.000Z");
  });

  it("builds an auditable GitHub issue body", async () => {
    const issue = await buildExecutionRequestIssue({
      batch,
      expiresAt: new Date("2026-05-09T02:02:03.000Z"),
      parameters: [
        {
          name: "cycleDate",
          sensitive: false,
          value: "2026-05-09",
        },
        {
          name: "apiToken",
          sensitive: true,
          value: "super-secret-token",
        },
      ],
      requestId: "btr-20260509010203-payment.daily-close-abcdef12",
      requestedAt: new Date("2026-05-09T01:02:03.000Z"),
      requestedBy: "always0ne",
      workflowRef: "release/2026-05",
    });

    expect(issue.title).toBe("Run batch payment.daily-close");
    expect(issue.labels).toEqual(["batchplane:execution-request"]);
    expect(issue.request).toMatchObject({
      batchId: "payment.daily-close",
      requestedBy: "always0ne",
      status: "REQUESTED",
    });
    expect(issue.request.requestDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(issue.body).toContain("## BatchPlane Execution Request");
    expect(issue.body).toContain("batchplane:execution-request");
    expect(issue.body).toContain("requestId=btr-20260509010203");
    expect(issue.body).toContain(
      `requestDigest=${issue.request.requestDigest}`,
    );
    expect(issue.body).toContain('"kind": "ExecutionRequest"');
    expect(issue.body).toContain('"ref": "release/2026-05"');
    expect(issue.body).toContain('"command": "echo close payments"');
    expect(issue.body).toContain('"runsOn": "ubuntu-latest"');
    expect(issue.body).toContain('"gateRequired": true');
    expect(issue.body).toContain('"cycleDate"');
    expect(issue.body).toContain('"value": "2026-05-09"');
    expect(issue.body).toContain('"apiToken"');
    expect(issue.body).toContain('"valueDigest": "sha256:');
    expect(issue.body).not.toContain("super-secret-token");
  });
});
