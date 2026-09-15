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
