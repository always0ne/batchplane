import { describe, expect, it } from "vitest";

import {
  buildFailureFollowUpComment,
  parseFailureFollowUps,
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
        runId: "205",
        status: "RESOLVED",
      },
    ]);
  });
});
