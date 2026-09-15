import { describe, expect, it } from "vitest";

import {
  buildExecutionApprovalComment,
  buildExecutionRequestIssue,
  createExecutionRequestId,
  createScheduledExecutionRequestId,
} from "./execution-request-evidence.js";
import type { GitHubBatchDefinition } from "./github-batch-definition.js";

const batch: GitHubBatchDefinition = {
  batchId: "payment.daily-close",
  criticality: "HIGH",
  domain: "payments",
  environment: "PROD",
  execution: {
    command: "echo close payments",
    runsOn: ["self-hosted", "linux"],
  },
  gateRequired: true,
  name: "Daily Close",
  owner: "ops-team",
  status: "ACTIVE",
  workflow: { path: ".github/workflows/payment.daily-close.yml", ref: "main" },
};

const revision = {
  governedChangeId: "bgc-payment",
  targetRevisionDigest: "sha256:approved",
};

describe("execution request evidence", () => {
  it("creates manual execution request ids", () => {
    expect(
      createExecutionRequestId(
        "Payment Daily Close",
        new Date("2026-05-09T01:02:03.000Z"),
        "abcdef12",
      ),
    ).toBe("btr-20260509010203-payment-daily-close-abcdef12");
  });

  it("creates deterministic full-digest native scheduled execution request ids", async () => {
    const id = await createScheduledExecutionRequestId(
      "payment.daily-close",
      "daily",
      "12345",
      "98765",
    );
    await expect(
      createScheduledExecutionRequestId(
        "payment.daily-close",
        "daily",
        "12345",
        "98765",
      ),
    ).resolves.toBe(id);
    await expect(
      createScheduledExecutionRequestId(
        "payment.daily-close",
        "daily",
        "12345",
        "98766",
      ),
    ).resolves.not.toBe(id);
  });

  it("builds a scheduled execution request with native Run evidence fields", async () => {
    const issue = await buildExecutionRequestIssue({
      approvedBatchRevision: revision,
      batch,
      requestedAt: new Date("2026-05-09T01:02:03.000Z"),
      requestedBy: "dispatcher",
      schedule: {
        definitionCommitSha: "a".repeat(40),
        definitionPath: ".batch-governance/batches/payment.daily-close.yml",
        repositoryId: "12345",
        scheduleId: "daily",
        sourceRunAttempt: 1,
        sourceRunId: "98765",
      },
      triggerType: "SCHEDULE",
    });
    expect(issue.payload.spec).toMatchObject({
      contractVersion: "NATIVE_SCHEDULE_V2",
      schedule: { repositoryId: "12345", sourceRunId: "98765" },
    });
    expect(issue.labels).toContain("batchplane:scheduled-execution");
  });

  it("builds delegated schedule approval comments", () => {
    const comment = buildExecutionApprovalComment({
      approvalType: "SCHEDULE_DELEGATED",
      approvedAt: new Date("2026-05-09T01:02:03.000Z"),
      approver: "dispatcher",
      request: {
        batchId: batch.batchId,
        requestDigest: "sha256:request",
        requestId: "btr-schedule",
        requestedBy: "dispatcher",
      },
    });
    expect(comment).toContain("Approval type: SCHEDULE_DELEGATED");
  });

  it("builds Workspace auto-approval comments", () => {
    const comment = buildExecutionApprovalComment({
      approvalMode: "AUTO_APPROVE",
      approvalType: "WORKSPACE_AUTO_APPROVED",
      approvedAt: new Date("2026-05-09T01:02:03.000Z"),
      approver: "dispatcher",
      request: {
        batchId: batch.batchId,
        requestDigest: "sha256:request",
        requestId: "btr-auto",
        requestedBy: "dispatcher",
      },
    });
    expect(comment).toContain("Approval source: WORKSPACE_POLICY");
  });
});

describe("execution request issue serialization", () => {
  const batch: GitHubBatchDefinition = {
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

  it("builds an auditable GitHub issue body", async () => {
    const issue = await buildExecutionRequestIssue({
      approvedBatchRevision: {
        governedChangeId: "bgc-20260509-payment.daily-close-approved",
        targetRevisionDigest:
          "sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      },
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

  it("builds native scheduled execution issues without manual expiry", async () => {
    const issue = await buildExecutionRequestIssue({
      approvedBatchRevision: {
        governedChangeId: "bgc-20260509-payment.daily-close-approved",
        targetRevisionDigest:
          "sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      },
      batch: {
        ...batch,
        schedules: [
          {
            cron: "0 5 * * *",
            enabled: true,
            name: "Daily close",
            scheduleId: "payment.daily-close-daily",
            timezone: "Asia/Seoul",
          },
        ],
      },
      requestedAt: new Date("2026-05-09T05:01:00.000Z"),
      requestedBy: "github-actions[bot]",
      schedule: {
        definitionCommitSha: "abc123",
        definitionPath: ".batch-governance/batches/payment.daily-close.yml",
        repositoryId: "12345",
        scheduleId: "payment.daily-close-daily",
        sourceRunAttempt: 1,
        sourceRunId: "98765",
      },
      triggerType: "SCHEDULE",
      workflowRef: "main",
    });

    expect(issue.title).toBe("Scheduled run payment.daily-close");
    expect(issue.labels).toContain("batchplane:scheduled-execution");
    expect(issue.body).toContain("- Trigger type: `SCHEDULE`");
    expect(issue.body).toContain('"scheduleId": "payment.daily-close-daily"');
    expect(issue.payload.spec.contractVersion).toBe("NATIVE_SCHEDULE_V2");
    expect(issue.payload.spec.expiresAt).toBeUndefined();
  });
});
