import type {
  BatchDefinition,
  BatchPlaneRuntimePorts,
  ExecutionRun,
  RepositoryIssue,
  RepositoryPullRequest,
} from "@batchplane/domain";
import {
  buildExecutionRequestIssue,
  governedChangeEvidenceVersion,
  type GovernedChangeRequestEvidence,
} from "@batchplane/domain";
import { isExecutionRequestCreationUnavailableError } from "@batchplane/ui-client";
import { describe, expect, it, vi } from "vitest";

import { createGitHubLiteExecutionApprovalClient } from "./execution-approval-client.js";
import { buildGovernedChangeRequestBody } from "./governed-change-evidence.js";

const draft = {
  approvedBatchRevision: {
    governedChangeId: "bgc-payment-daily-close",
    targetRevisionDigest: "sha256:approved",
  },
  batch: {
    batchId: "payment.daily-close",
    criticality: "HIGH",
    domain: "payments",
    environment: "PROD",
    execution: { command: "echo close", runsOn: "ubuntu-latest" },
    gateRequired: true,
    name: "Daily Close",
    owner: "ops",
    status: "ACTIVE" as const,
    workflowPath: ".github/workflows/payment.daily-close.yml",
    workflowRef: "main",
  },
  creationCapability: { canCreate: true, unavailableReasons: [] },
  requestId: "btr-20260911090000-payment.daily-close-abcdefgh",
  requestedAt: "2026-09-11T09:00:00.000Z",
  requestedBy: "developer",
  workspaceApprovalMode: "AUTO_APPROVE" as const,
  workspaceLabel: "always0ne/batch",
};

