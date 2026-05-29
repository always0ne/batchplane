import { describe, expect, it } from "vitest";

import {
  dispatchApprovedExecutionRequest,
  parseDispatcherCommand,
  parseDispatcherStatusEvidence,
  parseExecutionApprovalEvidence,
  parseExecutionRequestEvidence,
  verifyDispatcherEvidence,
} from "./index";
import {
  buildDispatchedCommentBody,
  buildExecutionApprovalCommentBody,
  buildExecutionIssueBody,
  sharedRequestDigest as requestDigest,
  sharedRequestId as requestId,
} from "../../../test/fixtures/execution-evidence";
const issueBody = buildExecutionIssueBody();
const approvalCommentBody = buildExecutionApprovalCommentBody();
const dispatchedCommentBody = buildDispatchedCommentBody();

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

  it("parses execution request evidence", () => {
    expect(parseExecutionRequestEvidence(issueBody)).toEqual({
      batchId: "payment.daily-close",
      expiresAt: "2026-05-09T02:02:03.000Z",
      requestDigest,
      requestedAt: "2026-05-09T01:02:03.000Z",
      requestedBy: "developer",
      requestId,
      status: "REQUESTED",
      workflowPath: ".github/workflows/daily-close.yml",
      workflowRef: "main",
    });
  });

  it("parses execution approval evidence", () => {
    expect(parseExecutionApprovalEvidence(approvalCommentBody)).toEqual({
      batchId: "payment.daily-close",
      decision: "APPROVED",
      requestDigest,
      requestId,
    });
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
        batchId: "payment.daily-close",
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
        return Response.json({ body: issueBody });
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
        return Response.json({ body: issueBody, labels: [] });
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
        return Response.json({ body: issueBody, labels: [] });
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
        return Response.json({ body: issueBody, labels: [] });
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
