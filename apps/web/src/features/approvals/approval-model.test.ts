import { describe, expect, it } from "vitest";

import type {
  RepositoryIssue,
  RepositoryIssueComment,
  RepositoryPullRequest,
} from "@batchplane/domain";

import {
  buildExecutionApprovalComment,
  buildExecutionRejectionComment,
  buildRegistrationApprovalComment,
  buildRegistrationRejectionComment,
  getGovernedChangeRequestKind,
  isRegistrationApprovalRequest,
  parseExecutionApprovalRequest,
  parseExecutionRequestDetail,
} from "./approval-model";

const pullRequest: RepositoryPullRequest = {
  number: 12,
  title: "Register batch payment.daily-close",
  url: "https://github.com/always0ne/batch/pull/12",
  head: "batchplane/register/payment.daily-close-20260509010203",
  base: "main",
  state: "open",
  author: "developer",
  body: "body",
  merged: false,
};

const executionIssue: RepositoryIssue = {
  number: 34,
  title: "Run batch payment.daily-close",
  body: [
    "## BatchPlane Execution Request",
    "",
    "- Request ID: `btr-20260509010203-payment.daily-close-abcdef12`",
    "- Batch ID: `payment.daily-close`",
    "- Requested by: @developer",
    "- Requested at: 2026-05-09T01:02:03.000Z",
    "- Expires at: 2026-05-09T02:02:03.000Z",
    "- Trigger type: `MANUAL`",
    "- Request digest: `sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef`",
    "- Status: REQUESTED",
    "",
    "### Canonical payload",
    "",
    "```json",
    JSON.stringify(
      {
        apiVersion: "batchplane.io/v1",
        kind: "ExecutionRequest",
        metadata: {
          batchId: "payment.daily-close",
          requestId: "btr-20260509010203-payment.daily-close-abcdef12",
        },
        spec: {
          batch: {
            criticality: "HIGH",
            domain: "payments",
            environment: "PROD",
            name: "Daily Close",
            owner: "ops-team",
          },
          execution: {
            command: "echo close payments",
            gateRequired: true,
            runsOn: "ubuntu-latest",
          },
          expiresAt: "2026-05-09T02:02:03.000Z",
          reason: "Close payments after reconciliation.",
          requestedAt: "2026-05-09T01:02:03.000Z",
          requestedBy: "developer",
          workflow: {
            path: ".github/workflows/payment.daily-close.yml",
            ref: "main",
          },
        },
      },
      null,
      2,
    ),
    "```",
    "",
    "<!-- batchplane:execution-request",
    "requestId=btr-20260509010203-payment.daily-close-abcdef12",
    "batchId=payment.daily-close",
    "requestDigest=sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    "status=REQUESTED",
    "-->",
  ].join("\n"),
  labels: [],
  url: "https://github.com/always0ne/batch/issues/34",
  state: "open",
  author: "developer",
  isPullRequest: false,
};

const approvalComment: RepositoryIssueComment = {
  author: "maintainer",
  body: [
    "/bgcp approve requestDigest=sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    "",
    "## BatchPlane Execution Approval",
    "",
    "- Decision: APPROVED",
    "- Approver: @maintainer",
    "- Approved at: 2026-05-09T03:02:03.000Z",
    "- Request ID: `btr-20260509010203-payment.daily-close-abcdef12`",
    "- Batch ID: `payment.daily-close`",
    "- Request digest: `sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef`",
    "",
    "<!-- batchplane:execution-approval",
    "decision=APPROVED",
    "requestId=btr-20260509010203-payment.daily-close-abcdef12",
    "batchId=payment.daily-close",
    "requestDigest=sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    "-->",
  ].join("\n"),
  createdAt: "2026-05-09T03:02:03.000Z",
  id: 1,
  issueNumber: 34,
};

const dispatcherComment: RepositoryIssueComment = {
  author: "github-actions[bot]",
  body: [
    "## BatchPlane Dispatcher DISPATCHED",
    "",
    "- Status: DISPATCHED",
    "- Request ID: `btr-20260509010203-payment.daily-close-abcdef12`",
    "- Batch ID: `payment.daily-close`",
    "- Request digest: `sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef`",
    "",
    "<!-- batchplane:bgcp:dispatcher",
    "status=DISPATCHED",
    "requestId=btr-20260509010203-payment.daily-close-abcdef12",
    "batchId=payment.daily-close",
    "requestDigest=sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    "-->",
  ].join("\n"),
  createdAt: "2026-05-09T03:03:03.000Z",
  id: 2,
  issueNumber: 34,
};

