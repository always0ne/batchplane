import type {
  RepositoryIssue,
  RepositoryPullRequest,
} from "@batchtrail/domain";
import { describe, expect, it } from "vitest";

import {
  buildExecutionApprovalHandoff,
  buildRegistrationApprovalHandoff,
  mergeExecutionApprovalRequests,
  mergeRegistrationApprovalRequests,
  normalizeApprovalHandoff,
  removeExecutionApprovalHandoff,
  removeRegistrationApprovalHandoff,
} from "./approval-handoff";
import { parseExecutionApprovalRequest } from "./approval-model";

const registrationPullRequest: RepositoryPullRequest = {
  author: "developer",
  base: "main",
  body: "body",
  head: "batchtrail/register/payment.daily-close-20260509010203",
  merged: false,
  number: 12,
  state: "open",
  title: "Register batch payment.daily-close",
  url: "https://github.com/always0ne/batch/pull/12",
};

const executionIssue: RepositoryIssue = {
  author: "developer",
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
  isPullRequest: false,
  labels: [],
  number: 34,
  state: "open",
  title: "Run batch payment.daily-close",
  url: "https://github.com/always0ne/batch/issues/34",
};

describe("approval handoff", () => {
  it("normalizes route state created after request creation", () => {
    expect(
      normalizeApprovalHandoff(
        buildRegistrationApprovalHandoff(registrationPullRequest),
      ),
    ).toEqual({
      executionIssues: [],
      registrationRequests: [registrationPullRequest],
    });
    expect(
      normalizeApprovalHandoff(buildExecutionApprovalHandoff(executionIssue)),
    ).toEqual({
      executionIssues: [executionIssue],
      registrationRequests: [],
    });
  });

  it("prepends handoff registration PRs before listed PRs without duplicating", () => {
    expect(
      mergeRegistrationApprovalRequests(
        [{ ...registrationPullRequest, author: "listed" }],
        [registrationPullRequest],
      ),
    ).toEqual([registrationPullRequest]);
    expect(
      mergeRegistrationApprovalRequests(
        [],
        [
          {
            ...registrationPullRequest,
            head: "feature/not-registration",
            title: "Feature request",
          },
        ],
      ),
    ).toEqual([]);
  });

  it("prepends handoff execution Issues before listed Issues without duplicating", () => {
    const listedRequest = parseExecutionApprovalRequest({
      ...executionIssue,
      author: "listed",
    });

    expect(listedRequest).not.toBeNull();

    if (!listedRequest) {
      return;
    }

    expect(
      mergeExecutionApprovalRequests([listedRequest], [executionIssue]),
    ).toEqual([parseExecutionApprovalRequest(executionIssue)]);
  });

  it("removes handoff entries after approval actions", () => {
    const handoff = {
      executionIssues: [executionIssue],
      registrationRequests: [registrationPullRequest],
    };

    expect(removeRegistrationApprovalHandoff(handoff, 12)).toEqual({
      executionIssues: [executionIssue],
      registrationRequests: [],
    });
    expect(removeExecutionApprovalHandoff(handoff, 34)).toEqual({
      executionIssues: [],
      registrationRequests: [registrationPullRequest],
    });
  });
});