describe("GitHub Lite execution approval client", () => {
  it("returns a named not-found outcome when the loaded batch is absent", async () => {
    const runtime = createRuntime({ batchDefinitions: [] });
    const client = createGitHubLiteExecutionApprovalClient({ runtime });

    await expect(
      client.loadExecutionRequestDraft({ batchId: "missing.batch" }),
    ).resolves.toEqual({ batchId: "missing.batch", type: "not-found" });
  });

  it("projects creation readiness and rejects a direct create that bypasses it", async () => {
    const runtime = createRuntime({
      batchDefinitions: [
        {
          ...batchDefinition(),
          execution: { command: "", runsOn: "ubuntu-latest" },
          gateRequired: false,
          status: "INACTIVE",
        },
      ],
    });
    const client = createGitHubLiteExecutionApprovalClient({ runtime });
    const result = await client.loadExecutionRequestDraft({
      batchId: "payment.daily-close",
    });

    expect(result).toMatchObject({
      draft: {
        creationCapability: {
          canCreate: false,
          unavailableReasons: [
            "BATCH_INACTIVE",
            "GATE_NOT_REQUIRED",
            "EXECUTION_COMMAND_UNAVAILABLE",
          ],
        },
      },
      type: "ready",
    });
    if (result.type !== "ready") throw new Error("expected a draft");

    await client
      .createExecutionRequest({
        draft: result.draft,
        expiresAt: "2026-09-11T10:00:00.000Z",
        parameters: [],
        reason: "Close after reconciliation.",
        workflowRef: "main",
      })
      .then(
        () => {
          throw new Error("expected creation to be unavailable");
        },
        (error: unknown) => {
          expect(isExecutionRequestCreationUnavailableError(error)).toBe(true);
        },
      );
    expect(runtime.executions.createExecutionRequest).not.toHaveBeenCalled();
  });

  it("previews from the loaded draft without another runtime read", async () => {
    const runtime = createRuntime();
    const client = createGitHubLiteExecutionApprovalClient({ runtime });

    await expect(
      client.previewExecutionRequest({
        draft,
        expiresAt: "2026-09-11T10:00:00.000Z",
        parameters: [],
        reason: "Close after reconciliation.",
        workflowRef: "main",
      }),
    ).resolves.toMatchObject({
      request: {
        batchId: "payment.daily-close",
        evidence: { approvedBatchRevision: draft.approvedBatchRevision },
        requestId: draft.requestId,
      },
    });
    expect(runtime.settings.getRepository).not.toHaveBeenCalled();
    expect(runtime.executions.getApprovedBatchRevision).not.toHaveBeenCalled();
  });

  it("projects AUTO_APPROVE from the returned Issue and approval comment", async () => {
    const issue = createIssue();
    const runtime = createRuntime({
      createExecutionRequest: vi.fn().mockResolvedValue(issue),
    });
    const client = createGitHubLiteExecutionApprovalClient({ runtime });

    const result = await client.createExecutionRequest({
      draft,
      expiresAt: "2026-09-11T10:00:00.000Z",
      parameters: [],
      reason: "Close after reconciliation.",
      workflowRef: "main",
    });

    expect(result.request.status).toBe("APPROVED");
    expect(result.request.approvalDecision).toMatchObject({
      source: "WORKSPACE_POLICY",
    });
    expect(result.request.approvalNotice).toEqual({
      kind: "SELF_APPROVAL_ALLOWED",
      mode: "AUTO_APPROVE",
    });
    expect(runtime.approvals.getExecutionRequestIssue).not.toHaveBeenCalled();
    expect(runtime.approvals.listExecutionRequestIssues).not.toHaveBeenCalled();
  });

  it("keeps a self-request visible in the approval inventory with a disabled approve capability", async () => {
    const issue = createIssue();
    const runtime = createRuntime({
      listExecutionRequestIssues: vi.fn().mockResolvedValue([issue]),
      workspaceApprovalMode: "SELF_APPROVAL_BLOCKED",
    });
    const client = createGitHubLiteExecutionApprovalClient({ runtime });

    await expect(client.listApprovalRequests()).resolves.toMatchObject({
      requests: [
        {
          kind: "EXECUTION",
          request: {
            capability: {
              approveUnavailableReason: "SELF_APPROVAL_BLOCKED",
              canApprove: false,
              canReject: true,
            },
          },
        },
      ],
    });
  });

  it("projects the self-approval-allowed notice from current policy and actor", async () => {
    const issue = createIssue();
    const runtime = createRuntime({
      listExecutionRequestIssues: vi.fn().mockResolvedValue([issue]),
      workspaceApprovalMode: "SELF_APPROVAL_ALLOWED",
    });
    const client = createGitHubLiteExecutionApprovalClient({ runtime });

    await expect(client.listApprovalRequests()).resolves.toMatchObject({
      requests: [
        {
          kind: "EXECUTION",
          request: {
            approvalNotice: {
              kind: "SELF_APPROVAL_ALLOWED",
              mode: "SELF_APPROVAL_ALLOWED",
            },
          },
        },
      ],
    });
  });

  it("excludes closed pending issues from the approval inventory", async () => {
    const runtime = createRuntime({
      listExecutionRequestIssues: vi
        .fn()
        .mockResolvedValue([{ ...createIssue(), state: "closed" }]),
    });
    const client = createGitHubLiteExecutionApprovalClient({ runtime });

    await expect(client.listApprovalRequests()).resolves.toEqual({
      requests: [],
      workspaceDefaultBranch: "main",
    });
  });

  it("keeps the raw source title on workspace inventory rows", async () => {
    const runtime = createRuntime({
      listExecutionRequestIssues: vi.fn().mockResolvedValue([createIssue()]),
    });
    const client = createGitHubLiteExecutionApprovalClient({ runtime });

    await expect(client.listWorkspaceRequests()).resolves.toMatchObject({
      requests: [
        {
          kind: "EXECUTION",
          request: { title: "#71 Run batch payment.daily-close" },
          title: "Run batch payment.daily-close",
        },
      ],
    });
  });

  it("projects the exact existing governed change locator for a matching approved revision", async () => {
    const issue = await createCanonicalIssue();
    const runtime = createRuntime({
      getExecutionRequestIssue: vi.fn().mockResolvedValue(issue),
      listRegistrationRequests: vi.fn().mockResolvedValue([sourceChange()]),
    });
    const client = createGitHubLiteExecutionApprovalClient({ runtime });

    await expect(
      client.getExecutionRequest({ requestLocator: "71" }),
    ).resolves.toMatchObject({
      evidence: {
        sourceChange: { label: "PR #42", requestLocator: "42" },
      },
    });
  });

  it.each([
    { targetRevisionDigest: "sha256:other" },
    { batchId: "other.batch" },
    { governedChangeId: "bgc-other" },
  ])(
    "keeps mismatched source evidence inspectable without a link: %j",
    async (mismatch) => {
      const issue = await createCanonicalIssue();
      const runtime = createRuntime({
        getExecutionRequestIssue: vi.fn().mockResolvedValue(issue),
        listRegistrationRequests: vi
          .fn()
          .mockResolvedValue([sourceChange(mismatch)]),
      });
      const client = createGitHubLiteExecutionApprovalClient({ runtime });

      const result = await client.getExecutionRequest({ requestLocator: "71" });

      expect(result?.evidence.approvedBatchRevision).toEqual(
        draft.approvedBatchRevision,
      );
      expect(result?.evidence.sourceChange).toBeUndefined();
    },
  );

  it.each([[], [sourceChange(), { ...sourceChange(), number: 43 }]])(
    "does not choose a source link when the matching record is missing or ambiguous",
    async (...records) => {
      const runtime = createRuntime({
        getExecutionRequestIssue: vi
          .fn()
          .mockResolvedValue(await createCanonicalIssue()),
        listRegistrationRequests: vi.fn().mockResolvedValue(records),
      });
      const client = createGitHubLiteExecutionApprovalClient({ runtime });
      expect(
        (await client.getExecutionRequest({ requestLocator: "71" }))?.evidence
          .sourceChange,
      ).toBeUndefined();
    },
  );

  it("surfaces a source lookup failure instead of silently claiming no matching change", async () => {
    const runtime = createRuntime({
      getExecutionRequestIssue: vi
        .fn()
        .mockResolvedValue(await createCanonicalIssue()),
      listRegistrationRequests: vi
        .fn()
        .mockRejectedValue(new Error("Source lookup unavailable")),
    });
    await expect(
      createGitHubLiteExecutionApprovalClient({ runtime }).getExecutionRequest({
        requestLocator: "71",
      }),
    ).rejects.toThrow("Source lookup unavailable");
  });

  it("keeps a stable product locator for each failure follow-up work item", async () => {
    const runtime = createRuntime({
      executionRuns: [
        {
          batchId: "payment.daily-close",
          failureFollowUps: [
            {
              actionTaken: "Updated the evidence.",
              author: "developer",
              batchId: "payment.daily-close",
              createdAt: "2026-09-11T09:02:00.000Z",
              explanation: "The ledger file was delayed.",
              followUpId: "follow-up-1",
              owner: "developer",
              requestId: draft.requestId,
              reviewStatus: "CHANGES_REQUESTED",
              reviews: [],
              runId: "run-1",
              status: "RESOLVED",
            },
          ],
          requestId: draft.requestId,
          runId: "run-1",
          status: "FAILED",
        },
      ],
    });
    const client = createGitHubLiteExecutionApprovalClient({ runtime });

    await expect(client.getMyWork()).resolves.toMatchObject({
      items: [
        {
          action: "UPDATE_FOLLOW_UP",
          itemLocator: "follow-up:follow-up-1",
          itemType: "FAILURE_FOLLOW_UP",
        },
      ],
    });
  });

  it("keeps legacy execution work ordering timestamps", async () => {
    const requested = {
      ...createIssue(),
      createdAt: "2026-09-11T08:00:00.000Z",
      updatedAt: "2026-09-11T11:00:00.000Z",
    };
    const missingRequestedAt = {
      ...createIssue(),
      body: createIssue().body.replace(
        "- Requested at: 2026-09-11T09:00:00.000Z\n",
        "",
      ),
      createdAt: "2026-09-11T08:30:00.000Z",
      number: 72,
      updatedAt: "2026-09-11T10:00:00.000Z",
    };
    const runtime = createRuntime({
      listExecutionRequestIssues: vi
        .fn()
        .mockResolvedValue([requested, missingRequestedAt]),
    });
    const client = createGitHubLiteExecutionApprovalClient({ runtime });
    const result = await client.getMyWork();
    const executionWorkItems = result.items.flatMap((item) => {
      if (
        item.itemType !== "REQUESTED_BY_YOU" ||
        item.request.kind !== "EXECUTION"
      ) {
        return [];
      }

      return [
        {
          occurredAt: item.occurredAt,
          requestLocator: item.request.request.requestLocator,
        },
      ];
    });

    expect(executionWorkItems).toEqual([
      {
        occurredAt: "2026-09-11T09:00:00.000Z",
        requestLocator: "71",
      },
      {
        occurredAt: "2026-09-11T10:00:00.000Z",
        requestLocator: "72",
      },
    ]);
  });

  it("returns the created pending request when AUTO_APPROVE recording fails", async () => {
    const issue = createIssue();
    const runtime = createRuntime({
      createExecutionRequest: vi.fn().mockResolvedValue(issue),
    });
    runtime.approvals.approveExecution = vi
      .fn()
      .mockRejectedValue(new Error("comment write failed"));
    const client = createGitHubLiteExecutionApprovalClient({ runtime });

    await expect(
      client.createExecutionRequest({
        draft,
        expiresAt: "2026-09-11T10:00:00.000Z",
        parameters: [],
        reason: "Close after reconciliation.",
        workflowRef: "main",
      }),
    ).resolves.toMatchObject({
      postCreateError: { code: "AUTO_APPROVAL_RECORDING_FAILED" },
      request: { requestId: draft.requestId, status: "REQUESTED" },
    });
    expect(runtime.approvals.getExecutionRequestIssue).not.toHaveBeenCalled();
    expect(runtime.approvals.listExecutionRequestIssues).not.toHaveBeenCalled();
  });
});

