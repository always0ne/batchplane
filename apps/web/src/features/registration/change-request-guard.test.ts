import { describe, expect, it } from "vitest";
import type {
  RepositoryIssue,
  RepositoryIssueComment,
  RepositoryPullRequest,
} from "@batchplane/domain";

import { findBatchChangeRequestBlockers } from "./change-request-guard";

describe("change request guard", () => {
  it("blocks batch changes when an open governed change PR targets the same batch", () => {
    const blockers = findBatchChangeRequestBlockers({
      batchId: "payment.daily-close",
      issueComments: [],
      issues: [],
      pullRequestComments: [[]],
      pullRequests: [governedChangePullRequest()],
    });

    expect(blockers).toEqual([
      expect.objectContaining({
        number: 12,
        reviewState: "OPEN",
        type: "governed-change",
      }),
    ]);
  });

  it("does not block when the governed change was rejected", () => {
    const blockers = findBatchChangeRequestBlockers({
      batchId: "payment.daily-close",
      issueComments: [],
      issues: [],
      pullRequestComments: [[registrationRejectionComment]],
      pullRequests: [governedChangePullRequest()],
    });

    expect(blockers).toEqual([]);
  });

  it("blocks batch changes when a non-terminal execution request targets the same batch", () => {
    const blockers = findBatchChangeRequestBlockers({
      batchId: "payment.daily-close",
      issueComments: [[]],
      issues: [executionIssue()],
      pullRequestComments: [],
      pullRequests: [],
    });

    expect(blockers).toEqual([
      expect.objectContaining({
        number: 34,
        requestId: "btr-20260509010203-payment.daily-close-abcdef12",
        status: "REQUESTED",
        type: "execution-request",
      }),
    ]);
  });

  it("allows changes after the execution request reaches a terminal dispatched state", () => {
    const blockers = findBatchChangeRequestBlockers({
      batchId: "payment.daily-close",
      issueComments: [[approvalComment, dispatcherComment]],
      issues: [executionIssue()],
      pullRequestComments: [],
      pullRequests: [],
    });

    expect(blockers).toEqual([]);
  });
});

function governedChangePullRequest(): RepositoryPullRequest {
  return {
    author: "developer",
    base: "main",
    body: [
      "## BatchPlane Registration",
      "",
      "- Request type: CHANGE",
      "- Batch ID: `payment.daily-close`",
      "- Name: Daily Close",
      "- Owner: ops-team",
      "- Domain: payments",
      "- Environment: PROD",
      "- Criticality: HIGH",
      "- Workflow: `.github/workflows/payment.daily-close.yml`",
      "- Runs on: ubuntu-latest",
      "- BatchPlane Gate: required",
    ].join("\n"),
    head: "batchplane/change/payment.daily-close-20260509010203",
    merged: false,
    number: 12,
    state: "open",
    title: "Change batch payment.daily-close",
    url: "https://github.com/always0ne/batch/pull/12",
  };
}

function executionIssue(): RepositoryIssue {
  return {
    author: "developer",
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
            expiresAt: "2026-05-09T02:02:03.000Z",
            reason: "Close payments after reconciliation.",
            requestedAt: "2026-05-09T01:02:03.000Z",
            requestedBy: "developer",
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
    createdAt: "2026-05-09T01:02:03.000Z",
    isPullRequest: false,
    labels: [],
    number: 34,
    state: "open",
    title: "Run batch payment.daily-close",
    updatedAt: "2026-05-09T01:02:03.000Z",
    url: "https://github.com/always0ne/batch/issues/34",
  };
}

const registrationRejectionComment: RepositoryIssueComment = {
  author: "maintainer",
  body: [
    "## BatchPlane Governed Change Approval",
    "",
    "- Decision: REJECTED",
    "- Rejector: @maintainer",
    "- Rejected at: 2026-05-09T03:02:03.000Z",
    "- Pull request: #12",
  ].join("\n"),
  createdAt: "2026-05-09T03:02:03.000Z",
  id: 1,
  issueNumber: 12,
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
  id: 2,
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
  id: 3,
  issueNumber: 34,
};
