import { describe, expect, it } from "vitest";

import {
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
});