function createRuntime({
  batchDefinitions = [batchDefinition()],
  createExecutionRequest = vi
    .fn()
    .mockImplementation(async () => createIssue()),
  getExecutionRequestIssue = vi.fn(),
  listExecutionRequestIssues = vi.fn().mockResolvedValue([]),
  listRegistrationRequests = vi.fn().mockResolvedValue([]),
  executionRuns = [],
  workspaceApprovalMode = "AUTO_APPROVE",
}: {
  batchDefinitions?: BatchDefinition[];
  createExecutionRequest?: ReturnType<typeof vi.fn>;
  executionRuns?: ExecutionRun[];
  getExecutionRequestIssue?: ReturnType<typeof vi.fn>;
  listExecutionRequestIssues?: ReturnType<typeof vi.fn>;
  listRegistrationRequests?: ReturnType<typeof vi.fn>;
  workspaceApprovalMode?:
    | "AUTO_APPROVE"
    | "SELF_APPROVAL_ALLOWED"
    | "SELF_APPROVAL_BLOCKED";
} = {}): BatchPlaneRuntimePorts {
  return {
    approvals: {
      approveExecution: vi.fn().mockImplementation(async ({ body }) => ({
        author: "developer",
        body,
        createdAt: "2026-09-11T09:01:00.000Z",
        id: 12,
        issueNumber: 71,
      })),
      getExecutionRequestIssue,
      listExecutionRequestComments: vi.fn().mockResolvedValue([]),
      listExecutionRequestIssues,
      listRegistrationRequests,
    },
    executions: {
      createExecutionRequest,
      getApprovedBatchRevision: vi.fn(),
      listExecutionRuns: vi.fn().mockResolvedValue(executionRuns),
    },
    batches: {
      listBatchDefinitions: vi.fn().mockResolvedValue(batchDefinitions),
    },
    settings: {
      getCurrentUser: vi.fn().mockResolvedValue({ login: "developer" }),
      getRepository: vi.fn().mockResolvedValue({ defaultBranch: "main" }),
      getWorkspacePolicy: vi.fn().mockResolvedValue({
        approval: { mode: workspaceApprovalMode },
      }),
    },
  } as unknown as BatchPlaneRuntimePorts;
}

