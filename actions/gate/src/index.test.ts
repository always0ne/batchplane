import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import {
  buildExecutionRequestIssue,
  type BatchDefinition,
} from "@batchplane/domain";
import {
  buildBatchWorkflowYaml,
  getNativeScheduleWorkflowJobIdentity,
  inspectNativeScheduleExecution,
  serializeBatchDefinitionYaml,
  type GitHubLiteClient,
} from "@batchplane/github-lite";

import {
  readGateInputFromEnv,
  runGateFromEnv,
  verifyLiteAuthorization,
  verifyLiteInput,
} from ".";
import {
  buildExecutionApprovalCommentBody,
  buildExecutionIssueBody,
  sharedBatchId as batchId,
  sharedGovernedChangeId,
  sharedRequestDigest as requestDigest,
  sharedRequestId as requestId,
  sharedTargetRevisionDigest,
} from "../../../test/fixtures/execution-evidence";
import {
  parseExecutionApprovalEvidence,
  parseExecutionRequestEvidence,
} from "../../dispatcher/src";
import type { WorkspaceApprovalMode } from "./gate-schema";
const workflowPath = ".github/workflows/payment.daily-close.yml";
const verifiedSha = "a".repeat(40);

async function verifyApprovedRevision() {
  return {
    approvedRevision: {
      governedChangeId: sharedGovernedChangeId,
      targetRevisionDigest: sharedTargetRevisionDigest,
    },
    controlStatus: "VERIFIED" as const,
    verifiedSha,
  };
}

