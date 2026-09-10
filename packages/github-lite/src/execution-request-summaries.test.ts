import { describe, expect, it } from "vitest";

import { listRecentExecutionRequestSummaries } from "./execution-request-summaries.js";
import {
  createGitHubLiteMockState,
  createMockGitHubLiteClient,
} from "./index.js";

const repository = { owner: "always0ne", repo: "batch" };

describe("recent execution request summaries", () => {
  it("projects matching approval, dispatcher, and Gate evidence beyond the immutable request marker", async () => {
    const state = createGitHubLiteMockState();
    const selectedIssueNumbers = new Set([102, 104, 108]);
    state.issues = state.issues
      .filter((issue) => selectedIssueNumbers.has(issue.number))
      .map((issue) => ({ ...issue, labels: ["batchplane:execution-request"] }));
    state.issueComments = state.issueComments.filter((comment) =>
      selectedIssueNumbers.has(comment.issueNumber),
    );
    state.issueComments.push({
      author: "github-actions[bot]",
      body: [
        "<!-- batchplane:gate-decision",
        "allowed=false",
        "requestId=unrelated-request",
        "batchId=payment.daily-close",
        "requestDigest=sha256:unrelated",
        "-->",
      ].join("\n"),
      createdAt: "2999-01-01T00:00:00.000Z",
      id: 9999,
      issueNumber: 104,
    });
    const client = createMockGitHubLiteClient(state);

    const summaries = await listRecentExecutionRequestSummaries(
      client,
      repository,
      "payment.daily-close",
    );

    expect(
      summaries.map(({ locator, status }) => ({ locator, status })),
    ).toEqual([
      { locator: "108", status: "GATE_BLOCKED" },
      { locator: "104", status: "DISPATCHED" },
      { locator: "102", status: "APPROVED" },
    ]);
    expect(
      state.issues.every((issue) => issue.body.includes("status=REQUESTED")),
    ).toBe(true);
  });
});
