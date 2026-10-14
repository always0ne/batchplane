import { describe, expect, it } from "vitest";
import { buildExecutionRequestIssue } from "@batchplane/github-lite";

import {
  dispatchApprovedExecutionRequest,
  isActionableApprovalComment,
  parseDispatcherCommand,
  parseDispatcherStatusEvidence,
  verifyDispatcherEvidence,
} from "./index";
import {
  buildDispatchedCommentBody,
  buildExecutionApprovalCommentBody,
  buildExecutionIssueBody,
  sharedChangeRequestId,
  sharedRequestDigest as requestDigest,
  sharedRequestId as requestId,
  sharedTargetRevisionDigest,
} from "../../../test/fixtures/execution-evidence";
const issueBody = buildExecutionIssueBody();
const approvalCommentBody = buildExecutionApprovalCommentBody();
const dispatchedCommentBody = buildDispatchedCommentBody();
const verifyApprovedBatchRevision = async () => ({
  approvedRevision: {
    governedChangeId: sharedChangeRequestId,
    targetRevisionDigest: sharedTargetRevisionDigest,
  },
  controlStatus: "VERIFIED" as const,
  verifiedSha: "approved-merge-sha",
});

describe("dispatcher verification", () => {
  it("accepts approval commands and ignores the retired retry-dispatch command", () => {
    expect(parseDispatcherCommand("/bgcp approve requestDigest=abc")).toBe(
      "approve",
    );
    expect(parseDispatcherCommand("/bgcp retry-dispatch requestId=abc")).toBe(
      "ignore",
    );
    expect(parseDispatcherCommand("looks good")).toBe("ignore");
  });

  it("treats only marker-backed approved comments as actionable approvals", () => {
    expect(isActionableApprovalComment(approvalCommentBody)).toBe(true);
    expect(
      isActionableApprovalComment("/bgcp approve requestDigest=sha256:abc"),
    ).toBe(false);
    expect(
      isActionableApprovalComment(
        approvalCommentBody.replace("decision=APPROVED", "decision=REJECTED"),
      ),
    ).toBe(false);
    expect(isActionableApprovalComment("looks good")).toBe(false);
  });

  it("parses dispatcher status evidence", () => {
    expect(parseDispatcherStatusEvidence(dispatchedCommentBody)).toEqual({
      batchId: "payment.daily-close",
      requestDigest,
      requestId,
      status: "DISPATCHED",
    });
  });

  it("builds a dispatch plan from matching approved evidence", () => {
    expect(
      verifyDispatcherEvidence({
        issueAuthor: "Developer",
        approvalCommentBody,
        issueBody,
        now: new Date("2026-05-09T01:30:03.000Z"),
      }),
    ).toEqual({
      ok: true,
      approval: {
        batchId: "payment.daily-close",
        decision: "APPROVED",
        requestDigest,
        requestId,
      },
      dispatchPlan: {
        batchId: "payment.daily-close",
        requestDigest,
        requestId,
        workflowInputs: {
          batch_id: "payment.daily-close",
          request_digest: requestDigest,
          request_id: requestId,
        },
        workflowPath: ".github/workflows/daily-close.yml",
        workflowRef: "main",
      },
      request: {
        approvedBatchRevision: {
          governedChangeId: sharedChangeRequestId,
          targetRevisionDigest: sharedTargetRevisionDigest,
        },
        batchId: "payment.daily-close",
        canonicalRequestedBy: "developer",
        expiresAt: "2026-05-09T02:02:03.000Z",
        requestDigest,
        requestedAt: "2026-05-09T01:02:03.000Z",
        requestedBy: "developer",
        requestId,
        status: "REQUESTED",
        workflowPath: ".github/workflows/daily-close.yml",
        workflowRef: "main",
      },
    });
  });

  it("rejects mismatched digest evidence", () => {
    expect(
      verifyDispatcherEvidence({
        issueAuthor: "Developer",
        approvalCommentBody: approvalCommentBody.replaceAll(
          requestDigest,
          "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        ),
        issueBody,
        now: new Date("2026-05-09T01:30:03.000Z"),
      }),
    ).toMatchObject({
      ok: false,
      reasonCode: "DIGEST_MISMATCH",
    });
  });

  it("rejects non-approved decisions", () => {
    expect(
      verifyDispatcherEvidence({
        issueAuthor: "Developer",
        approvalCommentBody: approvalCommentBody.replace(
          "decision=APPROVED",
          "decision=REJECTED",
        ),
        issueBody,
        now: new Date("2026-05-09T01:30:03.000Z"),
      }),
    ).toMatchObject({
      ok: false,
      reasonCode: "APPROVAL_NOT_APPROVED",
    });
  });

  it("rejects an expired pending request without dispatch or a misleading delivery-failure record", async () => {
    const scenario = createDispatchScenario();
    await expect(
      scenario.run(new Date("2026-05-09T02:02:03.000Z")),
    ).resolves.toMatchObject({
      status: "failed",
      reasonCode: "EXPIRED_REQUEST",
    });
    expect(scenario.dispatchCount()).toBe(0);
    expect(scenario.comments).toEqual([]);
    await expect(
      scenario.run(new Date("2026-05-09T03:00:00.000Z")),
    ).resolves.toMatchObject({
      status: "failed",
      reasonCode: "EXPIRED_REQUEST",
    });
    expect(scenario.dispatchCount()).toBe(0);
    expect(scenario.writes).toEqual([]);
  });

  it("dispatches an approved execution request", async () => {
    const requests: Array<{
      body?: unknown;
      input: string;
      method: string;
    }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      const url = input.toString();
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(init.body.toString()) : undefined;

      requests.push({ body, input: url, method });

      if (url.endsWith("/issues/34")) {
        return Response.json({ body: issueBody, user: { login: "Developer" } });
      }

      if (url.endsWith("/issues/comments/99")) {
        return Response.json({ body: approvalCommentBody });
      }

      if (method === "GET" && url.includes("/issues/34/comments?")) {
        return Response.json([]);
      }

      if (method === "POST" && url.endsWith("/labels")) {
        return Response.json({ name: body.name });
      }

      if (method === "POST" && url.endsWith("/issues/34/labels")) {
        return Response.json([]);
      }

      if (
        method === "DELETE" &&
        url.endsWith("/issues/34/labels/batchtrail%3Adispatching")
      ) {
        return new Response(null, { status: 204 });
      }

      if (url.endsWith("/dispatches")) {
        return new Response(null, { status: 204 });
      }

      if (url.endsWith("/issues/34/comments")) {
        return Response.json({ id: 100, body: "dispatch comment" });
      }

      return Response.json({ message: "not found" }, { status: 404 });
    };

    await expect(
      dispatchApprovedExecutionRequest({
        apiBaseUrl: "https://api.github.test",
        commentId: 99,
        fetcher,
        githubToken: "ghs_test",
        issueNumber: 34,
        now: new Date("2026-05-09T01:30:03.000Z"),
        owner: "always0ne",
        repo: "batch",
        verifyBatchRevision: verifyApprovedBatchRevision,
      }),
    ).resolves.toMatchObject({ status: "dispatched" });

    expect(requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          body: {
            inputs: {
              batch_id: "payment.daily-close",
              request_digest: requestDigest,
              request_id: requestId,
            },
            ref: "main",
          },
          input:
            "https://api.github.test/repos/always0ne/batch/actions/workflows/daily-close.yml/dispatches",
          method: "POST",
        }),
        expect.objectContaining({
          body: expect.objectContaining({
            body: expect.stringContaining("status=DISPATCHING"),
          }),
          input:
            "https://api.github.test/repos/always0ne/batch/issues/34/comments",
          method: "POST",
        }),
        expect.objectContaining({
          body: expect.objectContaining({
            body: expect.stringContaining("status=DISPATCHED"),
          }),
          input:
            "https://api.github.test/repos/always0ne/batch/issues/34/comments",
          method: "POST",
        }),
      ]),
    );
  });

  it("does not dispatch matching forged request and approval digests or requests without actual author evidence", async () => {
    const forged = await buildExecutionRequestIssue({
      approvedBatchRevision: {
        governedChangeId: sharedChangeRequestId,
        targetRevisionDigest: sharedTargetRevisionDigest,
      },
      batch: {
        batchId: "payment.daily-close",
        name: "Daily Close",
        owner: "ops",
        domain: "payments",
        environment: "PROD",
        criticality: "HIGH",
        gateRequired: true,
        status: "ACTIVE",
        workflow: { path: ".github/workflows/daily-close.yml", ref: "main" },
      },
      requestId,
      requestedBy: "developer",
      requestedAt: new Date("2026-05-09T01:02:03.000Z"),
      expiresAt: new Date("2026-05-09T02:02:03.000Z"),
    });
    const matchingApproval = buildExecutionApprovalCommentBody({
      requestDigest: forged.request.requestDigest,
    });
    for (const user of [{ login: "actual-attacker" }, undefined]) {
      const requests: Array<{ url: string; method: string }> = [];
      const fetcher = (async (input, init) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        requests.push({ url, method });
        if (url.endsWith("/issues/34"))
          return Response.json({ body: forged.body, user });
        if (url.endsWith("/issues/comments/99"))
          return Response.json({ body: matchingApproval });
        if (method === "GET" && url.includes("/issues/34/comments?"))
          return Response.json([]);
        if (method === "POST" && url.endsWith("/issues/34/comments"))
          return Response.json({ id: 100 });
        throw new Error(`Unexpected request: ${method} ${url}`);
      }) as typeof fetch;
      await expect(
        dispatchApprovedExecutionRequest({
          apiBaseUrl: "https://api.github.test",
          commentId: 99,
          issueNumber: 34,
          githubToken: "test-token",
          owner: "always0ne",
          repo: "batch",
          fetcher,
          now: new Date("2026-05-09T01:30:03.000Z"),
          verifyBatchRevision: verifyApprovedBatchRevision,
        }),
      ).resolves.toMatchObject({
        status: "failed",
        reasonCode: "REQUESTER_IDENTITY_UNVERIFIED",
      });
      expect(requests.some(({ url }) => url.endsWith("/dispatches"))).toBe(
        false,
      );
      expect(requests.filter(({ method }) => method === "POST")).toEqual([
        {
          url: "https://api.github.test/repos/always0ne/batch/issues/34/comments",
          method: "POST",
        },
      ]);
    }
  });

  it("does not mutate request history for markerless or mismatched approval comments", async () => {
    const cases = [
      {
        commandBody: "/bgcp approve requestDigest=sha256:abc",
        reasonCode: "IGNORED_COMMENT",
      },
      {
        commandBody: approvalCommentBody.replaceAll(requestId, "other-request"),
        reasonCode: "REQUEST_FIELD_MISMATCH",
      },
      {
        commandBody: approvalCommentBody.replaceAll(
          requestDigest,
          "sha256:other",
        ),
        reasonCode: "DIGEST_MISMATCH",
      },
    ];
    for (const { commandBody, reasonCode } of cases) {
      const scenario = createDispatchScenario({ commandBody });
      await expect(scenario.run()).resolves.toMatchObject({ reasonCode });
      expect(scenario.dispatchCount()).toBe(0);
      expect(scenario.writes).toEqual([]);
    }
  });

  it("preserves handled outcomes and labels when duplicate approval arrives after expiry", async () => {
    for (const status of [
      "DISPATCHED",
      "DISPATCHING",
      "DISPATCH_FAILED",
      "DISPATCH_UNCONFIRMED",
    ]) {
      const comment = dispatchedCommentBody.replaceAll("DISPATCHED", status);
      const scenario = createDispatchScenario({
        comments: [comment],
        labels: ["batchplane:dispatching"],
      });
      await expect(
        scenario.run(new Date("2026-05-09T03:00:00.000Z")),
      ).resolves.toMatchObject({ status: "ignored" });
      expect(scenario.dispatchCount(), status).toBe(0);
      expect(scenario.writes, status).toEqual([]);
      expect(scenario.comments, status).toEqual([comment]);
      expect([...scenario.labels], status).toEqual(["batchplane:dispatching"]);
    }

    const labeled = createDispatchScenario({
      labels: ["batchplane:dispatch-failed"],
    });
    await expect(labeled.run()).resolves.toMatchObject({ status: "ignored" });
    expect(labeled.writes).toEqual([]);
  });

  it("terminates explicit provider rejections and never resends the failed request", async () => {
    for (const status of [400, 401, 403, 404, 422, 429]) {
      const scenario = createDispatchScenario({
        dispatchResponse: () =>
          Response.json({ message: "Request rejected" }, { status }),
      });
      await expect(scenario.run()).resolves.toMatchObject({
        status: "failed",
        reasonCode: "WORKFLOW_DISPATCH_FAILED",
      });
      expect(scenario.comments.at(-1)).toContain("status=DISPATCH_FAILED");
      expect(scenario.comments.at(-1)).toContain(
        `GitHub API request failed: ${status}`,
      );
      expect(scenario.labels.has("batchplane:dispatch-failed")).toBe(true);
      expect(scenario.labels.has("batchplane:dispatching")).toBe(false);

      const recordedWrites = scenario.writes.length;
      await expect(scenario.run()).resolves.toMatchObject({
        status: "ignored",
      });
      expect(scenario.dispatchCount(), `HTTP ${status}`).toBe(1);
      expect(scenario.writes).toHaveLength(recordedWrites);
    }
  });

  it("writes failure evidence when verification fails", async () => {
    const requests: Array<{
      body?: unknown;
      input: string;
      method: string;
    }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      const url = input.toString();
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(init.body.toString()) : undefined;

      requests.push({ body, input: url, method });

      if (url.endsWith("/issues/34")) {
        return Response.json({
          body: issueBody.replace("status=REQUESTED", "status=APPROVED"),
        });
      }

      if (url.endsWith("/issues/comments/99")) {
        return Response.json({ body: approvalCommentBody });
      }

      if (method === "GET" && url.includes("/issues/34/comments?")) {
        return Response.json([]);
      }

      if (url.endsWith("/issues/34/comments")) {
        return Response.json({ id: 100, body: "failure comment" });
      }

      return Response.json({ message: "not found" }, { status: 404 });
    };

    await expect(
      dispatchApprovedExecutionRequest({
        apiBaseUrl: "https://api.github.test",
        commentId: 99,
        fetcher,
        githubToken: "ghs_test",
        issueNumber: 34,
        now: new Date("2026-05-09T01:30:03.000Z"),
        owner: "always0ne",
        repo: "batch",
        verifyBatchRevision: verifyApprovedBatchRevision,
      }),
    ).resolves.toMatchObject({
      reasonCode: "REQUEST_NOT_REQUESTED",
      status: "failed",
    });

    expect(
      requests.some((request) =>
        request.input.endsWith("/actions/workflows/daily-close.yml/dispatches"),
      ),
    ).toBe(false);
    expect(requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          body: expect.objectContaining({
            body: expect.stringContaining("Status: DISPATCH_FAILED"),
          }),
          input:
            "https://api.github.test/repos/always0ne/batch/issues/34/comments",
          method: "POST",
        }),
      ]),
    );
  });

  it("ignores retired retry commands without changing failed history or dispatching", async () => {
    for (const comments of [
      [],
      [buildDispatchedCommentBody({ status: "DISPATCH_FAILED" })],
    ]) {
      const scenario = createDispatchScenario({
        commandBody: "/bgcp retry-dispatch requestId=abc",
        comments,
      });
      await expect(scenario.run()).resolves.toMatchObject({
        status: "ignored",
        reasonCode: "IGNORED_COMMENT",
      });
      expect(scenario.dispatchCount()).toBe(0);
      expect(scenario.writes).toEqual([]);
    }
  });

  it("keeps uncertain acceptance locked and does not mark failure or resend on a later approval", async () => {
    const responses = [
      () => {
        throw new TypeError("Network connection lost");
      },
      () => {
        throw new DOMException("Request timed out", "TimeoutError");
      },
      () => Response.json({ message: "Request timeout" }, { status: 408 }),
      () => Response.json({ message: "Server error" }, { status: 500 }),
      () => Response.json({ message: "Gateway timeout" }, { status: 504 }),
    ];
    for (const dispatchResponse of responses) {
      const scenario = createDispatchScenario({ dispatchResponse });
      await expect(scenario.run()).resolves.toMatchObject({
        status: "unconfirmed",
        reasonCode: "DISPATCH_ACCEPTANCE_UNCONFIRMED",
      });
      expect(scenario.comments.at(-1)).toContain("status=DISPATCH_UNCONFIRMED");
      expect(scenario.labels.has("batchplane:dispatching")).toBe(true);
      expect(scenario.labels.has("batchplane:dispatch-failed")).toBe(false);
      expect(
        scenario.comments.some((comment) =>
          comment.includes("status=DISPATCH_FAILED"),
        ),
      ).toBe(false);

      const recordedWrites = scenario.writes.length;
      await expect(scenario.run()).resolves.toMatchObject({
        status: "ignored",
        reasonCode: "DISPATCH_ACCEPTANCE_UNCONFIRMED",
      });
      expect(scenario.dispatchCount()).toBe(1);
      expect(scenario.writes).toHaveLength(recordedWrites);
    }
  });

  it("retains the lock when recording an accepted dispatch fails without inventing delivery failure", async () => {
    const scenario = createDispatchScenario({ failSuccessComment: true });
    await expect(scenario.run()).rejects.toThrow(
      "Workflow dispatch was accepted, but its result could not be recorded",
    );
    expect(scenario.labels.has("batchplane:dispatching")).toBe(true);
    expect(scenario.labels.has("batchplane:dispatch-failed")).toBe(false);
    expect(scenario.comments).toEqual([
      expect.stringContaining("status=DISPATCHING"),
    ]);

    const recordedWrites = scenario.writes.length;
    await expect(scenario.run()).resolves.toMatchObject({ status: "ignored" });
    expect(scenario.dispatchCount()).toBe(1);
    expect(scenario.writes).toHaveLength(recordedWrites);
  });
});

