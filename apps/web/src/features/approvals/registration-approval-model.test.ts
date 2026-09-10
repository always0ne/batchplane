import { describe, expect, it } from "vitest";

import type {
  RepositoryIssueComment,
  RepositoryPullRequest,
} from "@batchplane/domain";

import {
  deriveRegistrationFilePaths,
  deriveRegistrationReviewState,
  isOpenRegistrationReview,
  parseRegistrationApprovalDecision,
  parseRegistrationRequestSummary,
} from "./registration-approval-model";

const pullRequest: RepositoryPullRequest = {
  author: "developer",
  base: "main",
  body: [
    "## BatchPlane Registration",
    "",
    "- Request type: REGISTER",
    "- Batch ID: `payment.daily-close`",
    "- Name: Daily Close",
    "- Owner: ops-team",
    "- Domain: payments",
    "- Environment: PROD",
    "- Criticality: HIGH",
    "- Workflow: `.github/workflows/payment.daily-close.yml`",
    "- Runtime: GitHub Actions / BatchPlane Lite",
    "- Runs on: ubuntu-latest",
    "- BatchPlane Gate: required",
    "- Execution file: `.batch-governance/batches/payment.daily-close/artifacts/run.sh`",
    "- Schedule count: 1",
    "- Schedule deletion count: 1",
    "",
    "### Batch command",
    "",
    "```sh",
    "./.batch-governance/batches/payment.daily-close/artifacts/run.sh",
    "```",
    "",
    "### Schedule definitions",
    "",
    "#### Schedule 1",
    "- Batch ID: `payment.daily-close`",
    "- Schedule ID: `payment.daily-close-daily`",
    "- Name: Daily settlement window",
    "- Cron: `0 5 * * *`",
    "- Timezone: `Asia/Seoul`",
    "- Generated scheduler cron: `0 20 * * *`",
    "- Enabled: true",
    "",
    "### Schedule deletions",
    "",
    "#### Deleted schedule 1",
    "- Batch ID: `payment.daily-close`",
    "- Schedule ID: `payment.daily-close-nightly`",
    "- Name: Nightly settlement fallback",
    "- Cron: `0 30 1 * * *`",
    "- Timezone: `Asia/Seoul`",
    "- Generated scheduler cron: `0 21 * * *`",
    "- Enabled: false",
  ].join("\n"),
  head: "batchplane/register/payment.daily-close-20260514010203",
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
      deletedSchedules: [
        {
          batchId: "payment.daily-close",
          cron: "0 30 1 * * *",
          enabled: false,
          generatedSchedulerCron: "0 21 * * *",
          name: "Nightly settlement fallback",
          scheduleId: "payment.daily-close-nightly",
          timezone: "Asia/Seoul",
        },
      ],
      domain: "payments",
      environment: "PROD",
      executionFilePath:
        ".batch-governance/batches/payment.daily-close/artifacts/run.sh",
      gateRequired: true,
      kind: "batch",
      name: "Daily Close",
      owner: "ops-team",
      requestType: "REGISTER",
      runsOn: "ubuntu-latest",
      schedules: [
        {
          batchId: "payment.daily-close",
          cron: "0 5 * * *",
          enabled: true,
          generatedSchedulerCron: "0 20 * * *",
          name: "Daily settlement window",
          scheduleId: "payment.daily-close-daily",
          timezone: "Asia/Seoul",
        },
      ],
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

  it("parses delete request evidence as an auditable deleted batch archive", () => {
    const deletePullRequest: RepositoryPullRequest = {
      ...pullRequest,
      body: [
        "## BatchPlane Deletion",
        "",
        "- Request type: DELETE",
        "- Batch ID: `payment.daily-close`",
        "- Name: Daily Close",
        "- Owner: ops-team",
        "- Domain: payments",
        "- Environment: PROD",
        "- Criticality: HIGH",
        "- Workflow: `.github/workflows/payment.daily-close.yml`",
        "- Runtime: GitHub Actions / BatchPlane Lite",
        "- Runs on: ubuntu-latest",
        "- BatchPlane Gate: required",
        "- Execution file: `.batch-governance/batches/payment.daily-close/artifacts/run.sh`",
        "- Schedule count: 1",
        "- Schedule deletion count: 1",
        "",
        "### Delete scope",
        "",
        "- Batch definition: `.batch-governance/batches/payment.daily-close.yml`",
        "- Workflow: `.github/workflows/payment.daily-close.yml`",
        "- Execution file: `.batch-governance/batches/payment.daily-close/artifacts/run.sh`",
        "",
        "### Batch command",
        "",
        "```sh",
        "./.batch-governance/batches/payment.daily-close/artifacts/run.sh",
        "```",
        "",
        "### Schedule deletions",
        "",
        "#### Deleted schedule 1",
        "- Batch ID: `payment.daily-close`",
        "- Schedule ID: `payment.daily-close-daily`",
        "- Name: Daily settlement window",
        "- Batch definition: `.batch-governance/batches/payment.daily-close.yml`",
        "- Cron: `0 5 * * *`",
        "- Timezone: `Asia/Seoul`",
        "- Generated scheduler cron: `0 20 * * *`",
        "- Enabled: true",
      ].join("\n"),
      head: "batchplane/delete/payment.daily-close-20260514010203",
      merged: true,
      state: "closed",
      title: "Delete batch payment.daily-close",
    };
    const summary = parseRegistrationRequestSummary(deletePullRequest);

    expect(summary).toEqual(
      expect.objectContaining({
        batchId: "payment.daily-close",
        domain: "payments",
        kind: "batch",
        owner: "ops-team",
        requestType: "DELETE",
        workflowPath: ".github/workflows/payment.daily-close.yml",
      }),
    );
    expect(summary.kind === "batch" ? summary.deletedSchedules : []).toEqual([
      expect.objectContaining({
        scheduleId: "payment.daily-close-daily",
      }),
    ]);
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
          "## BatchPlane Governed Change Approval",
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
    expect(isOpenRegistrationReview(pullRequest, comments)).toBe(false);
    const approvedComment = comments[0];
    if (!approvedComment) throw new Error("Expected approval comment.");
    const rejectedDecision = parseRegistrationApprovalDecision([
      {
        ...approvedComment,
        body: approvedComment.body.replace("APPROVED", "REJECTED"),
      },
    ]);
    expect(deriveRegistrationReviewState(pullRequest, rejectedDecision)).toBe(
      "OPEN",
    );
    expect(
      isOpenRegistrationReview(pullRequest, [
        {
          ...approvedComment,
          body: approvedComment.body.replace("APPROVED", "REJECTED"),
        },
      ]),
    ).toBe(true);
    expect(isOpenRegistrationReview(pullRequest, [])).toBe(true);
  });
});
