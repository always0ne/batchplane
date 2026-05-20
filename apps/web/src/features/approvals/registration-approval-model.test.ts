import { describe, expect, it } from "vitest";

import type {
  RepositoryIssueComment,
  RepositoryPullRequest,
} from "@batchtrail/domain";

import {
  deriveRegistrationFilePaths,
  deriveRegistrationReviewState,
  parseRegistrationApprovalDecision,
  parseRegistrationRequestSummary,
} from "./registration-approval-model";

const pullRequest: RepositoryPullRequest = {
  author: "developer",
  base: "main",
  body: [
    "## BatchTrail Registration",
    "",
    "- Batch ID: `payment.daily-close`",
    "- Name: Daily Close",
    "- Environment: PROD",
    "- Criticality: HIGH",
    "- Workflow: `.github/workflows/payment.daily-close.yml`",
    "- Runtime: GitHub Actions / BatchTrail Repo Mode",
    "- Runs on: ubuntu-latest",
    "- BatchTrail Gate: required",
    "- Execution file: `.batch-governance/batches/payment.daily-close/artifacts/run.sh`",
    "",
    "### Batch command",
    "",
    "```sh",
    "./.batch-governance/batches/payment.daily-close/artifacts/run.sh",
    "```",
  ].join("\n"),
  head: "batchtrail/register/payment.daily-close-20260514010203",
  merged: false,
  number: 12,
  state: "open",
  title: "Register batch payment.daily-close",
  url: "https://github.com/always0ne/batch/pull/12",
};

describe("registration approval model", () => {
  it("parses registration request evidence from pull request body", () => {
    expect(parseRegistrationRequestSummary(pullRequest)).toEqual({
      batchCommand:
        "./.batch-governance/batches/payment.daily-close/artifacts/run.sh",
      batchId: "payment.daily-close",
      criticality: "HIGH",
      environment: "PROD",
      executionFilePath:
        ".batch-governance/batches/payment.daily-close/artifacts/run.sh",
      gateRequired: true,
      runsOn: "ubuntu-latest",
      workflowPath: ".github/workflows/payment.daily-close.yml",
    });
  });

  it("derives governed file paths from parsed summary", () => {
    const summary = parseRegistrationRequestSummary(pullRequest);

    expect(deriveRegistrationFilePaths(summary)).toEqual([
      ".batch-governance/batches/payment.daily-close.yml",
      ".github/workflows/payment.daily-close.yml",
      ".batch-governance/batches/payment.daily-close/artifacts/run.sh",
    ]);
  });

  it("parses latest registration decision and review state", () => {
    const comments: RepositoryIssueComment[] = [
      {
        author: "maintainer",
        body: [
          "## BatchTrail Registration Approval",
          "",
          "- Decision: APPROVED",
          "- Approver: @maintainer",
          "- Approved at: 2026-05-21T01:12:00.000Z",
          "- Pull request: #12",
        ].join("\n"),
        createdAt: "2026-05-21T01:12:00.000Z",
        id: 1,
        issueNumber: 12,
      },
    ];

    expect(parseRegistrationApprovalDecision(comments)).toEqual({
      actor: "maintainer",
      commentId: 1,
      decidedAt: "2026-05-21T01:12:00.000Z",
      decision: "APPROVED",
    });
    expect(
      deriveRegistrationReviewState(
        pullRequest,
        parseRegistrationApprovalDecision(comments),
      ),
    ).toBe("APPROVED_PENDING_MERGE");
    expect(
      deriveRegistrationReviewState({ ...pullRequest, merged: true }, null),
    ).toBe("MERGED");
  });
});
