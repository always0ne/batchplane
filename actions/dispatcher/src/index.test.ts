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
  it("keeps the legacy slash command parser", () => {
    expect(parseDispatcherCommand("/bgcp approve requestDigest=abc")).toBe(
      "approve",
    );
    expect(parseDispatcherCommand("/bgcp retry-dispatch requestId=abc")).toBe(
      "retry-dispatch",
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

  it("rejects expired requests", () => {
    expect(
      verifyDispatcherEvidence({
        issueAuthor: "Developer",
        approvalCommentBody,
        issueBody,
        now: new Date("2026-05-09T02:02:03.000Z"),
      }),
    ).toMatchObject({
      ok: false,
      reasonCode: "EXPIRED_REQUEST",
    });
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

  it("ignores markerless approval-looking comments without recording dispatch failure", async () => {
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
        return Response.json({
          body: "/bgcp approve requestDigest=sha256:abc",
        });
      }

      if (method === "GET" && url.includes("/issues/34/comments?")) {
        return Response.json([]);
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
      reasonCode: "IGNORED_COMMENT",
      status: "ignored",
    });

    expect(
      requests.some((request) => request.input.endsWith("/dispatches")),
    ).toBe(false);
    expect(
      requests.some(
        (request) =>
          request.method === "POST" &&
          request.input.endsWith("/issues/34/comments"),
      ),
    ).toBe(false);
  });

  it("ignores duplicate approval comments after dispatch evidence exists", async () => {
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
          body: issueBody,
          labels: [],
          user: { login: "Developer" },
        });
      }

      if (url.endsWith("/issues/comments/99")) {
        return Response.json({ body: approvalCommentBody });
      }

      if (method === "GET" && url.includes("/issues/34/comments?")) {
        return Response.json([{ body: dispatchedCommentBody }]);
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
      reasonCode: "DISPATCH_ALREADY_HANDLED",
      status: "ignored",
    });

    expect(
      requests.some((request) => request.input.endsWith("/dispatches")),
    ).toBe(false);
  });

  it("writes dispatch failure evidence and label when workflow dispatch fails", async () => {
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
          body: issueBody,
          labels: [],
          user: { login: "Developer" },
        });
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
        return Response.json({ message: "boom" }, { status: 500 });
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
    ).resolves.toMatchObject({
      reasonCode: "WORKFLOW_DISPATCH_FAILED",
      status: "failed",
    });

    expect(requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          body: { labels: ["batchplane:dispatch-failed"] },
          input:
            "https://api.github.test/repos/always0ne/batch/issues/34/labels",
          method: "POST",
        }),
        expect.objectContaining({
          body: expect.objectContaining({
            body: expect.stringContaining("status=DISPATCH_FAILED"),
          }),
          input:
            "https://api.github.test/repos/always0ne/batch/issues/34/comments",
          method: "POST",
        }),
      ]),
    );
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

  it("retries dispatch only after matching dispatch-failed evidence exists", async () => {
    const retryCommentBody = "/bgcp retry-dispatch requestId=abc";
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
          body: issueBody,
          labels: ["batchplane:dispatch-failed"],
          user: { login: "Developer" },
        });
      }

      if (url.endsWith("/issues/comments/99")) {
        return Response.json({ body: retryCommentBody });
      }

      if (method === "GET" && url.includes("/issues/34/comments?")) {
        return Response.json([
          { body: approvalCommentBody },
          {
            body: buildDispatchedCommentBody({
              requestDigest,
              requestId,
              status: "DISPATCH_FAILED",
            }),
          },
          { body: retryCommentBody },
        ]);
      }

      if (method === "POST" && url.endsWith("/labels")) {
        return Response.json({ name: body.name });
      }

      if (method === "POST" && url.endsWith("/issues/34/labels")) {
        return Response.json([]);
      }

      if (
        method === "DELETE" &&
        url.endsWith("/issues/34/labels/batchplane%3Adispatch-failed")
      ) {
        return new Response(null, { status: 204 });
      }

      if (
        method === "DELETE" &&
        url.endsWith("/issues/34/labels/batchtrail%3Adispatch-failed")
      ) {
        return Response.json({ message: "not found" }, { status: 404 });
      }

      if (
        method === "DELETE" &&
        url.endsWith("/issues/34/labels/batchplane%3Adispatching")
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
    ).resolves.toMatchObject({
      status: "dispatched",
    });

    expect(requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          input:
            "https://api.github.test/repos/always0ne/batch/issues/34/labels/batchplane%3Adispatch-failed",
          method: "DELETE",
        }),
        expect.objectContaining({
          input:
            "https://api.github.test/repos/always0ne/batch/actions/workflows/daily-close.yml/dispatches",
          method: "POST",
        }),
      ]),
    );
  });

  it("denies retry-dispatch when matching dispatch-failed evidence does not exist", async () => {
    const retryCommentBody = "/bgcp retry-dispatch requestId=abc";
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
          body: issueBody,
          labels: [],
          user: { login: "Developer" },
        });
      }

      if (url.endsWith("/issues/comments/99")) {
        return Response.json({ body: retryCommentBody });
      }

      if (method === "GET" && url.includes("/issues/34/comments?")) {
        return Response.json([{ body: approvalCommentBody }]);
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
      reasonCode: "RETRY_DISPATCH_NOT_ALLOWED",
      status: "failed",
    });

    expect(
      requests.some((request) => request.input.endsWith("/dispatches")),
    ).toBe(false);
    expect(requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          body: expect.objectContaining({
            body: expect.stringContaining("RETRY_DISPATCH_NOT_ALLOWED"),
          }),
          input:
            "https://api.github.test/repos/always0ne/batch/issues/34/comments",
          method: "POST",
        }),
      ]),
    );
  });
});