describe("Gate action runtime", () => {
  afterEach(() => {
    process.exitCode = undefined;
    vi.restoreAllMocks();
  });

  it("allows lite executions with required input fields", () => {
    expect(
      verifyLiteInput({
        approvalRef: requestId,
        approvalSource: "issue",
        batchId,
        configPath: ".batch-governance",
        mode: "lite",
        requestDigest,
        requestId,
        runAttempt: 1,
      }),
    ).toEqual({
      message: "Manual execution request evidence is present.",
      result: "ALLOW",
    });
  });

  it("denies lite executions without request digest", () => {
    expect(
      verifyLiteInput({
        approvalRef: requestId,
        approvalSource: "issue",
        batchId,
        configPath: ".batch-governance",
        mode: "lite",
        requestId,
      }),
    ).toEqual({
      message: "Approved request digest is required.",
      reasonCode: "REQUEST_DIGEST_REQUIRED",
      result: "DENY",
    });
  });

  it("denies GitHub Actions reruns by default", () => {
    expect(
      verifyLiteInput({
        approvalRef: requestId,
        approvalSource: "issue",
        batchId,
        configPath: ".batch-governance",
        mode: "lite",
        requestDigest,
        requestId,
        runAttempt: 2,
      }),
    ).toEqual({
      message:
        "GitHub Actions reruns are not authorized by BatchPlane. Create a new execution request or approved retry instead.",
      reasonCode: "RERUN_NOT_AUTHORIZED",
      result: "DENY",
    });
  });

  it("requires an explicit valid Run attempt for native schedule context", () => {
    expect(
      verifyLiteInput({
        batchId,
        configPath: ".batch-governance",
        eventName: "schedule",
        eventSchedule: "0 5 * * *",
        mode: "lite",
        repositoryId: "99",
        requestDigest,
        requestId,
        sourceRunId: "100",
        workflowPath,
        workflowRef: "main",
        workflowSha: verifiedSha,
      }),
    ).toMatchObject({
      reasonCode: "NATIVE_SCHEDULE_CONTEXT_REQUIRED",
      result: "DENY",
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
      message:
        "Workflow actor always0ne is not the BatchPlane dispatcher actor github-actions[bot].",
      reasonCode: "DIRECT_DISPATCH_NOT_AUTHORIZED",
      result: "DENY",
    });

    expect(fetcher).not.toHaveBeenCalled();
  });

  it("verifies matching GitHub request, batch policy, and approval evidence", async () => {
    await expect(
      verifyLiteAuthorization(
        {
          actor: "github-actions[bot]",
          approvalRef: requestId,
          approvalSource: "issue",
          batchId,
          configPath: ".batch-governance",
          fetcher: createGateFetchMock(),
          githubToken: "ghs_test",
          mode: "lite",
          repository: "always0ne/batch",
          requestDigest,
          requestId,
          runAttempt: 1,
          workflowSha: verifiedSha,
        },
        verifyApprovedRevision,
      ),
    ).resolves.toEqual({
      message:
        "Execution request, approval evidence, and batch policy are verified.",
      result: "ALLOW",
      verifiedSha,
    });
  });

  it("denies an otherwise authorized run when the workflow source SHA is missing", async () => {
    const verifyBatchRevision = vi.fn(verifyApprovedRevision);
    const input = authorizedGateInput({ workflowSha: undefined });

    await expect(
      verifyLiteAuthorization(input, verifyBatchRevision),
    ).resolves.toMatchObject({
      reasonCode: "WORKFLOW_SOURCE_SHA_REQUIRED",
      result: "DENY",
    });
    expect(verifyBatchRevision).not.toHaveBeenCalled();
  });

  it.each([
    {
      result: {
        controlStatus: "BYPASSED" as const,
        reasonCode: "UNAPPROVED_BATCH_REVISION" as const,
      },
    },
    {
      result: {
        controlStatus: "UNKNOWN" as const,
        reasonCode: "APPROVED_BATCH_REVISION_UNAVAILABLE" as const,
      },
    },
  ])(
    "denies $result.controlStatus revision verification",
    async ({ result }) => {
      const verifyBatchRevision = vi.fn().mockResolvedValue(result);

      await expect(
        verifyLiteAuthorization(authorizedGateInput(), verifyBatchRevision),
      ).resolves.toMatchObject({
        reasonCode: result.reasonCode,
        result: "DENY",
      });
      expect(verifyBatchRevision).toHaveBeenCalledWith(
        expect.objectContaining({
          executionWorkflowSha: verifiedSha,
          expectedRevision: {
            governedChangeId: sharedGovernedChangeId,
            targetRevisionDigest: sharedTargetRevisionDigest,
          },
        }),
      );
    },
  );

  it("keeps digest evidence aligned across UI issue body, dispatcher parser, and Gate verifier", async () => {
    const issueBodyFromFixture = buildExecutionIssueBody({
      batchId,
      requestDigest,
      requestId,
      workflowPath,
      workflowRef: "main",
    });
    const approvalBodyFromFixture = buildExecutionApprovalCommentBody({
      approver: "maintainer",
      batchId,
      requestDigest,
      requestId,
    });
    const parsedRequest = parseExecutionRequestEvidence(issueBodyFromFixture);
    const parsedApproval = parseExecutionApprovalEvidence(
      approvalBodyFromFixture,
    );

    expect(parsedRequest?.requestDigest).toBe(requestDigest);
    expect(parsedApproval?.requestDigest).toBe(requestDigest);

    await expect(
      verifyLiteAuthorization(
        {
          actor: "github-actions[bot]",
          approvalRef: requestId,
          approvalSource: "issue",
          batchId,
          configPath: ".batch-governance",
          fetcher: createGateFetchMock({
            comments: [
              {
                body: approvalBodyFromFixture,
                created_at: "2026-05-13T01:03:03.000Z",
                updated_at: "2026-05-13T01:03:03.000Z",
                user: { login: "maintainer" },
              },
            ],
            requestIssueBody: issueBodyFromFixture,
          }),
          githubToken: "ghs_test",
          mode: "lite",
          repository: "always0ne/batch",
          requestDigest,
          requestId,
          runAttempt: 1,
          workflowSha: verifiedSha,
        },
        verifyApprovedRevision,
      ),
    ).resolves.toEqual({
      message:
        "Execution request, approval evidence, and batch policy are verified.",
      result: "ALLOW",
      verifiedSha,
    });
  });

  it("denies self-approval when Workspace policy is missing or strict", async () => {
    await expect(
      verifyLiteAuthorization(
        {
          actor: "github-actions[bot]",
          approvalRef: requestId,
          approvalSource: "issue",
          batchId,
          configPath: ".batch-governance",
          fetcher: createGateFetchMock({
            comments: [buildApprovalComment({ approver: "developer" })],
          }),
          githubToken: "ghs_test",
          mode: "lite",
          repository: "always0ne/batch",
          requestDigest,
          requestId,
          runAttempt: 1,
          workflowSha: verifiedSha,
        },
        verifyApprovedRevision,
      ),
    ).resolves.toEqual({
      message: "Requester and approver must be different users.",
      reasonCode: "SELF_APPROVAL_NOT_ALLOWED",
      result: "DENY",
    });
  });

  it("allows self-approval only when Workspace policy explicitly allows it", async () => {
    await expect(
      verifyLiteAuthorization(
        {
          actor: "github-actions[bot]",
          approvalRef: requestId,
          approvalSource: "issue",
          batchId,
          configPath: ".batch-governance",
          fetcher: createGateFetchMock({
            approverRepositoryRoles: ["write"],
            comments: [buildApprovalComment({ approver: "developer" })],
            includeWorkspacePolicy: true,
            workspaceApprovalMode: "SELF_APPROVAL_ALLOWED",
          }),
          githubToken: "ghs_test",
          mode: "lite",
          repository: "always0ne/batch",
          requestDigest,
          requestId,
          runAttempt: 1,
          workflowSha: verifiedSha,
        },
        verifyApprovedRevision,
      ),
    ).resolves.toEqual({
      message:
        "Execution request, approval evidence, and batch policy are verified.",
      result: "ALLOW",
      verifiedSha,
    });
  });

  it("allows explicit Workspace self-approval without role mapping", async () => {
    await expect(
      verifyLiteAuthorization(
        {
          actor: "github-actions[bot]",
          approvalRef: requestId,
          approvalSource: "issue",
          batchId,
          configPath: ".batch-governance",
          fetcher: createGateFetchMock({
            comments: [buildApprovalComment({ approver: "developer" })],
            includeRoleMapping: false,
            includeWorkspacePolicy: true,
            workspaceApprovalMode: "SELF_APPROVAL_ALLOWED",
          }),
          githubToken: "ghs_test",
          mode: "lite",
          repository: "always0ne/batch",
          requestDigest,
          requestId,
          runAttempt: 1,
          workflowSha: verifiedSha,
        },
        verifyApprovedRevision,
      ),
    ).resolves.toEqual({
      message:
        "Execution request, approval evidence, and batch policy are verified.",
      result: "ALLOW",
      verifiedSha,
    });
  });

  it("treats AUTO_APPROVE as including manual self-approval permission", async () => {
    await expect(
      verifyLiteAuthorization(
        {
          actor: "github-actions[bot]",
          approvalRef: requestId,
          approvalSource: "issue",
          batchId,
          configPath: ".batch-governance",
          fetcher: createGateFetchMock({
            comments: [buildApprovalComment({ approver: "developer" })],
            includeRoleMapping: false,
            includeWorkspacePolicy: true,
            workspaceApprovalMode: "AUTO_APPROVE",
          }),
          githubToken: "ghs_test",
          mode: "lite",
          repository: "always0ne/batch",
          requestDigest,
          requestId,
          runAttempt: 1,
          workflowSha: verifiedSha,
        },
        verifyApprovedRevision,
      ),
    ).resolves.toEqual({
      message:
        "Execution request, approval evidence, and batch policy are verified.",
      result: "ALLOW",
      verifiedSha,
    });
  });

  it("allows Workspace auto-approval only when policy explicitly enables it", async () => {
    await expect(
      verifyLiteAuthorization(
        {
          actor: "github-actions[bot]",
          approvalRef: requestId,
          approvalSource: "issue",
          batchId,
          configPath: ".batch-governance",
          fetcher: createGateFetchMock({
            comments: [
              buildApprovalComment({
                approvalType: "WORKSPACE_AUTO_APPROVED",
                approver: "developer",
              }),
            ],
            includeRoleMapping: false,
            includeWorkspacePolicy: true,
            workspaceApprovalMode: "AUTO_APPROVE",
          }),
          githubToken: "ghs_test",
          mode: "lite",
          repository: "always0ne/batch",
          requestDigest,
          requestId,
          runAttempt: 1,
          workflowSha: verifiedSha,
        },
        verifyApprovedRevision,
      ),
    ).resolves.toEqual({
      message:
        "Execution request, Workspace auto-approval evidence, and batch policy are verified.",
      result: "ALLOW",
      verifiedSha,
    });
  });

  it("denies Workspace auto-approval evidence unless policy enables it", async () => {
    await expect(
      verifyLiteAuthorization({
        actor: "github-actions[bot]",
        approvalRef: requestId,
        approvalSource: "issue",
        batchId,
        configPath: ".batch-governance",
        fetcher: createGateFetchMock({
          comments: [
            buildApprovalComment({
              approvalType: "WORKSPACE_AUTO_APPROVED",
              approver: "developer",
            }),
          ],
          includeWorkspacePolicy: true,
          workspaceApprovalMode: "SELF_APPROVAL_BLOCKED",
        }),
        githubToken: "ghs_test",
        mode: "lite",
        repository: "always0ne/batch",
        requestDigest,
        requestId,
        runAttempt: 1,
      }),
    ).resolves.toEqual({
      message:
        "Workspace auto-approval evidence requires AUTO_APPROVE policy mode.",
      reasonCode: "WORKSPACE_AUTO_APPROVAL_NOT_ALLOWED",
      result: "DENY",
    });
  });

  it("still requires role mapping for non-self approvals", async () => {
    await expect(
      verifyLiteAuthorization({
        actor: "github-actions[bot]",
        approvalRef: requestId,
        approvalSource: "issue",
        batchId,
        configPath: ".batch-governance",
        fetcher: createGateFetchMock({
          comments: [buildApprovalComment({ approver: "maintainer" })],
          includeRoleMapping: false,
          includeWorkspacePolicy: true,
          workspaceApprovalMode: "SELF_APPROVAL_ALLOWED",
        }),
        githubToken: "ghs_test",
        mode: "lite",
        repository: "always0ne/batch",
        requestDigest,
        requestId,
        runAttempt: 1,
      }),
    ).resolves.toEqual({
      message:
        "Role mapping file was not found: .batch-governance/policies/role-mapping.yml.",
      reasonCode: "APPROVER_NOT_AUTHORIZED",
      result: "DENY",
    });
  });

  it("returns BATCH_NOT_FOUND when batch definition file is missing", async () => {
    await expect(
      verifyLiteAuthorization({
        actor: "github-actions[bot]",
        approvalRef: requestId,
        approvalSource: "issue",
        batchId,
        configPath: ".batch-governance",
        fetcher: createGateFetchMock({ includeBatchDefinition: false }),
        githubToken: "ghs_test",
        mode: "lite",
        repository: "always0ne/batch",
        requestDigest,
        requestId,
        runAttempt: 1,
      }),
    ).resolves.toMatchObject({
      reasonCode: "BATCH_NOT_FOUND",
      result: "DENY",
    });
  });

  it("returns BATCH_NOT_ACTIVE for inactive batches", async () => {
    await expect(
      verifyLiteAuthorization({
        actor: "github-actions[bot]",
        approvalRef: requestId,
        approvalSource: "issue",
        batchId,
        configPath: ".batch-governance",
        fetcher: createGateFetchMock({ batchStatus: "INACTIVE" }),
        githubToken: "ghs_test",
        mode: "lite",
        repository: "always0ne/batch",
        requestDigest,
        requestId,
        runAttempt: 1,
      }),
    ).resolves.toMatchObject({
      reasonCode: "BATCH_NOT_ACTIVE",
      result: "DENY",
    });
  });

  it("returns REF_NOT_ALLOWED for workflow ref mismatch", async () => {
    await expect(
      verifyLiteAuthorization({
        actor: "github-actions[bot]",
        approvalRef: requestId,
        approvalSource: "issue",
        batchId,
        configPath: ".batch-governance",
        fetcher: createGateFetchMock({ requestWorkflowRef: "release" }),
        githubToken: "ghs_test",
        mode: "lite",
        repository: "always0ne/batch",
        requestDigest,
        requestId,
        runAttempt: 1,
      }),
    ).resolves.toMatchObject({
      reasonCode: "REF_NOT_ALLOWED",
      result: "DENY",
    });
  });

  it("returns EXECUTION_REQUEST_NOT_APPROVED when label-only approval exists", async () => {
    await expect(
      verifyLiteAuthorization({
        actor: "github-actions[bot]",
        approvalRef: requestId,
        approvalSource: "issue",
        batchId,
        configPath: ".batch-governance",
        fetcher: createGateFetchMock({ comments: [] }),
        githubToken: "ghs_test",
        mode: "lite",
        repository: "always0ne/batch",
        requestDigest,
        requestId,
        runAttempt: 1,
      }),
    ).resolves.toEqual({
      message: "Execution request does not have approved comment evidence.",
      reasonCode: "EXECUTION_REQUEST_NOT_APPROVED",
      result: "DENY",
    });
  });

  it("returns APPROVAL_COMMENT_EDITED for edited approval comments", async () => {
    const editedComment = buildApprovalComment({
      updatedAt: "2026-05-13T01:04:03.000Z",
    });

    await expect(
      verifyLiteAuthorization({
        actor: "github-actions[bot]",
        approvalRef: requestId,
        approvalSource: "issue",
        batchId,
        configPath: ".batch-governance",
        fetcher: createGateFetchMock({ comments: [editedComment] }),
        githubToken: "ghs_test",
        mode: "lite",
        repository: "always0ne/batch",
        requestDigest,
        requestId,
        runAttempt: 1,
      }),
    ).resolves.toEqual({
      message: "Execution approval comment was edited after creation.",
      reasonCode: "APPROVAL_COMMENT_EDITED",
      result: "DENY",
    });
  });

  it("returns REQUEST_DIGEST_MISMATCH when approval digest mismatches", async () => {
    const mismatchedComment = buildApprovalComment({
      commandDigest:
        "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      markerDigest: requestDigest,
    });

    await expect(
      verifyLiteAuthorization({
        actor: "github-actions[bot]",
        approvalRef: requestId,
        approvalSource: "issue",
        batchId,
        configPath: ".batch-governance",
        fetcher: createGateFetchMock({ comments: [mismatchedComment] }),
        githubToken: "ghs_test",
        mode: "lite",
        repository: "always0ne/batch",
        requestDigest,
        requestId,
        runAttempt: 1,
      }),
    ).resolves.toEqual({
      message:
        "Approval command digest does not match execution request digest.",
      reasonCode: "REQUEST_DIGEST_MISMATCH",
      result: "DENY",
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

  it("rejects historical delegated schedule approval evidence for manual execution", async () => {
    await expect(
      verifyLiteAuthorization(
        {
          ...authorizedGateInput(),
          fetcher: createGateFetchMock({
            comments: [
              buildApprovalComment({ approvalType: "SCHEDULE_DELEGATED" }),
            ],
          }),
        },
        verifyApprovedRevision,
      ),
    ).resolves.toMatchObject({
      reasonCode: "SCHEDULE_DELEGATED_APPROVAL_NOT_SUPPORTED",
      result: "DENY",
    });
  });

  it("uses the supplied native Issue number and rejects forged canonical schedule evidence", async () => {
    const native = await createNativeScheduleEvidence();
    const fetcher = createNativeGateFetch(native);
    const nativeResult = await verifyLiteAuthorization(
      native.input(fetcher),
      verifyNativeApprovedRevision,
    );
    expect(nativeResult).toEqual({
      message:
        "Native schedule occurrence and approved Batch revision evidence are verified.",
      result: "ALLOW",
      verifiedSha,
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.github.com/repos/always0ne/batch/issues/71",
      expect.anything(),
    );
    expect(
      fetcher.mock.calls.some(([url]) =>
        String(url).includes("/issues?state=all"),
      ),
    ).toBe(false);

    const forged = createNativeGateFetch({
      ...native,
      issueBody: native.issueBody.replace("payments-platform", "attacker"),
    });
    await expect(
      verifyLiteAuthorization(
        native.input(forged),
        verifyNativeApprovedRevision,
      ),
    ).resolves.toMatchObject({
      reasonCode: "NATIVE_SCHEDULE_REQUEST_UNVERIFIED",
      result: "DENY",
    });
  });

  it("exercises generated business Gate Issue input through exact native verification", async () => {
    const native = await createNativeScheduleEvidence();
    const identity = getNativeScheduleWorkflowJobIdentity({
      scheduleId: "weekday-close",
    });
    const workflow = buildBatchWorkflowYaml(native.batch);

    expect(workflow).toContain(`  ${identity.businessJobId}:`);
    expect(workflow).toContain(
      `          issue-number: \${{ needs.${identity.controlJobId}.outputs.issue-number }}`,
    );
    await expect(
      verifyLiteAuthorization(
        native.input(createNativeGateFetch(native)),
        verifyNativeApprovedRevision,
      ),
    ).resolves.toMatchObject({ result: "ALLOW" });
  });

  it("records a controller-failure DENY in the Gate log without inventing Issue evidence", async () => {
    const eventPath = `/tmp/batchplane-schedule-event-${Date.now()}.json`;
    writeFileSync(eventPath, JSON.stringify({ schedule: "0 5 * * *" }));
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      runGateFromEnv({
        GITHUB_EVENT_NAME: "schedule",
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_JOB: "Schedule Daily close [weekday-close]",
        GITHUB_REPOSITORY: "always0ne/batch",
        GITHUB_REPOSITORY_ID: "99",
        GITHUB_RUN_ATTEMPT: "1",
        GITHUB_RUN_ID: "100",
        GITHUB_WORKFLOW_REF:
          "always0ne/batch/.github/workflows/payment.daily-close.yml@refs/heads/main",
        GITHUB_WORKFLOW_SHA: verifiedSha,
        "INPUT_BATCH-ID": batchId,
        "INPUT_CONTROLLER-REASON": "SCHEDULE_REQUEST_FAILED",
        "INPUT_GATE-JOB-NAME": "Schedule Daily close [weekday-close]",
        "INPUT_GATE-STEP-NAME": "Verify approved native schedule evidence",
        INPUT_MODE: "lite",
        "INPUT_RECORD-EVIDENCE": "true",
        "INPUT_SCHEDULE-ID": "weekday-close",
      }),
    ).resolves.toMatchObject({
      reasonCode: "SCHEDULE_REQUEST_FAILED",
      result: "DENY",
    });
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('"result":"DENY"'),
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('"reasonCode":"SCHEDULE_REQUEST_FAILED"'),
    );
  });

  it("proves a full rerun controller DENY from the real Gate log without a request permit", async () => {
    const eventPath = `/tmp/batchplane-full-rerun-event-${Date.now()}.json`;
    const identity = getNativeScheduleWorkflowJobIdentity({
      scheduleId: "weekday-close",
    });
    writeFileSync(eventPath, JSON.stringify({ schedule: "0 5 * * *" }));
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      runGateFromEnv({
        GITHUB_EVENT_NAME: "schedule",
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_JOB: identity.controlJobId,
        GITHUB_REPOSITORY: "always0ne/batch",
        GITHUB_REPOSITORY_ID: "99",
        GITHUB_RUN_ATTEMPT: "2",
        GITHUB_RUN_ID: "100",
        GITHUB_WORKFLOW_REF:
          "always0ne/batch/.github/workflows/payment.daily-close.yml@refs/heads/main",
        GITHUB_WORKFLOW_SHA: verifiedSha,
        "INPUT_BATCH-ID": batchId,
        "INPUT_GATE-JOB-NAME": identity.controlJobName,
        "INPUT_GATE-STEP-NAME": "Verify approved native schedule evidence",
        INPUT_MODE: "lite",
        "INPUT_RECORD-EVIDENCE": "true",
        "INPUT_SCHEDULE-ID": "weekday-close",
      }),
    ).resolves.toMatchObject({
      reasonCode: "RERUN_NOT_AUTHORIZED",
      result: "DENY",
    });

    const gateLog = log.mock.calls
      .map(([value]) => String(value))
      .find((value) => value.includes("BATCHPLANE_GATE_RESULT"));
    expect(gateLog).toContain('"batchId":"payment.daily-close"');
    expect(gateLog).toContain('"scheduleId":"weekday-close"');
    expect(gateLog).not.toContain('"requestId"');
    expect(gateLog).not.toContain('"requestDigest"');

    const client = {
      getWorkflowJobLog: vi.fn(async () => ({
        content: `${new Date().toISOString()} ${gateLog ?? ""}`,
        jobId: 201,
        sizeBytes: gateLog?.length ?? 0,
        truncated: false,
      })),
      getWorkflowRun: vi.fn(async () => ({
        actor: "github-actions[bot]",
        conclusion: "failure" as const,
        event: "schedule" as const,
        id: 100,
        name: "BatchPlane",
        repositoryId: "99",
        runAttempt: 2,
        status: "completed" as const,
        url: "https://example.test/runs/100",
        workflowId: 1,
        workflowPath,
      })),
      listWorkflowRunJobs: vi.fn(async () => [
        {
          conclusion: "failure" as const,
          id: 201,
          name: identity.controlJobName,
          status: "completed" as const,
          steps: [
            {
              completedAt: new Date().toISOString(),
              conclusion: "failure" as const,
              name: "Verify approved native schedule evidence",
              number: 1,
              startedAt: "2020-01-01T00:00:00.000Z",
              status: "completed" as const,
            },
          ],
        },
      ]),
    } as unknown as GitHubLiteClient;

    await expect(
      inspectNativeScheduleExecution({
        client,
        expectedOccurrence: {
          batchId,
          requestDigest: `sha256:${"c".repeat(64)}`,
          requestId: `btr-schedule-${"d".repeat(64)}`,
          scheduleId: "weekday-close",
        },
        expectedRepositoryId: "99",
        expectedWorkflowPath: workflowPath,
        repository: { owner: "always0ne", repo: "batch" },
        runAttempt: 2,
        runId: 100,
        schedule: { scheduleId: "weekday-close" },
      }),
    ).resolves.toMatchObject({ observation: "BLOCKED" });
  });

  it("sets failing exit code and writes outputs when Gate denies execution", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const outputPath = `/tmp/batchplane-gate-output-${Date.now()}.txt`;
    const summaryPath = `/tmp/batchplane-gate-summary-${Date.now()}.md`;

    await expect(
      runGateFromEnv({
        GITHUB_OUTPUT: outputPath,
        GITHUB_JOB: "batchplane-gate",
        GITHUB_REPOSITORY: "always0ne/batch",
        GITHUB_RUN_ID: "200",
        GITHUB_RUN_ATTEMPT: "1",
        GITHUB_STEP_SUMMARY: summaryPath,
        "INPUT_BATCH-ID": batchId,
        INPUT_MODE: "lite",
      }),
    ).resolves.toMatchObject({
      reasonCode: "EXECUTION_REQUEST_REQUIRED",
      result: "DENY",
    });

    expect(process.exitCode).toBe(1);
    expect(readFileSync(outputPath, "utf8")).toContain("result=DENY");
    expect(readFileSync(summaryPath, "utf8")).toContain(
      "## BatchPlane Gate Result",
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(
        'BATCHPLANE_GATE_RESULT {"gateJob":"batchplane-gate"',
      ),
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('"result":"DENY"'),
    );
  });
});

function buildRequestIssueBody({
  status = "REQUESTED",
  workflowRef = "main",
}: {
  status?: "REQUESTED" | "REJECTED";
  workflowRef?: string;
} = {}): string {
  return [
    "## BatchPlane Execution Request",
    "",
    `- Request ID: \`${requestId}\``,
    `- Batch ID: \`${batchId}\``,
    "- Requested by: @developer",
    "- Requested at: 2026-05-13T01:02:03.000Z",
    "- Expires at: 2026-05-13T02:02:03.000Z",
    `- Request digest: \`${requestDigest}\``,
    `- Status: ${status}`,
    "",
    "```json",
    JSON.stringify(
      {
        apiVersion: "batchplane.io/v1",
        kind: "ExecutionRequest",
        metadata: { batchId, requestId },
        spec: {
          approvedBatchRevision: {
            governedChangeId: sharedGovernedChangeId,
            targetRevisionDigest: sharedTargetRevisionDigest,
          },
          requestedBy: "developer",
          workflow: {
            path: workflowPath,
            ref: workflowRef,
          },
        },
      },
      null,
      2,
    ),
    "```",
    "",
    "<!-- batchplane:execution-request",
    `requestId=${requestId}`,
    `batchId=${batchId}`,
    `requestDigest=${requestDigest}`,
    `status=${status}`,
    "-->",
  ].join("\n");
}

function authorizedGateInput(options: { workflowSha?: string } = {}) {
  const workflowSha =
    "workflowSha" in options ? options.workflowSha : verifiedSha;

  return {
    actor: "github-actions[bot]",
    approvalRef: requestId,
    approvalSource: "issue",
    batchId,
    configPath: ".batch-governance",
    fetcher: createGateFetchMock(),
    githubToken: "ghs_test",
    mode: "lite",
    repository: "always0ne/batch",
    requestDigest,
    requestId,
    runAttempt: 1,
    ...(workflowSha ? { workflowSha } : {}),
  };
}

function buildApprovalComment({
  approvalType,
  approver = "maintainer",
  commandDigest = requestDigest,
  createdAt = "2026-05-13T01:03:03.000Z",
  markerDigest = requestDigest,
  updatedAt = "2026-05-13T01:03:03.000Z",
}: {
  approvalType?: string;
  approver?: string;
  commandDigest?: string;
  createdAt?: string;
  markerDigest?: string;
  updatedAt?: string;
} = {}): {
  body: string;
  created_at: string;
  updated_at: string;
  user: { login: string };
} {
  return {
    body: [
      `/bgcp approve requestDigest=${commandDigest}`,
      "",
      "## BatchPlane Execution Approval",
      "",
      "- Decision: APPROVED",
      `- Approver: @${approver}`,
      "- Approved at: 2026-05-13T01:03:03.000Z",
      ...(approvalType ? [`- Approval type: ${approvalType}`] : []),
      `- Request ID: \`${requestId}\``,
      `- Batch ID: \`${batchId}\``,
      `- Request digest: \`${markerDigest}\``,
      "",
      "<!-- batchplane:execution-approval",
      "decision=APPROVED",
      `requestId=${requestId}`,
      `batchId=${batchId}`,
      `requestDigest=${markerDigest}`,
      ...(approvalType ? [`approvalType=${approvalType}`] : []),
      "-->",
    ].join("\n"),
    created_at: createdAt,
    updated_at: updatedAt,
    user: { login: approver },
  };
}

function buildBatchDefinitionYaml({
  gateRequired = true,
  status = "ACTIVE",
  workflowRef = "main",
}: {
  gateRequired?: boolean;
  status?: "ACTIVE" | "INACTIVE";
  workflowRef?: string;
} = {}): string {
  return [
    'apiVersion: "batchplane.io/v1"',
    'kind: "BatchDefinition"',
    "metadata:",
    `  id: ${JSON.stringify(batchId)}`,
    '  name: "Daily Close"',
    "spec:",
    '  owner: "ops-team"',
    '  domain: "payments"',
    '  environment: "PROD"',
    '  criticality: "HIGH"',
    `  status: ${JSON.stringify(status)}`,
    `  gateRequired: ${gateRequired ? "true" : "false"}`,
    "  workflow:",
    `    path: ${JSON.stringify(workflowPath)}`,
    `    ref: ${JSON.stringify(workflowRef)}`,
    "  execution:",
    '    runsOn: "ubuntu-latest"',
    '    command: "echo run"',
  ].join("\n");
}

function buildRoleMappingYamlWithRoles(repositoryRoles: string[]): string {
  return [
    'apiVersion: "batchplane.io/v1"',
    'kind: "RoleMapping"',
    "metadata:",
    '  id: "default"',
    "spec:",
    "  roles:",
    "    requester:",
    '      githubUsers: ["developer"]',
    "    approver:",
    `      repositoryRoles: ${JSON.stringify(repositoryRoles)}`,
    "    maintainer:",
    '      repositoryRoles: ["admin", "maintain"]',
    "    auditor:",
    '      repositoryRoles: ["triage"]',
  ].join("\n");
}

function buildWorkspacePolicyYaml(mode: WorkspaceApprovalMode) {
  return [
    'apiVersion: "batchplane.io/v1"',
    'kind: "WorkspacePolicy"',
    "metadata:",
    '  id: "default"',
    "spec:",
    "  approval:",
    `    mode: ${JSON.stringify(mode)}`,
  ].join("\n");
}

async function createNativeScheduleEvidence() {
  const nativeBatch: BatchDefinition = {
    batchId,
    criticality: "HIGH",
    domain: "payments",
    environment: "PROD",
    execution: { command: "echo run", runsOn: "ubuntu-latest" },
    gateRequired: true,
    name: "Daily Close",
    owner: "payments-platform",
    schedules: [
      {
        cron: "0 5 * * *",
        enabled: true,
        name: "Daily close",
        scheduleId: "weekday-close",
        timezone: "Asia/Seoul",
      },
    ],
    status: "ACTIVE",
    workflow: { path: workflowPath, ref: "main" },
  };
  const issue = await buildExecutionRequestIssue({
    approvedBatchRevision: {
      governedChangeId: "GC-42",
      targetRevisionDigest: `sha256:${"b".repeat(64)}`,
    },
    batch: nativeBatch,
    requestedAt: new Date("2026-01-02T03:04:05.000Z"),
    requestedBy: "github-actions[bot]",
    schedule: {
      definitionCommitSha: verifiedSha,
      definitionPath: `.batch-governance/batches/${batchId}.yml`,
      repositoryId: "99",
      scheduleId: "weekday-close",
      sourceRunAttempt: 1,
      sourceRunId: "100",
    },
    triggerType: "SCHEDULE",
  });
  const batchYaml = serializeBatchDefinitionYaml(nativeBatch);
  return {
    batch: nativeBatch,
    batchYaml,
    input: (fetcher: typeof fetch) => ({
      batchId,
      configPath: ".batch-governance",
      eventName: "schedule",
      eventSchedule: "0 5 * * *",
      fetcher,
      githubToken: "ghs_test",
      issueNumber: "71",
      mode: "lite",
      repository: "always0ne/batch",
      repositoryId: "99",
      requestDigest: issue.request.requestDigest,
      requestId: issue.request.requestId,
      runAttempt: 1,
      scheduleId: "weekday-close",
      sourceRunId: "100",
      workflowPath,
      workflowRef: "main",
      workflowSha: verifiedSha,
    }),
    issueBody: issue.body,
  };
}

async function verifyNativeApprovedRevision() {
  return {
    approvedRevision: {
      governedChangeId: "GC-42",
      targetRevisionDigest: `sha256:${"b".repeat(64)}`,
    },
    controlStatus: "VERIFIED" as const,
    verifiedSha,
  };
}

function createNativeGateFetch(native: {
  batchYaml: string;
  issueBody: string;
}) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/repos/always0ne/batch/issues/71")) {
      return Response.json({ body: native.issueBody, number: 71 });
    }
    if (url.includes(`/contents/.batch-governance/batches/${batchId}.yml`)) {
      return Response.json({
        content: Buffer.from(native.batchYaml).toString("base64"),
        encoding: "base64",
        path: `.batch-governance/batches/${batchId}.yml`,
      });
    }
    return Response.json(
      { message: `Unexpected URL: ${url}` },
      { status: 404 },
    );
  }) as unknown as ReturnType<typeof vi.fn<typeof fetch>>;
}

