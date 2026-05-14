import { afterEach, describe, expect, it, vi } from "vitest";

import {
  readGateInputFromEnv,
  runGateFromEnv,
  verifyLiteAuthorization,
  verifyLiteInput,
} from ".";

const requestId = "btr-20260513010203-payment.daily-close-abcdef12";
const batchId = "payment.daily-close";
const requestDigest =
  "sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
const requestIssueBody = [
  "## BatchTrail Execution Request",
  "",
  `- Request ID: \`${requestId}\``,
  `- Batch ID: \`${batchId}\``,
  "- Requested by: @developer",
  "- Requested at: 2026-05-13T01:02:03.000Z",
  "- Expires at: 2026-05-13T02:02:03.000Z",
  `- Request digest: \`${requestDigest}\``,
  "- Status: REQUESTED",
  "",
  "<!-- batchtrail:execution-request",
  `requestId=${requestId}`,
  `batchId=${batchId}`,
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
  "- Approved at: 2026-05-13T01:03:03.000Z",
  `- Request ID: \`${requestId}\``,
  `- Batch ID: \`${batchId}\``,
  `- Request digest: \`${requestDigest}\``,
  "",
  "<!-- batchtrail:execution-approval",
  "decision=APPROVED",
  `requestId=${requestId}`,
  `batchId=${batchId}`,
  `requestDigest=${requestDigest}`,
  "-->",
].join("\n");