function batchDefinition(): BatchDefinition {
  return {
    batchId: "payment.daily-close",
    criticality: "HIGH",
    domain: "payments",
    environment: "PROD",
    execution: { command: "echo close", runsOn: "ubuntu-latest" },
    gateRequired: true,
    name: "Daily Close",
    owner: "ops",
    status: "ACTIVE",
    workflow: {
      path: ".github/workflows/payment.daily-close.yml",
      ref: "main",
    },
  };
}

function createIssue(): RepositoryIssue {
  return {
    author: "developer",
    body: [
      "## BatchPlane Execution Request",
      "",
      `- Request ID: \`${draft.requestId}\``,
      "- Batch ID: `payment.daily-close`",
      "- Requested by: @developer",
      "- Requested at: 2026-09-11T09:00:00.000Z",
      "- Expires at: 2026-09-11T10:00:00.000Z",
      "- Request digest: `sha256:request`",
      "- Status: REQUESTED",
      "",
      "<!-- batchplane:execution-request",
      `requestId=${draft.requestId}`,
      "batchId=payment.daily-close",
      "requestDigest=sha256:request",
      "status=REQUESTED",
      "-->",
    ].join("\n"),
    isPullRequest: false,
    labels: [],
    number: 71,
    state: "open",
    title: "Run batch payment.daily-close",
    url: "https://example.test/issues/71",
  };
}

async function createCanonicalIssue(): Promise<RepositoryIssue> {
  const built = await buildExecutionRequestIssue({
    approvedBatchRevision: draft.approvedBatchRevision,
    batch: batchDefinition(),
    expiresAt: new Date("2026-09-11T10:00:00.000Z"),
    reason: "Close after reconciliation.",
    requestId: draft.requestId,
    requestedAt: new Date("2026-09-11T09:00:00.000Z"),
    requestedBy: "developer",
    workflowRef: "main",
  });

  return {
    ...createIssue(),
    body: built.body,
    title: built.title,
  };
}

function sourceChange(
  overrides: Partial<GovernedChangeRequestEvidence> = {},
): RepositoryPullRequest {
  const evidence: GovernedChangeRequestEvidence = {
    artifacts: [],
    baseRevisionSha: "base-sha",
    batchId: "payment.daily-close",
    governedChangeId: draft.approvedBatchRevision.governedChangeId,
    headRevisionSha: "head-sha",
    repository: "always0ne/batch",
    requestedAt: "2026-09-11T08:00:00.000Z",
    requester: "developer",
    targetRevisionDigest: draft.approvedBatchRevision.targetRevisionDigest,
    type: "CHANGE",
    version: governedChangeEvidenceVersion,
    workspace: "always0ne/batch",
    ...overrides,
  };

  return {
    author: "developer",
    base: "main",
    body: buildGovernedChangeRequestBody(evidence),
    head: "batchplane/change/payment.daily-close",
    merged: true,
    number: 42,
    state: "closed",
    title: "Change batch payment.daily-close",
    url: "https://example.test/pulls/42",
  };
}