function createGateFetchMock({
  approverRepositoryRoles = ["maintain"],
  batchStatus = "ACTIVE",
  comments = [buildApprovalComment()],
  includeWorkspacePolicy = false,
  includeBatchDefinition = true,
  includeRoleMapping = true,
  requestIssueBody,
  requestWorkflowRef = "main",
  workspaceApprovalMode = "SELF_APPROVAL_BLOCKED",
}: {
  approverRepositoryRoles?: string[];
  batchStatus?: "ACTIVE" | "INACTIVE";
  comments?: Array<{
    body: string;
    created_at?: string;
    updated_at?: string;
    user?: { login?: string };
  }>;
  includeWorkspacePolicy?: boolean;
  includeBatchDefinition?: boolean;
  includeRoleMapping?: boolean;
  requestIssueBody?: string;
  requestWorkflowRef?: string;
  workspaceApprovalMode?: WorkspaceApprovalMode;
} = {}): typeof fetch {
  const issueBody =
    requestIssueBody ??
    buildRequestIssueBody({ workflowRef: requestWorkflowRef });
  const batchDefinitionYaml = buildBatchDefinitionYaml({ status: batchStatus });
  const roleMappingYaml = buildRoleMappingYamlWithRoles(
    approverRepositoryRoles,
  );

  return (async (input: RequestInfo | URL) => {
    const url = input.toString();

    if (
      url.endsWith(
        "/repos/always0ne/batch/issues?state=all&per_page=100&page=1",
      )
    ) {
      return Response.json([
        {
          body: issueBody,
          labels: [],
          number: 34,
          state: "open",
          title: "Run batch payment.daily-close",
        },
      ]);
    }

    if (
      url.endsWith(
        "/repos/always0ne/batch/issues?state=all&per_page=100&page=2",
      )
    ) {
      return Response.json([]);
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

    if (
      url.includes(
        "/repos/always0ne/batch/contents/.batch-governance/batches/payment.daily-close.yml",
      )
    ) {
      if (!includeBatchDefinition) {
        return Response.json({ message: "Not Found" }, { status: 404 });
      }

      return Response.json({
        content: Buffer.from(batchDefinitionYaml).toString("base64"),
        encoding: "base64",
        path: ".batch-governance/batches/payment.daily-close.yml",
      });
    }

    if (
      url.includes(
        "/repos/always0ne/batch/contents/.batch-governance/policies/role-mapping.yml",
      )
    ) {
      if (!includeRoleMapping) {
        return Response.json({ message: "Not Found" }, { status: 404 });
      }

      return Response.json({
        content: Buffer.from(roleMappingYaml).toString("base64"),
        encoding: "base64",
        path: ".batch-governance/policies/role-mapping.yml",
      });
    }

    if (
      url.includes(
        "/repos/always0ne/batch/contents/.batch-governance/workspace.yml",
      )
    ) {
      if (!includeWorkspacePolicy) {
        return Response.json({ message: "Not Found" }, { status: 404 });
      }

      return Response.json({
        content: Buffer.from(
          buildWorkspacePolicyYaml(workspaceApprovalMode),
        ).toString("base64"),
        encoding: "base64",
        path: ".batch-governance/workspace.yml",
      });
    }

    if (
      url.endsWith("/repos/always0ne/batch/collaborators/maintainer/permission")
    ) {
      return Response.json({
        permission: "admin",
        role_name: "maintain",
        user: {
          login: "maintainer",
        },
      });
    }

    if (
      url.endsWith("/repos/always0ne/batch/collaborators/developer/permission")
    ) {
      return Response.json({
        permission: "write",
        role_name: "write",
        user: {
          login: "developer",
        },
      });
    }

    return Response.json(
      { message: `Unexpected URL: ${url}` },
      { status: 404 },
    );
  }) as typeof fetch;
}
