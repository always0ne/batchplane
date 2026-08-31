import { describe, expect, it } from "vitest";

import {
  buildFailureFollowUpComment,
  buildFailureFollowUpReviewComment,
  parseFailureFollowUps,
  parseFailureFollowUpReviews,
} from "./failure-follow-up-model";

describe("failure follow-up model", () => {
  it("round-trips structured failure follow-up evidence", () => {
    const body = buildFailureFollowUpComment({
      actionTaken: "Reprocessed after upstream correction.",
      author: "operator",
      batchId: "payment.daily-close",
      createdAt: "2026-05-14T01:30:00.000Z",
      explanation: "The upstream ledger file arrived late.",
      followUpId: "ffu-205-abc12345",
      owner: "ops-team",
      requestId: "btr-20260514010500-payment.daily-close-00000005",
      reviewStatus: "AWAITING_REVIEW",
      reviews: [],
      runId: "205",
      status: "RESOLVED",
    });

    expect(
      parseFailureFollowUps([
        {
          author: "operator",
          body,
          createdAt: "2026-05-14T01:30:00.000Z",
          id: 1,
          issueNumber: 105,
        },
      ]),
    ).toEqual([
      {
        actionTaken: "Reprocessed after upstream correction.",
        author: "operator",
        batchId: "payment.daily-close",
        createdAt: "2026-05-14T01:30:00.000Z",
        explanation: "The upstream ledger file arrived late.",
        followUpId: "ffu-205-abc12345",
        owner: "ops-team",
        requestId: "btr-20260514010500-payment.daily-close-00000005",
        reviewStatus: "AWAITING_REVIEW",
        reviews: [],
        runId: "205",
        status: "RESOLVED",
      },
    ]);
  });

  it("attaches structured review decisions to a follow-up", () => {
    const followUpBody = buildFailureFollowUpComment({
      actionTaken: "Reprocessed after upstream correction.",
      author: "operator",
      batchId: "payment.daily-close",
      createdAt: "2026-05-14T01:30:00.000Z",
      explanation: "The upstream ledger file arrived late.",
      followUpId: "ffu-205-abc12345",
      owner: "ops-team",
      requestId: "btr-20260514010500-payment.daily-close-00000005",
      reviewStatus: "AWAITING_REVIEW",
      reviews: [],
      runId: "205",
      status: "RESOLVED",
    });
    const reviewBody = buildFailureFollowUpReviewComment({
      approvalMode: "SELF_APPROVAL_BLOCKED",
      batchId: "payment.daily-close",
      decision: "APPROVED",
      followUpId: "ffu-205-abc12345",
      reason: "Evidence and corrective action are sufficient.",
      requestId: "btr-20260514010500-payment.daily-close-00000005",
      reviewedAt: "2026-05-14T01:40:00.000Z",
      reviewer: "maintainer",
      reviewId: "ffur-205-def67890",
      runId: "205",
      selfReview: false,
    });
    const comments = [
      {
        author: "operator",
        body: followUpBody,
        createdAt: "2026-05-14T01:30:00.000Z",
        id: 1,
        issueNumber: 105,
      },
      {
        author: "maintainer",
        body: reviewBody,
        createdAt: "2026-05-14T01:40:00.000Z",
        id: 2,
        issueNumber: 105,
      },
    ];

    expect(parseFailureFollowUpReviews(comments)).toEqual([
      expect.objectContaining({
        decision: "APPROVED",
        followUpId: "ffu-205-abc12345",
        reason: "Evidence and corrective action are sufficient.",
        reviewer: "maintainer",
      }),
    ]);
    expect(parseFailureFollowUps(comments)).toEqual([
      expect.objectContaining({
        followUpId: "ffu-205-abc12345",
        reviewStatus: "APPROVED",
        reviews: [
          expect.objectContaining({
            decision: "APPROVED",
            reviewId: "ffur-205-def67890",
          }),
        ],
      }),
    ]);
  });

  it("binds review identity and time to the GitHub comment and ignores a forged reviewer marker", () => {
    const body = buildFailureFollowUpReviewComment({
      batchId: "payment.daily-close",
      decision: "APPROVED",
      followUpId: "ffu-205-abc12345",
      reason: "Evidence is sufficient.",
      requestId: "btr-20260514010500-payment.daily-close-00000005",
      reviewedAt: "2026-05-14T01:40:00.000Z",
      reviewer: "maintainer",
      reviewId: "ffur-205-def67890",
      runId: "205",
      selfReview: false,
    });
    const forgedBody = body.replace(
      "reviewer=maintainer",
      "reviewer=developer",
    );

    expect(
      parseFailureFollowUpReviews([
        {
          author: "maintainer",
          body,
          createdAt: "2026-05-14T02:00:00.000Z",
          id: 1,
          issueNumber: 105,
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        reviewedAt: "2026-05-14T02:00:00.000Z",
        reviewer: "maintainer",
      }),
    ]);
    expect(
      parseFailureFollowUpReviews([
        {
          author: "maintainer",
          body: forgedBody,
          createdAt: "2026-05-14T02:00:00.000Z",
          id: 2,
          issueNumber: 105,
        },
      ]),
    ).toEqual([]);
  });
});
