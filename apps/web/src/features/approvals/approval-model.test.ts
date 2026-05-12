import { describe, expect, it } from "vitest";

import type { GitHubIssue, GitHubPullRequest } from "@batchtrail/github-lite";

import {
  buildExecutionApprovalComment,
  buildExecutionRejectionComment,
  buildRegistrationApprovalComment,
  buildRegistrationRejectionComment,
  isRegistrationApprovalRequest,
  parseExecutionApprovalRequest,
} from "./approval-model";

const pullRequest: GitHubPullRequest = {
  number: 12,
  title: "Register batch payment.daily-close",
  url: "https://github.com/always0ne/batch/pull/12",
  head: "batchtrail/register/payment.daily-close-20260509010203",
  base: "main",
  state: "open",
  author: "developer",
  body: "body",
  merged: false,
};

const executionIssue: GitHubIssue = {
  number: 34,
  title: "Run batch payment.daily-close",
  body: [
    "## BatchTrail Execution Request",
    "",
    "- Request ID: `btr-20260509010203-payment.daily-close-abcdef12`",
    "- Batch ID: `payment.daily-close`",
    "- Requested by: @developer",
    "- Requested at: 2026-05-09T01:02:03.000Z",
    "- Expires at: 2026-05-09T02:02:03.000Z",
    "- Request digest: `sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef`",
    "- Status: REQUESTED",
    "",
    "<!-- batchtrail:execution-request",
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

describe("approval model", () => {
  it("detects registration pull requests", () => {
    expect(isRegistrationApprovalRequest(pullRequest)).toBe(true);
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
      expiresAt: "2026-05-09T02:02:03.000Z",
      issue: executionIssue,
      requestDigest:
        "sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      requestedAt: "2026-05-09T01:02:03.000Z",
      requestedBy: "developer",
      requestId: "btr-20260509010203-payment.daily-close-abcdef12",
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
      buildExecutionRejectionComment({
        rejectedAt: new Date("2026-05-09T03:02:03.000Z"),
        rejector: "maintainer",
        request,
      }),
    ).toContain("decision=REJECTED");
  });
});
