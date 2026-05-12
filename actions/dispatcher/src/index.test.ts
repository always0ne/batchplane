import { describe, expect, it } from "vitest";

import {
  dispatchApprovedExecutionRequest,
  parseDispatcherCommand,
  parseExecutionApprovalEvidence,
  parseExecutionRequestEvidence,
  verifyDispatcherEvidence,
} from "./index";

const requestDigest =
  "sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
const requestId = "btr-20260509010203-payment.daily-close-abcdef12";

const issueBody = [
  "## BatchTrail Execution Request",
  "",
  `- Request ID: \`${requestId}\``,
  "- Batch ID: `payment.daily-close`",
  "- Requested by: @developer",
  "- Requested at: 2026-05-09T01:02:03.000Z",
  "- Expires at: 2026-05-09T02:02:03.000Z",
  `- Request digest: \`${requestDigest}\``,
  "- Status: REQUESTED",
  "",
  "### Canonical payload",
  "",
  "```json",
  JSON.stringify(
    {
      apiVersion: "batchtrail.io/v1",
      kind: "ExecutionRequest",
      metadata: {
        batchId: "payment.daily-close",
        requestId,
      },
      spec: {
        expiresAt: "2026-05-09T02:02:03.000Z",
        requestedAt: "2026-05-09T01:02:03.000Z",
        requestedBy: "developer",
        workflow: {
          path: ".github/workflows/daily-close.yml",
          ref: "main",
        },
      },
    },
    null,
    2,
  ),
  "```",
  "",
  "<!-- batchtrail:execution-request",
  `requestId=${requestId}`,
  "batchId=payment.daily-close",
  `requestDigest=${requestDigest}`,
  "status=REQUESTED",
  "-->",
].join("\n");

const approvalCommentBody = [
  `/bgcp approve requestDigest=${requestDigest}`,
  "",
  "## BatchTrail Execution Approval",
  "",
  "- Decision: APPROVED",
  "- Approver: @maintainer",
  "- Approved at: 2026-05-09T01:20:03.000Z",
  `- Request ID: \`${requestId}\``,
  "- Batch ID: `payment.daily-close`",
  `- Request digest: \`${requestDigest}\``,
  "",
  "<!-- batchtrail:execution-approval",
  "decision=APPROVED",
  `requestId=${requestId}`,
  "batchId=payment.daily-close",
  `requestDigest=${requestDigest}`,
  "-->",
].join("\n");

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
            body: expect.stringContaining("Status: DISPATCHED"),
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
});
