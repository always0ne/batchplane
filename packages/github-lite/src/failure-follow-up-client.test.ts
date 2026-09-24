import { describe, expect, it } from "vitest";
import { createGitHubLiteMockState } from "./mock-state.js";
import { createMockGitHubLiteClient } from "./mock-client.js";
const session = { owner: "always0ne", repo: "batch" };
import { createGitHubLiteAuditClient } from "./execution-audit-client.js";
import { createGitHubLiteExecutionRunClient } from "./execution-run-client.js";
import { createGitHubLiteFailureFollowUpClient } from "./failure-follow-up-client.js";
import {
  buildFailureFollowUpComment,
  buildFailureFollowUpReviewComment,
} from "./failure-follow-up-records.js";
describe("GitHub failure follow-up evidence and review", () => {
  it("records failure follow-up evidence on the correlated execution request", async () => {
    const state = createGitHubLiteMockState();
    const client = createMockGitHubLiteClient(state);
    const context = { client: client, repositoryRef: session };
    const runClient = createGitHubLiteExecutionRunClient(context);
    const followUpClient = createGitHubLiteFailureFollowUpClient(context);
    const run = state.workflowRuns.find(
      (candidate) =>
        candidate.batchId === "payment.daily-close" &&
        candidate.conclusion === "failure",
    );

    if (!run) {
      throw new Error("Expected a business failed workflow run fixture.");
    }

    const followUp = await followUpClient.createFailureFollowUp({
      actionTaken: "Reprocessed after upstream correction.",
      explanation: "The upstream ledger file arrived late.",
      owner: "ops-team",
      runId: String(run.id),
      status: "RESOLVED",
    });
    const scenario = client.state.executionScenarios.find(
      (candidate) => candidate.workflowRunId === run.id,
    );

    expect(followUp).toEqual(
      expect.objectContaining({
        actionTaken: "Reprocessed after upstream correction.",
        batchId: "payment.daily-close",
        explanation: "The upstream ledger file arrived late.",
        owner: "ops-team",
        requestId: run.requestId,
        reviewStatus: "AWAITING_REVIEW",
        reviews: [],
        runId: String(run.id),
        status: "RESOLVED",
      }),
    );
    expect(
      client.state.issueComments.some(
        (comment) =>
          comment.issueNumber === scenario?.issueNumber &&
          comment.body.includes("batchplane:failure-follow-up") &&
          comment.body.includes("The upstream ledger file arrived late."),
      ),
    ).toBe(true);

    await expect(
      runClient.getExecutionRun({ runId: String(run.id) }),
    ).resolves.toEqual(
      expect.objectContaining({
        failureFollowUps: [
          expect.objectContaining({
            explanation: "The upstream ledger file arrived late.",
            reviewStatus: "AWAITING_REVIEW",
            status: "RESOLVED",
          }),
        ],
      }),
    );
  });

  it("returns self-review-blocked capability immediately for a manager-authored follow-up", async () => {
    const state = createGitHubLiteMockState();
    const client = createMockGitHubLiteClient(state);
    const context = { client: client, repositoryRef: session };
    const followUpClient = createGitHubLiteFailureFollowUpClient(context);
    const run = state.workflowRuns.find(
      (candidate) => candidate.conclusion === "failure",
    );

    if (!run) {
      throw new Error("Expected a business failed workflow run fixture.");
    }

    await expect(
      followUpClient.createFailureFollowUp({
        actionTaken: "Recorded evidence as the manager.",
        explanation: "The manager authored this follow-up.",
        owner: "ops-team",
        runId: String(run.id),
        status: "RESOLVED",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        reviewCapability: {
          canReview: false,
          unavailableReason: "SELF_REVIEW_BLOCKED",
        },
      }),
    );
  });

  it("returns non-manager capability immediately after a follow-up is recorded", async () => {
    const state = createGitHubLiteMockState({
      currentUser: { login: "developer" },
      repositoryPermissions: [
        {
          permission: "read",
          roleName: "read",
          username: "developer",
        },
      ],
    });
    const client = createMockGitHubLiteClient(state);
    const context = { client: client, repositoryRef: session };
    const followUpClient = createGitHubLiteFailureFollowUpClient(context);
    const run = state.workflowRuns.find(
      (candidate) => candidate.conclusion === "failure",
    );

    if (!run) {
      throw new Error("Expected a business failed workflow run fixture.");
    }

    await expect(
      followUpClient.createFailureFollowUp({
        actionTaken: "Recorded evidence as an operator.",
        explanation: "The operator authored this follow-up.",
        owner: "ops-team",
        runId: String(run.id),
        status: "RESOLVED",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        reviewCapability: {
          canReview: false,
          unavailableReason: "NOT_WORKSPACE_MANAGER",
        },
      }),
    );
  });

  it("rejects a follow-up write when GitHub does not return verifiable evidence", async () => {
    const state = createGitHubLiteMockState();
    const client = createMockGitHubLiteClient(state);
    const context = { client: client, repositoryRef: session };
    const followUpClient = createGitHubLiteFailureFollowUpClient(context);
    const run = state.workflowRuns.find(
      (candidate) => candidate.conclusion === "failure",
    );

    if (!run) {
      throw new Error("Expected a business failed workflow run fixture.");
    }

    const createIssueComment = client.createIssueComment.bind(client);
    client.createIssueComment = async (params) => ({
      ...(await createIssueComment(params)),
      body: "GitHub returned an incomplete follow-up comment body.",
    });

    await expect(
      followUpClient.createFailureFollowUp({
        actionTaken: "Attempted corrective action.",
        explanation: "Attempted explanation.",
        owner: "ops-team",
        runId: String(run.id),
        status: "RESOLVED",
      }),
    ).rejects.toThrow(
      "GitHub did not return verifiable failure follow-up evidence.",
    );
  });

  it("does not write follow-up evidence when Workspace policy loading fails", async () => {
    const state = createGitHubLiteMockState();
    const client = createMockGitHubLiteClient(state);
    const context = { client: client, repositoryRef: session };
    const followUpClient = createGitHubLiteFailureFollowUpClient(context);
    const run = state.workflowRuns.find(
      (candidate) => candidate.conclusion === "failure",
    );

    if (!run) {
      throw new Error("Expected a business failed workflow run fixture.");
    }

    let createIssueCommentCalls = 0;
    const getFile = client.getFile.bind(client);
    const createIssueComment = client.createIssueComment.bind(client);
    client.getFile = async (params) => {
      if (params.path === ".batch-governance/workspace.yml") {
        throw new Error("Workspace policy could not be loaded.");
      }

      return getFile(params);
    };
    client.createIssueComment = async (params) => {
      createIssueCommentCalls += 1;
      return createIssueComment(params);
    };

    await expect(
      followUpClient.createFailureFollowUp({
        actionTaken: "Attempted corrective action.",
        explanation: "Attempted explanation.",
        owner: "ops-team",
        runId: String(run.id),
        status: "RESOLVED",
      }),
    ).rejects.toThrow("Workspace policy could not be loaded.");

    expect(createIssueCommentCalls).toBe(0);
    expect(
      client.state.issueComments.some((comment) =>
        comment.body.includes("Attempted explanation."),
      ),
    ).toBe(false);
  });

  it("rejects blank follow-up fields before reading policy or writing evidence", async () => {
    const state = createGitHubLiteMockState();
    const client = createMockGitHubLiteClient(state);
    const context = { client: client, repositoryRef: session };
    const followUpClient = createGitHubLiteFailureFollowUpClient(context);
    const run = state.workflowRuns.find(
      (candidate) => candidate.conclusion === "failure",
    );

    if (!run) {
      throw new Error("Expected a business failed workflow run fixture.");
    }

    let workspacePolicyReads = 0;
    let createIssueCommentCalls = 0;
    const getFile = client.getFile.bind(client);
    const createIssueComment = client.createIssueComment.bind(client);
    client.getFile = async (params) => {
      if (params.path === ".batch-governance/workspace.yml") {
        workspacePolicyReads += 1;
      }

      return getFile(params);
    };
    client.createIssueComment = async (params) => {
      createIssueCommentCalls += 1;
      return createIssueComment(params);
    };

    for (const fields of [
      {
        actionTaken: "   ",
        explanation: "The upstream ledger file arrived late.",
        owner: "ops-team",
      },
      {
        actionTaken: "Reprocessed after upstream correction.",
        explanation: "   ",
        owner: "ops-team",
      },
      {
        actionTaken: "Reprocessed after upstream correction.",
        explanation: "The upstream ledger file arrived late.",
        owner: "   ",
      },
    ]) {
      await expect(
        followUpClient.createFailureFollowUp({
          ...fields,
          runId: String(run.id),
          status: "RESOLVED",
        }),
      ).rejects.toThrow(
        "Failure follow-up explanation, action taken, and owner are required.",
      );
    }

    expect(workspacePolicyReads).toBe(0);
    expect(createIssueCommentCalls).toBe(0);
  });

  it("persists normalized follow-up fields", async () => {
    const state = createGitHubLiteMockState();
    const client = createMockGitHubLiteClient(state);
    const context = { client: client, repositoryRef: session };
    const followUpClient = createGitHubLiteFailureFollowUpClient(context);
    const run = state.workflowRuns.find(
      (candidate) => candidate.conclusion === "failure",
    );

    if (!run) {
      throw new Error("Expected a business failed workflow run fixture.");
    }

    await expect(
      followUpClient.createFailureFollowUp({
        actionTaken: "  Reprocessed after upstream correction.  ",
        explanation: "  The upstream ledger file arrived late.  ",
        owner: "  ops-team  ",
        runId: String(run.id),
        status: "RESOLVED",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        actionTaken: "Reprocessed after upstream correction.",
        explanation: "The upstream ledger file arrived late.",
        owner: "ops-team",
      }),
    );
  });

  it("records Workspace manager review evidence for failure follow-up", async () => {
    const state = createGitHubLiteMockState();
    const client = createMockGitHubLiteClient(state);
    const context = { client: client, repositoryRef: session };
    const runClient = createGitHubLiteExecutionRunClient(context);
    const followUpClient = createGitHubLiteFailureFollowUpClient(context);
    const auditClient = createGitHubLiteAuditClient(context);
    const run = state.workflowRuns.find(
      (candidate) =>
        candidate.batchId === "payment.daily-close" &&
        candidate.conclusion === "failure",
    );

    if (!run) {
      throw new Error("Expected a business failed workflow run fixture.");
    }

    client.state.currentUser = { login: "developer" };
    const followUp = await followUpClient.createFailureFollowUp({
      actionTaken: "Reprocessed after upstream correction.",
      explanation: "The upstream ledger file arrived late.",
      owner: "ops-team",
      runId: String(run.id),
      status: "RESOLVED",
    });

    client.state.currentUser = { login: "maintainer" };
    const review = await followUpClient.reviewFailureFollowUp({
      decision: "APPROVED",
      followUpId: followUp.followUpId,
      reason: "Evidence and corrective action are sufficient.",
      runId: String(run.id),
    });

    expect(review).toEqual(
      expect.objectContaining({
        approvalMode: "SELF_APPROVAL_BLOCKED",
        decision: "APPROVED",
        followUpId: followUp.followUpId,
        reason: "Evidence and corrective action are sufficient.",
        reviewer: "maintainer",
        selfReview: false,
      }),
    );
    expect(
      client.state.issueComments.some(
        (comment) =>
          comment.body.includes("batchplane:failure-follow-up-review") &&
          comment.body.includes("Decision: APPROVED"),
      ),
    ).toBe(true);

    await expect(
      runClient.getExecutionRun({ runId: String(run.id) }),
    ).resolves.toEqual(
      expect.objectContaining({
        failureFollowUps: [
          expect.objectContaining({
            reviewStatus: "APPROVED",
            reviews: [expect.objectContaining({ decision: "APPROVED" })],
          }),
        ],
      }),
    );

    await expect(
      auditClient.listAuditTimeline({ limit: 100 }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metadata: expect.objectContaining({
            followUpId: followUp.followUpId,
            reviewStatus: "APPROVED",
          }),
          type: "FAILURE_FOLLOW_UP_RECORDED",
        }),
        expect.objectContaining({
          metadata: expect.objectContaining({
            decision: "APPROVED",
            followUpId: followUp.followUpId,
          }),
          type: "FAILURE_FOLLOW_UP_REVIEWED",
        }),
      ]),
    );
  });

  it("persists a review against the selected follow-up when a request has multiple records", async () => {
    const state = createGitHubLiteMockState();
    const client = createMockGitHubLiteClient(state);
    const context = { client: client, repositoryRef: session };
    const runClient = createGitHubLiteExecutionRunClient(context);
    const followUpClient = createGitHubLiteFailureFollowUpClient(context);
    const run = state.workflowRuns.find(
      (candidate) => candidate.conclusion === "failure",
    );

    if (!run) {
      throw new Error("Expected a business failed workflow run fixture.");
    }

    client.state.currentUser = { login: "developer" };
    await followUpClient.createFailureFollowUp({
      actionTaken: "Recorded the initial incident details.",
      explanation: "Initial follow-up for the failed run.",
      owner: "ops-team",
      runId: String(run.id),
      status: "INVESTIGATING",
    });
    const secondFollowUp = await followUpClient.createFailureFollowUp({
      actionTaken: "Reprocessed after upstream correction.",
      explanation: "A revised follow-up for the same failed run.",
      owner: "ops-team",
      runId: String(run.id),
      status: "RESOLVED",
    });

    client.state.currentUser = { login: "maintainer" };
    await expect(
      followUpClient.reviewFailureFollowUp({
        decision: "APPROVED",
        followUpId: secondFollowUp.followUpId,
        reason: "The revised evidence is sufficient.",
        runId: String(run.id),
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        followUpId: secondFollowUp.followUpId,
        reason: "The revised evidence is sufficient.",
      }),
    );

    const projectedRun = await runClient.getExecutionRun({
      runId: String(run.id),
    });
    expect(
      projectedRun?.failureFollowUps?.find(
        (followUp) => followUp.followUpId === secondFollowUp.followUpId,
      ),
    ).toEqual(
      expect.objectContaining({
        reviewStatus: "APPROVED",
        reviews: [expect.objectContaining({ decision: "APPROVED" })],
      }),
    );
  });

  it("blocks self-review for failure follow-up by default", async () => {
    const state = createGitHubLiteMockState();
    const client = createMockGitHubLiteClient(state);
    const context = { client: client, repositoryRef: session };
    const followUpClient = createGitHubLiteFailureFollowUpClient(context);
    const run = state.workflowRuns.find(
      (candidate) =>
        candidate.batchId === "payment.daily-close" &&
        candidate.conclusion === "failure",
    );

    if (!run) {
      throw new Error("Expected a business failed workflow run fixture.");
    }

    const followUp = await followUpClient.createFailureFollowUp({
      actionTaken: "Reprocessed after upstream correction.",
      explanation: "The upstream ledger file arrived late.",
      owner: "ops-team",
      runId: String(run.id),
      status: "RESOLVED",
    });

    await expect(
      followUpClient.reviewFailureFollowUp({
        decision: "APPROVED",
        followUpId: followUp.followUpId,
        reason: "Evidence is sufficient.",
        runId: String(run.id),
      }),
    ).rejects.toThrow(
      "Self-review is blocked by the Workspace approval policy.",
    );
  });

  it("allows a manager to manually self-review under the explicit policy", async () => {
    const state = createGitHubLiteMockState();
    state.files.push({
      branch: "main",
      content: [
        'apiVersion: "batchplane.io/v1"',
        'kind: "WorkspacePolicy"',
        "metadata:",
        '  id: "default"',
        "spec:",
        "  approval:",
        '    mode: "SELF_APPROVAL_ALLOWED"',
        "",
      ].join("\n"),
      path: ".batch-governance/workspace.yml",
      sha: "self-review-allowed-policy-sha",
    });
    const client = createMockGitHubLiteClient(state);
    const context = { client: client, repositoryRef: session };
    const runClient = createGitHubLiteExecutionRunClient(context);
    const followUpClient = createGitHubLiteFailureFollowUpClient(context);
    const auditClient = createGitHubLiteAuditClient(context);
    const run = state.workflowRuns.find(
      (candidate) => candidate.conclusion === "failure",
    );

    if (!run) {
      throw new Error("Expected a business failed workflow run fixture.");
    }

    const followUp = await followUpClient.createFailureFollowUp({
      actionTaken: "Reprocessed after upstream correction.",
      explanation: "The upstream ledger file arrived late.",
      owner: "ops-team",
      runId: String(run.id),
      status: "RESOLVED",
    });
    const review = await followUpClient.reviewFailureFollowUp({
      decision: "APPROVED",
      followUpId: followUp.followUpId,
      reason: "The evidence and corrective action are sufficient.",
      runId: String(run.id),
    });

    expect(review).toEqual(
      expect.objectContaining({
        approvalMode: "SELF_APPROVAL_ALLOWED",
        selfReview: true,
      }),
    );
    await expect(
      runClient.getExecutionRun({ runId: String(run.id) }),
    ).resolves.toEqual(
      expect.objectContaining({
        failureFollowUps: [
          expect.objectContaining({
            reviewStatus: "APPROVED",
            reviews: [
              expect.objectContaining({
                approvalMode: "SELF_APPROVAL_ALLOWED",
                selfReview: true,
              }),
            ],
          }),
        ],
      }),
    );
    await expect(
      auditClient.listAuditTimeline({ limit: 100 }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metadata: expect.objectContaining({
            approvalMode: "SELF_APPROVAL_ALLOWED",
            followUpId: followUp.followUpId,
            selfReview: true,
          }),
          type: "FAILURE_FOLLOW_UP_REVIEWED",
        }),
      ]),
    );
  });

  it("rejects a non-manager and a whitespace-only failure follow-up review", async () => {
    const state = createGitHubLiteMockState();
    const client = createMockGitHubLiteClient(state);
    const context = { client: client, repositoryRef: session };
    const followUpClient = createGitHubLiteFailureFollowUpClient(context);
    const run = state.workflowRuns.find(
      (candidate) => candidate.conclusion === "failure",
    );

    if (!run) {
      throw new Error("Expected a business failed workflow run fixture.");
    }

    client.state.currentUser = { login: "developer" };
    const followUp = await followUpClient.createFailureFollowUp({
      actionTaken: "Reprocessed after upstream correction.",
      explanation: "The upstream ledger file arrived late.",
      owner: "ops-team",
      runId: String(run.id),
      status: "RESOLVED",
    });

    await expect(
      followUpClient.reviewFailureFollowUp({
        decision: "APPROVED",
        followUpId: followUp.followUpId,
        reason: "Evidence is sufficient.",
        runId: String(run.id),
      }),
    ).rejects.toThrow("Workspace manager permission is required");

    client.state.currentUser = { login: "maintainer" };
    await expect(
      followUpClient.reviewFailureFollowUp({
        decision: "APPROVED",
        followUpId: followUp.followUpId,
        reason: "   ",
        runId: String(run.id),
      }),
    ).rejects.toThrow("A review reason is required.");
  });

  it("keeps the first terminal manager review and rejects a second decision", async () => {
    const state = createGitHubLiteMockState();
    const client = createMockGitHubLiteClient(state);
    const context = { client: client, repositoryRef: session };
    const followUpClient = createGitHubLiteFailureFollowUpClient(context);
    const run = state.workflowRuns.find(
      (candidate) => candidate.conclusion === "failure",
    );

    if (!run) {
      throw new Error("Expected a business failed workflow run fixture.");
    }

    client.state.currentUser = { login: "developer" };
    const followUp = await followUpClient.createFailureFollowUp({
      actionTaken: "Reprocessed after upstream correction.",
      explanation: "The upstream ledger file arrived late.",
      owner: "ops-team",
      runId: String(run.id),
      status: "RESOLVED",
    });
    client.state.currentUser = { login: "maintainer" };

    await followUpClient.reviewFailureFollowUp({
      decision: "APPROVED",
      followUpId: followUp.followUpId,
      reason: "Evidence is sufficient.",
      runId: String(run.id),
    });

    await expect(
      followUpClient.reviewFailureFollowUp({
        decision: "REJECTED",
        followUpId: followUp.followUpId,
        reason: "A stale second decision.",
        runId: String(run.id),
      }),
    ).rejects.toThrow(
      "Failure follow-up has already received a review decision.",
    );
  });

  it("excludes forged or non-manager review markers from run projection and audit", async () => {
    const state = createGitHubLiteMockState();
    const client = createMockGitHubLiteClient(state);
    const context = { client: client, repositoryRef: session };
    const runClient = createGitHubLiteExecutionRunClient(context);
    const followUpClient = createGitHubLiteFailureFollowUpClient(context);
    const auditClient = createGitHubLiteAuditClient(context);
    const run = state.workflowRuns.find(
      (candidate) => candidate.conclusion === "failure",
    );

    if (!run) {
      throw new Error("Expected a business failed workflow run fixture.");
    }

    client.state.currentUser = { login: "developer" };
    const followUp = await followUpClient.createFailureFollowUp({
      actionTaken: "Reprocessed after upstream correction.",
      explanation: "The upstream ledger file arrived late.",
      owner: "ops-team",
      runId: String(run.id),
      status: "RESOLVED",
    });
    const requestIssue = state.issues.find((issue) =>
      issue.body.includes(followUp.requestId),
    );

    if (!requestIssue) {
      throw new Error("Expected correlated execution request issue.");
    }

    state.issueComments.push({
      author: "developer",
      body: buildFailureFollowUpReviewComment({
        batchId: followUp.batchId,
        decision: "APPROVED",
        followUpId: followUp.followUpId,
        reason: "Forged non-manager review.",
        requestId: followUp.requestId,
        reviewedAt: "2026-05-14T02:00:00.000Z",
        reviewer: "developer",
        reviewId: "ffur-forged-non-manager",
        runId: followUp.runId,
        selfReview: false,
      }),
      createdAt: "2026-05-14T02:00:00.000Z",
      id: 99901,
      issueNumber: requestIssue.number,
    });
    state.issueComments.push({
      author: "maintainer",
      body: buildFailureFollowUpReviewComment({
        batchId: followUp.batchId,
        decision: "APPROVED",
        followUpId: followUp.followUpId,
        reason: "Forged reviewer mismatch.",
        requestId: followUp.requestId,
        reviewedAt: "2026-05-14T02:01:00.000Z",
        reviewer: "developer",
        reviewId: "ffur-forged-mismatch",
        runId: followUp.runId,
        selfReview: false,
      }),
      createdAt: "2026-05-14T02:01:00.000Z",
      id: 99902,
      issueNumber: requestIssue.number,
    });

    client.state.currentUser = { login: "maintainer" };
    const projectedRun = await runClient.getExecutionRun({
      runId: String(run.id),
    });
    const audit = await auditClient.listAuditTimeline({ limit: 100 });

    expect(projectedRun?.failureFollowUps).toEqual([
      expect.objectContaining({
        followUpId: followUp.followUpId,
        reviewStatus: "AWAITING_REVIEW",
        reviews: [],
      }),
    ]);
    expect(
      audit.some((item) => item.type === "FAILURE_FOLLOW_UP_REVIEWED"),
    ).toBe(false);
  });

  it("keeps the first duplicate follow-up authoritative and blocks its direct self-review", async () => {
    const state = createGitHubLiteMockState();
    const client = createMockGitHubLiteClient(state);
    const context = { client: client, repositoryRef: session };
    const runClient = createGitHubLiteExecutionRunClient(context);
    const followUpClient = createGitHubLiteFailureFollowUpClient(context);
    const auditClient = createGitHubLiteAuditClient(context);
    const run = state.workflowRuns.find(
      (candidate) => candidate.conclusion === "failure",
    );

    if (!run) {
      throw new Error("Expected a business failed workflow run fixture.");
    }

    const followUp = await followUpClient.createFailureFollowUp({
      actionTaken: "Recorded evidence as the manager.",
      explanation: "The manager authored the original follow-up.",
      owner: "ops-team",
      runId: String(run.id),
      status: "RESOLVED",
    });
    const requestIssue = state.issues.find((issue) =>
      issue.body.includes(followUp.requestId),
    );

    if (!requestIssue) {
      throw new Error("Expected correlated execution request issue.");
    }

    state.issueComments.push({
      author: "developer",
      body: buildFailureFollowUpComment({
        actionTaken: "Attempted to replace the original relation.",
        author: "developer",
        batchId: followUp.batchId,
        createdAt: "2026-05-14T01:59:00.000Z",
        explanation: "Duplicate marker with the same follow-up ID.",
        followUpId: followUp.followUpId,
        owner: "ops-team",
        requestId: followUp.requestId,
        reviewStatus: "AWAITING_REVIEW",
        reviews: [],
        runId: followUp.runId,
        status: "RESOLVED",
      }),
      createdAt: "2026-05-14T01:59:00.000Z",
      id: 99903,
      issueNumber: requestIssue.number,
    });
    state.issueComments.push({
      author: "maintainer",
      body: buildFailureFollowUpReviewComment({
        batchId: followUp.batchId,
        decision: "APPROVED",
        followUpId: followUp.followUpId,
        reason: "A direct self-review of the original record.",
        requestId: followUp.requestId,
        reviewedAt: "2026-05-14T02:00:00.000Z",
        reviewer: "maintainer",
        reviewId: "ffur-forged-self-review",
        runId: followUp.runId,
        selfReview: false,
      }),
      createdAt: "2026-05-14T02:00:00.000Z",
      id: 99903,
      issueNumber: requestIssue.number,
    });

    const projectedRun = await runClient.getExecutionRun({
      runId: String(run.id),
    });
    const audit = await auditClient.listAuditTimeline({ limit: 100 });

    expect(projectedRun?.failureFollowUps).toEqual([
      expect.objectContaining({
        author: "maintainer",
        followUpId: followUp.followUpId,
        reviewStatus: "AWAITING_REVIEW",
        reviews: [],
      }),
    ]);
    expect(
      audit.some(
        (item) =>
          item.type === "FAILURE_FOLLOW_UP_REVIEWED" &&
          item.metadata?.reviewId === "ffur-forged-self-review",
      ),
    ).toBe(false);
  });

  it("excludes follow-up markers whose request relation does not match the containing request", async () => {
    const state = createGitHubLiteMockState();
    const client = createMockGitHubLiteClient(state);
    const context = { client: client, repositoryRef: session };
    const runClient = createGitHubLiteExecutionRunClient(context);
    const auditClient = createGitHubLiteAuditClient(context);
    const run = state.workflowRuns.find(
      (candidate) => candidate.conclusion === "failure" && candidate.requestId,
    );

    if (!run?.requestId) {
      throw new Error(
        "Expected a correlated business failed workflow run fixture.",
      );
    }

    const requestIssue = state.issues.find((issue) =>
      issue.body.includes(run.requestId ?? ""),
    );

    if (!requestIssue) {
      throw new Error("Expected correlated execution request issue.");
    }

    state.issueComments.push({
      author: "developer",
      body: buildFailureFollowUpComment({
        actionTaken: "This must not project.",
        author: "developer",
        batchId: "forged.batch",
        createdAt: "2026-05-14T02:00:00.000Z",
        explanation: "The marker claims another execution request.",
        followUpId: "ffu-forged-request-relation",
        owner: "ops-team",
        requestId: "forged-request-id",
        reviewStatus: "AWAITING_REVIEW",
        reviews: [],
        runId: String(run.id),
        status: "RESOLVED",
      }),
      createdAt: "2026-05-14T02:00:00.000Z",
      id: 99904,
      issueNumber: requestIssue.number,
    });

    const projectedRun = await runClient.getExecutionRun({
      runId: String(run.id),
    });
    const audit = await auditClient.listAuditTimeline({ limit: 100 });

    expect(projectedRun?.failureFollowUps).toEqual([]);
    expect(
      audit.some(
        (item) => item.metadata?.followUpId === "ffu-forged-request-relation",
      ),
    ).toBe(false);
  });

  it("reuses one operation-scoped identity, policy, and permission lookup per request", async () => {
    const state = createGitHubLiteMockState();
    const client = createMockGitHubLiteClient(state);
    const context = { client: client, repositoryRef: session };
    const runClient = createGitHubLiteExecutionRunClient(context);
    const followUpClient = createGitHubLiteFailureFollowUpClient(context);
    const run = state.workflowRuns.find(
      (candidate) => candidate.conclusion === "failure",
    );

    if (!run) {
      throw new Error("Expected a business failed workflow run fixture.");
    }

    client.state.currentUser = { login: "developer" };
    const followUp = await followUpClient.createFailureFollowUp({
      actionTaken: "Reprocessed after upstream correction.",
      explanation: "The upstream ledger file arrived late.",
      owner: "ops-team",
      runId: String(run.id),
      status: "RESOLVED",
    });
    client.state.currentUser = { login: "maintainer" };
    await followUpClient.reviewFailureFollowUp({
      decision: "APPROVED",
      followUpId: followUp.followUpId,
      reason: "Evidence is sufficient.",
      runId: String(run.id),
    });
    client.state.workflowRuns.push({
      ...run,
      id: run.id + 1000,
      url: `${run.url}-duplicate`,
    });

    let currentUserCalls = 0;
    let policyFileCalls = 0;
    let permissionCalls = 0;
    const getCurrentUser = client.getCurrentUser.bind(client);
    const getFile = client.getFile.bind(client);
    const getRepositoryPermissionForUser =
      client.getRepositoryPermissionForUser.bind(client);

    client.getCurrentUser = async () => {
      currentUserCalls += 1;
      return getCurrentUser();
    };
    client.getFile = async (params) => {
      if (params.path === ".batch-governance/workspace.yml") {
        policyFileCalls += 1;
      }

      return getFile(params);
    };
    client.getRepositoryPermissionForUser = async (params) => {
      permissionCalls += 1;
      return getRepositoryPermissionForUser(params);
    };

    const runs = await runClient.listExecutionRuns({ limit: 100 });

    expect(runs).toHaveLength(client.state.workflowRuns.length);
    expect(currentUserCalls).toBe(1);
    expect(policyFileCalls).toBe(1);
    expect(permissionCalls).toBe(1);
  });

  it("avoids identity, policy, and permission lookups when no valid follow-up exists", async () => {
    const state = createGitHubLiteMockState();
    const client = createMockGitHubLiteClient(state);
    const context = { client: client, repositoryRef: session };
    const runClient = createGitHubLiteExecutionRunClient(context);
    let currentUserCalls = 0;
    let policyFileCalls = 0;
    let permissionCalls = 0;
    const getCurrentUser = client.getCurrentUser.bind(client);
    const getFile = client.getFile.bind(client);
    const getRepositoryPermissionForUser =
      client.getRepositoryPermissionForUser.bind(client);

    client.getCurrentUser = async () => {
      currentUserCalls += 1;
      return getCurrentUser();
    };
    client.getFile = async (params) => {
      if (params.path === ".batch-governance/workspace.yml") {
        policyFileCalls += 1;
      }

      return getFile(params);
    };
    client.getRepositoryPermissionForUser = async (params) => {
      permissionCalls += 1;
      return getRepositoryPermissionForUser(params);
    };

    await runClient.listExecutionRuns({ limit: 100 });

    expect(currentUserCalls).toBe(0);
    expect(policyFileCalls).toBe(0);
    expect(permissionCalls).toBe(0);
  });

  it("shares policy and reviewer permission lookups across review-bearing audit requests", async () => {
    const state = createGitHubLiteMockState();
    const client = createMockGitHubLiteClient(state);
    const context = { client: client, repositoryRef: session };
    const followUpClient = createGitHubLiteFailureFollowUpClient(context);
    const auditClient = createGitHubLiteAuditClient(context);
    const failedRuns = state.workflowRuns.filter(
      (candidate) => candidate.conclusion === "failure" && candidate.requestId,
    );
    const firstRun = failedRuns[0];
    const secondRun = failedRuns.find(
      (candidate) => candidate.requestId !== firstRun?.requestId,
    );

    if (!firstRun || !secondRun) {
      throw new Error("Expected failed runs for two execution requests.");
    }

    client.state.currentUser = { login: "developer" };
    const followUps = await Promise.all(
      [firstRun, secondRun].map((run) =>
        followUpClient.createFailureFollowUp({
          actionTaken: "Reprocessed after upstream correction.",
          explanation: "The upstream ledger file arrived late.",
          owner: "ops-team",
          runId: String(run.id),
          status: "RESOLVED",
        }),
      ),
    );
    client.state.currentUser = { login: "maintainer" };
    await Promise.all(
      followUps.map((followUp) =>
        followUpClient.reviewFailureFollowUp({
          decision: "APPROVED",
          followUpId: followUp.followUpId,
          reason: "Evidence is sufficient.",
          runId: followUp.runId,
        }),
      ),
    );

    let policyFileCalls = 0;
    let permissionCalls = 0;
    const getFile = client.getFile.bind(client);
    const getRepositoryPermissionForUser =
      client.getRepositoryPermissionForUser.bind(client);
    client.getFile = async (params) => {
      if (params.path === ".batch-governance/workspace.yml") {
        policyFileCalls += 1;
      }

      return getFile(params);
    };
    client.getRepositoryPermissionForUser = async (params) => {
      permissionCalls += 1;
      return getRepositoryPermissionForUser(params);
    };

    await auditClient.listAuditTimeline({ limit: 100 });

    expect(policyFileCalls).toBe(1);
    expect(permissionCalls).toBe(1);
  });

  it("rejects a review write when GitHub does not return verifiable evidence", async () => {
    const state = createGitHubLiteMockState();
    const client = createMockGitHubLiteClient(state);
    const context = { client: client, repositoryRef: session };
    const followUpClient = createGitHubLiteFailureFollowUpClient(context);
    const run = state.workflowRuns.find(
      (candidate) => candidate.conclusion === "failure",
    );

    if (!run) {
      throw new Error("Expected a business failed workflow run fixture.");
    }

    client.state.currentUser = { login: "developer" };
    const followUp = await followUpClient.createFailureFollowUp({
      actionTaken: "Reprocessed after upstream correction.",
      explanation: "The upstream ledger file arrived late.",
      owner: "ops-team",
      runId: String(run.id),
      status: "RESOLVED",
    });
    client.state.currentUser = { login: "maintainer" };
    const createIssueComment = client.createIssueComment.bind(client);
    client.createIssueComment = async (params) => ({
      ...(await createIssueComment(params)),
      body: "GitHub returned an incomplete comment body.",
    });

    await expect(
      followUpClient.reviewFailureFollowUp({
        decision: "APPROVED",
        followUpId: followUp.followUpId,
        reason: "Evidence is sufficient.",
        runId: String(run.id),
      }),
    ).rejects.toThrow(
      "GitHub did not return verifiable failure follow-up review evidence.",
    );
  });
});