function createDispatchScenario({
  commandBody = approvalCommentBody,
  comments: initialComments = [],
  labels: initialLabels = [],
  dispatchResponse = () => new Response(null, { status: 204 }),
  failSuccessComment = false,
}: {
  commandBody?: string;
  comments?: string[];
  labels?: string[];
  dispatchResponse?: () => Response;
  failSuccessComment?: boolean;
} = {}) {
  const comments = [...initialComments];
  const labels = new Set(initialLabels);
  const writes: string[] = [];
  let dispatchCount = 0;
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(input.toString());
    const path = url.pathname;
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(init.body.toString()) : undefined;
    if (method !== "GET") writes.push(`${method} ${path}`);
    if (method === "GET" && path.endsWith("/issues/34"))
      return Response.json({
        body: issueBody,
        user: { login: "Developer" },
        labels: [...labels],
      });
    if (method === "GET" && path.endsWith("/issues/comments/99"))
      return Response.json({ body: commandBody });
    if (method === "GET" && path.endsWith("/issues/34/comments"))
      return Response.json(
        url.searchParams.get("page") === "1"
          ? comments.map((body) => ({ body }))
          : [],
      );
    if (method === "POST" && path.endsWith("/issues/34/comments")) {
      if (failSuccessComment && body.body.includes("status=DISPATCHED"))
        throw new TypeError("Evidence write failed");
      comments.push(body.body);
      return Response.json({ id: comments.length, body: body.body });
    }
    if (method === "POST" && path.endsWith("/issues/34/labels")) {
      for (const label of body.labels) labels.add(label);
      return Response.json([]);
    }
    if (method === "POST" && path.endsWith("/labels"))
      return Response.json({ name: body.name });
    if (method === "DELETE" && path.includes("/issues/34/labels/")) {
      labels.delete(decodeURIComponent(path.split("/").at(-1) ?? ""));
      return new Response(null, { status: 204 });
    }
    if (method === "POST" && path.endsWith("/dispatches")) {
      dispatchCount += 1;
      return dispatchResponse();
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  };

  return {
    comments,
    labels,
    writes,
    dispatchCount: () => dispatchCount,
    run: (now = new Date("2026-05-09T01:30:03.000Z")) =>
      dispatchApprovedExecutionRequest({
        apiBaseUrl: "https://api.github.test",
        commentId: 99,
        fetcher,
        githubToken: "ghs_test",
        issueNumber: 34,
        now,
        owner: "always0ne",
        repo: "batch",
        verifyBatchRevision: verifyApprovedBatchRevision,
      }),
  };
}
