import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

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
  sharedRequestDigest as requestDigest,
  sharedRequestId as requestId,
} from "../../../test/fixtures/execution-evidence";
import {
  parseExecutionApprovalEvidence,
  parseExecutionRequestEvidence,
} from "../../dispatcher/src";
import type { WorkspaceApprovalMode } from "./gate-schema";
const workflowPath = ".github/workflows/payment.daily-close.yml";

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
      message: "Execution request evidence is present.",
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
      verifyLiteAuthorization({
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
      }),
    ).resolves.toEqual({
      message:
        "Execution request, approval evidence, and batch policy are verified.",
      result: "ALLOW",
    });
  });

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
      verifyLiteAuthorization({
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
      }),
    ).resolves.toEqual({
      message:
        "Execution request, approval evidence, and batch policy are verified.",
      result: "ALLOW",
    });
  });

  it("denies self-approval when Workspace policy is missing or strict", async () => {
    await expect(
      verifyLiteAuthorization({
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
      }),
    ).resolves.toEqual({
      message: "Requester and approver must be different users.",
      reasonCode: "SELF_APPROVAL_NOT_ALLOWED",
      result: "DENY",
    });
  });

  it("allows self-approval only when Workspace policy explicitly allows it", async () => {
    await expect(
      verifyLiteAuthorization({
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
      }),
    ).resolves.toEqual({
      message:
        "Execution request, approval evidence, and batch policy are verified.",
      result: "ALLOW",
    });
  });

  it("allows explicit Workspace self-approval without role mapping", async () => {
    await expect(
      verifyLiteAuthorization({
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
      }),
    ).resolves.toEqual({
      message:
        "Execution request, approval evidence, and batch policy are verified.",
      result: "ALLOW",
    });
  });

  it("treats AUTO_APPROVE as including manual self-approval permission", async () => {
    await expect(
      verifyLiteAuthorization({
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
      }),
    ).resolves.toEqual({
      message:
        "Execution request, approval evidence, and batch policy are verified.",
      result: "ALLOW",
    });
  });

  it("allows Workspace auto-approval only when policy explicitly enables it", async () => {
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
      }),
    ).resolves.toEqual({
      message:
        "Execution request, Workspace auto-approval evidence, and batch policy are verified.",
      result: "ALLOW",
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

  it("sets failing exit code and writes outputs when Gate denies execution", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const outputPath = `/tmp/batchplane-gate-output-${Date.now()}.txt`;
    const summaryPath = `/tmp/batchplane-gate-summary-${Date.now()}.md`;

    await expect(
      runGateFromEnv({
        GITHUB_OUTPUT: outputPath,
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