describe("Gate action runtime", () => {
  afterEach(() => {
    process.exitCode = undefined;
    vi.restoreAllMocks();
  });

  it("allows lite executions with request and approval evidence", () => {
    expect(
      verifyLiteInput({
        approvalRef: "btr-20260513010203-payment.daily-close-abcdef12",
        approvalSource: "issue",
        batchId,
        configPath: ".batch-governance",
        mode: "lite",
        requestDigest,
        requestId,
        runAttempt: 1,
      }),
    ).toEqual({
      result: "ALLOW",
      message: "Execution request evidence is present.",
    });
  });

  it("denies lite executions without a request digest", () => {
    expect(
      verifyLiteInput({
        approvalRef: "btr-20260513010203-payment.daily-close-abcdef12",
        approvalSource: "issue",
        batchId,
        configPath: ".batch-governance",
        mode: "lite",
        requestId,
      }),
    ).toEqual({
      result: "DENY",
      reasonCode: "REQUEST_DIGEST_REQUIRED",
      message: "Approved request digest is required.",
    });
  });

  it("denies GitHub Actions reruns by default", () => {
    expect(
      verifyLiteInput({
        approvalRef: "btr-20260513010203-payment.daily-close-abcdef12",
        approvalSource: "issue",
        batchId,
        configPath: ".batch-governance",
        mode: "lite",
        requestDigest,
        requestId,
        runAttempt: 2,
      }),
    ).toEqual({
      result: "DENY",
      reasonCode: "RERUN_NOT_AUTHORIZED",
      message:
        "GitHub Actions reruns are not authorized by BatchTrail. Create a new execution request or approved retry instead.",
    });
  });

  it("denies manual workflow_dispatch actors before reading GitHub evidence", async () => {
    const fetcher = vi.fn(async () => Response.json({}));

    await expect(
      verifyLiteAuthorization({
        actor: "always0ne",
        approvalRef: requestId,
        approvalSource: "issue",
        batchId,
        configPath: ".batch-governance",
        expectedDispatcherActor: "github-actions[bot]",
        fetcher: fetcher as unknown as typeof fetch,
        githubToken: "ghs_test",
        mode: "lite",
        repository: "always0ne/batch",
        requestDigest,
        requestId,
        runAttempt: 1,
      }),
    ).resolves.toEqual({
      result: "DENY",
      reasonCode: "DIRECT_DISPATCH_NOT_AUTHORIZED",
      message:
        "Workflow actor always0ne is not the BatchTrail dispatcher actor github-actions[bot].",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("verifies matching GitHub request and approval evidence", async () => {
    await expect(
      verifyLiteAuthorization({
        actor: "github-actions[bot]",
        approvalRef: requestId,
        approvalSource: "issue",
        batchId,
        configPath: ".batch-governance",
        fetcher: createGateFetchMock({
          comments: [{ body: approvalCommentBody }],
          issues: [{ body: requestIssueBody, number: 34 }],
        }),
        githubToken: "ghs_test",
        mode: "lite",
        repository: "always0ne/batch",
        requestDigest,
        requestId,
        runAttempt: 1,
      }),
    ).resolves.toEqual({
      result: "ALLOW",
      message: "Execution request and approval evidence are verified.",
    });
  });

  it("denies runs when GitHub approval evidence is missing", async () => {
    await expect(
      verifyLiteAuthorization({
        actor: "github-actions[bot]",
        approvalRef: requestId,
        approvalSource: "issue",
        batchId,
        configPath: ".batch-governance",
        fetcher: createGateFetchMock({
          comments: [],
          issues: [{ body: requestIssueBody, number: 34 }],
        }),
        githubToken: "ghs_test",
        mode: "lite",
        repository: "always0ne/batch",
        requestDigest,
        requestId,
        runAttempt: 1,
      }),
    ).resolves.toEqual({
      result: "DENY",
      reasonCode: "APPROVAL_EVIDENCE_NOT_FOUND",
      message: "Execution approval comment evidence was not found.",
    });
  });

  it("reads GitHub action inputs from environment variables", () => {
    expect(
      readGateInputFromEnv({
        GITHUB_ACTOR: "github-actions[bot]",
        GITHUB_API_URL: "https://api.github.test",
        GITHUB_REPOSITORY: "always0ne/batch",
        GITHUB_RUN_ATTEMPT: "1",
        "INPUT_APPROVAL-REF": requestId,
        "INPUT_APPROVAL-SOURCE": "issue",
        "INPUT_BATCH-ID": batchId,
        "INPUT_GITHUB-TOKEN": "ghs_test",
        INPUT_MODE: "lite",
        INPUT_REF: "main",
        "INPUT_REQUEST-DIGEST": requestDigest,
        "INPUT_REQUEST-ID": requestId,
        "INPUT_SCHEDULE-ID": "daily-close-prod",
      }),
    ).toEqual({
      actor: "github-actions[bot]",
      apiBaseUrl: "https://api.github.test",
      approvalRef: requestId,
      approvalSource: "issue",
      batchId,
      configPath: ".batch-governance",
      expectedDispatcherActor: "github-actions[bot]",
      githubToken: "ghs_test",
      mode: "lite",
      repository: "always0ne/batch",
      requestDigest,
      requestId,
      ref: "main",
      runAttempt: 1,
      scheduleId: "daily-close-prod",
    });
  });

  it("sets a failing exit code when Gate denies execution", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      runGateFromEnv({
        "INPUT_BATCH-ID": batchId,
        INPUT_MODE: "lite",
      }),
    ).resolves.toMatchObject({
      result: "DENY",
      reasonCode: "EXECUTION_REQUEST_REQUIRED",
    });
    expect(process.exitCode).toBe(1);
  });

  it("sets a failing exit code when a rerun reaches Gate", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      runGateFromEnv({
        GITHUB_RUN_ATTEMPT: "2",
        "INPUT_APPROVAL-REF": requestId,
        "INPUT_APPROVAL-SOURCE": "issue",
        "INPUT_BATCH-ID": batchId,
        INPUT_MODE: "lite",
        "INPUT_REQUEST-DIGEST": requestDigest,
        "INPUT_REQUEST-ID": requestId,
      }),
    ).resolves.toMatchObject({
      result: "DENY",
      reasonCode: "RERUN_NOT_AUTHORIZED",
    });
    expect(process.exitCode).toBe(1);
  });
});

function createGateFetchMock({
  comments,
  issues,
}: {
  comments: Array<{ body: string }>;
  issues: Array<{ body: string; number: number }>;
}): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = input.toString();

    if (
      url.endsWith(
        "/repos/always0ne/batch/issues?state=all&per_page=100&page=1",
      )
    ) {
      return Response.json(
        issues.map((issue) => ({
          body: issue.body,
          labels: [],
          number: issue.number,
          state: "closed",
          title: "Run batch payment.daily-close",
        })),
      );
    }

    if (
      url.endsWith(
        "/repos/always0ne/batch/issues/34/comments?per_page=100&page=1",
      )
    ) {
      return Response.json(comments);
    }

    if (
      url.endsWith(
        "/repos/always0ne/batch/issues/34/comments?per_page=100&page=2",
      )
    ) {
      return Response.json([]);
    }

    return Response.json(
      { message: `Unexpected URL: ${url}` },
      { status: 404 },
    );
  }) as typeof fetch;
}