describe("approval model", () => {
  it("detects registration pull requests", () => {
    expect(isRegistrationApprovalRequest(pullRequest)).toBe(true);
    expect(
      getGovernedChangeRequestKind({
        ...pullRequest,
        head: "batchplane/change/payment.daily-close-20260509010203",
        title: "Change batch payment.daily-close",
      }),
    ).toBe("batch");
    expect(
      getGovernedChangeRequestKind({
        ...pullRequest,
        head: "batchplane/schedule/register/payment.daily-close-daily-20260509010203",
        title: "Register schedule payment.daily-close-daily",
      }),
    ).toBe("schedule");
    expect(
      isRegistrationApprovalRequest({
        ...pullRequest,
        head: "feature/demo",
        title: "Feature demo",
      }),
    ).toBe(false);
  });

  it("builds an auditable approval comment", () => {
    expect(
      buildRegistrationApprovalComment({
        approvedAt: new Date("2026-05-09T01:02:03.000Z"),
        approver: "maintainer",
        pullRequest,
      }),
    ).toContain("## BatchPlane Governed Change Approval");
    expect(
      buildRegistrationApprovalComment({
        approvedAt: new Date("2026-05-09T01:02:03.000Z"),
        approver: "maintainer",
        pullRequest,
      }),
    ).toContain("Decision: APPROVED");
  });

  it("builds an auditable rejection comment", () => {
    expect(
      buildRegistrationRejectionComment({
        rejectedAt: new Date("2026-05-09T01:02:03.000Z"),
        rejector: "maintainer",
        pullRequest,
      }),
    ).toContain("Decision: REJECTED");
  });

  it("parses execution approval requests from Issue evidence", () => {
    expect(parseExecutionApprovalRequest(executionIssue)).toEqual({
      batchId: "payment.daily-close",
      execution: {
        command: "echo close payments",
        gateRequired: true,
        runsOn: "ubuntu-latest",
      },
      expiresAt: "2026-05-09T02:02:03.000Z",
      issue: executionIssue,
      reason: "Close payments after reconciliation.",
      requestDigest:
        "sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      requestedAt: "2026-05-09T01:02:03.000Z",
      requestedBy: "developer",
      requestId: "btr-20260509010203-payment.daily-close-abcdef12",
      triggerType: "MANUAL",
      status: "REQUESTED",
      workflow: {
        path: ".github/workflows/payment.daily-close.yml",
        ref: "main",
      },
      canonicalPayload: expect.any(Object),
      comments: [],
    });
  });

  it("ignores non-requested execution Issues", () => {
    expect(
      parseExecutionApprovalRequest({
        ...executionIssue,
        body: executionIssue.body.replace(
          "status=REQUESTED",
          "status=APPROVED",
        ),
      }),
    ).toBeNull();
    expect(
      parseExecutionApprovalRequest({
        ...executionIssue,
        isPullRequest: true,
      }),
    ).toBeNull();
    expect(
      parseExecutionApprovalRequest({
        ...executionIssue,
        labels: ["batchplane:dispatch-failed"],
      }),
    ).toBeNull();
    expect(
      parseExecutionApprovalRequest({
        ...executionIssue,
        labels: ["batchplane:gate-blocked"],
      }),
    ).toBeNull();
  });

  it("builds auditable execution approval and rejection comments", () => {
    const request = parseExecutionApprovalRequest(executionIssue);

    expect(request).not.toBeNull();

    if (!request) {
      return;
    }

    expect(
      buildExecutionApprovalComment({
        approvedAt: new Date("2026-05-09T03:02:03.000Z"),
        approver: "maintainer",
        request,
      }),
    ).toContain("decision=APPROVED");
    expect(
      buildExecutionApprovalComment({
        approvedAt: new Date("2026-05-09T03:02:03.000Z"),
        approver: "maintainer",
        request,
      }),
    ).toMatch(/^\/bgcp approve requestDigest=sha256:/);
    expect(
      buildExecutionApprovalComment({
        approvedAt: new Date("2026-05-09T03:02:03.000Z"),
        approvalMode: "SELF_APPROVAL_ALLOWED",
        approver: request.requestedBy,
        request,
      }),
    ).toContain("Self approval: ALLOWED_BY_WORKSPACE_POLICY");
    expect(
      buildExecutionApprovalComment({
        approvedAt: new Date("2026-05-09T03:02:03.000Z"),
        approvalMode: "SELF_APPROVAL_ALLOWED",
        approver: request.requestedBy,
        request,
      }),
    ).toContain("approvalMode=SELF_APPROVAL_ALLOWED");
    expect(
      buildExecutionRejectionComment({
        rejectedAt: new Date("2026-05-09T03:02:03.000Z"),
        rejector: "maintainer",
        reason: "Missing reconciliation evidence.",
        request,
      }),
    ).toContain("decision=REJECTED");
    expect(
      buildExecutionRejectionComment({
        rejectedAt: new Date("2026-05-09T03:02:03.000Z"),
        rejector: "maintainer",
        reason: "Missing reconciliation evidence.",
        request,
      }),
    ).toContain("Reason: Missing reconciliation evidence.");
  });

  it("derives detail status from approval and dispatcher comments", () => {
    expect(
      parseExecutionApprovalRequest(executionIssue, [
        approvalComment,
        dispatcherComment,
      ]),
    ).toBeNull();

    expect(
      parseExecutionRequestDetail(executionIssue, [
        approvalComment,
        dispatcherComment,
      ])?.status,
    ).toBe("DISPATCHED");
  });
});
