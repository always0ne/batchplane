import { describe, expect, it } from "vitest";

import type {
  ApprovalDecision,
  AuditTimelineItem,
  BatchDefinition,
  ExecutionRequest,
  ExecutionRun,
  WorkspacePolicy,
} from "./index.js";

describe("domain product contracts", () => {
  it("keeps batch definitions free of provider persistence fields", () => {
    const batch: BatchDefinition = {
      batchId: "payment.daily-close",
      criticality: "HIGH",
      domain: "payments",
      environment: "PROD",
      gateRequired: true,
      name: "Daily Close",
      owner: "ops-team",
      schedules: [
        {
          cron: "0 5 * * *",
          enabled: true,
          name: "Daily close",
          scheduleId: "daily-close",
          timezone: "Asia/Seoul",
        },
      ],
      status: "ACTIVE",
    };

    expect(batch.schedules).toHaveLength(1);
    expect("workflow" in batch).toBe(false);
    expect("execution" in batch).toBe(false);
  });

  it("keeps product approval, request, run, and audit contracts cohesive", () => {
    const policy: WorkspacePolicy = {
      approval: { mode: "SELF_APPROVAL_BLOCKED" },
    };
    const request: ExecutionRequest = {
      approvedBatchRevision: {
        governedChangeId: "bgc-1",
        targetRevisionDigest: "sha256:revision",
      },
      batchId: "payment.daily-close",
      requestDigest: "sha256:request",
      requestedAt: "2026-09-15T00:00:00.000Z",
      requestedBy: "developer",
      requestId: "btr-1",
      status: "REQUESTED",
    };
    const decision: ApprovalDecision = {
      decidedAt: "2026-09-15T00:01:00.000Z",
      decidedBy: "maintainer",
      decision: "APPROVED",
      decisionId: "approval-1",
      subjectId: request.requestId,
      subjectType: "EXECUTION_REQUEST",
    };
    const run: ExecutionRun = {
      batchId: request.batchId,
      requestId: request.requestId,
      runId: "run-1",
      status: "QUEUED",
    };
    const audit: AuditTimelineItem = {
      actor: decision.decidedBy,
      itemId: "audit-1",
      occurredAt: decision.decidedAt,
      subjectId: run.runId,
      subjectType: "EXECUTION_RUN",
      summary: "Execution queued.",
      type: "DISPATCH_RECORDED",
    };

    expect(policy.approval.mode).toBe("SELF_APPROVAL_BLOCKED");
    expect(audit.subjectId).toBe(run.runId);
  });
});
