import { describe, expect, it } from "vitest";

import type { GitHubPullRequest } from "@batchtrail/github-lite";

import {
  buildRegistrationApprovalComment,
  buildRegistrationRejectionComment,
  isRegistrationApprovalRequest,
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
});
