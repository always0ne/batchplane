import type { GitHubLiteClient } from "./github-types.js";
import { verifyApprovedBatchRevision } from "./approved-batch-revision.js";
import * as batchRepository from "./batch-repository.js";
import { listExecutionRunFacts } from "./execution-run-client.js";
import { createGitHubLiteMockState } from "./mock-state.js";
import { createMockGitHubLiteClient } from "./mock-client.js";
import { serializeBatchDefinitionYaml } from "./batch-definition-codec.js";
import {
  buildRoleMappingYaml,
  buildWorkspacePolicyYaml,
} from "./workspace-installation-templates.js";
vi.mock("./approved-batch-revision.js", () => ({
  verifyApprovedBatchRevision: vi.fn(),
}));
vi.mock("./execution-run-client.js", () => ({
  listExecutionRunFacts: vi.fn(),
}));
import type { ExecutionRun } from "@batchplane/domain";
import { createRequestDigest, type CanonicalValue } from "@batchplane/digest";
import { buildExecutionRequestIssue } from "./execution-request-evidence.js";
import type { GitHubBatchDefinition } from "./github-batch-definition.js";
import type {
  RepositoryIssue,
  RepositoryPullRequest,
} from "./repository-evidence-types.js";
import { isExecutionRequestCreationUnavailableError } from "@batchplane/ui-client";
import { describe, expect, it, vi } from "vitest";

import { createGitHubLiteExecutionApprovalClient } from "./execution-approval-client.js";
import {
  buildExecutionApprovalComment,
  parseExecutionRequestDetail,
} from "./execution-approval-legacy.js";
import { stringifyRepositoryYaml } from "./repository-yaml.js";
import { loadHistoricalWorkspacePolicy } from "./workspace-authorization.js";
import {
  buildChangeRequestBody,
  changeRequestEvidenceVersion,
  type ChangeRequestEvidence,
} from "./change-request-evidence.js";

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
    executionTarget: {
      command: "echo close",
      executionEnvironment: "ubuntu-latest",
      platformName: "GitHub Actions",
      targetName: ".github/workflows/payment.daily-close.yml",
      targetRevision: "main",
    },
    gateRequired: true,
    name: "Daily Close",
    owner: "ops",
    status: "ACTIVE" as const,
  },
  creationCapability: { canCreate: true, unavailableReasons: [] },
  requestId: "btr-20260911090000-payment.daily-close-abcdefgh",
  requestedAt: "2026-09-11T09:00:00.000Z",
  requestedBy: "developer",
  workspaceApprovalMode: "AUTO_APPROVE" as const,
  workspaceLabel: "always0ne/batch",
};

describe("GitHub Lite execution approval client", () => {
  it("defaults only a missing policy and rejects present malformed policy in the shared revision reader", async () => {
    const context = createContext();
    const policy = context.client.state.files.find((file) =>
      file.path.endsWith("workspace.yml"),
    )!;
    for (const content of ["spec: [", "kind: WrongPolicy"]) {
      policy.content = content;
      await expect(
        loadHistoricalWorkspacePolicy(
          context.client,
          context.repositoryRef,
          "mock-main-sha",
        ),
      ).rejects.toThrow();
    }
    context.client.state.files = context.client.state.files.filter(
      (file) => file !== policy,
    );
    await expect(
      loadHistoricalWorkspacePolicy(
        context.client,
        context.repositoryRef,
        "mock-main-sha",
      ),
    ).resolves.toEqual({ approval: { mode: "SELF_APPROVAL_BLOCKED" } });
  });
  it("denies both decisions to an actor without an approver role and revalidates commands after a permitted read", async () => {
    const context = createContext({
      getExecutionRequestIssue: vi.fn().mockResolvedValue(createIssue()),
    });
    const product = createGitHubLiteExecutionApprovalClient(context);
    expect(
      (await product.getExecutionRequest({ requestLocator: "71" }))?.capability,
    ).toMatchObject({ canApprove: true, canReject: true });
    const policy = context.client.state.files.find((file) =>
      file.path.endsWith("workspace.yml"),
    )!;
    policy.content = buildWorkspacePolicyYaml("SELF_APPROVAL_BLOCKED");
    await expect(
      product.approveExecutionRequest({ requestLocator: "71" }),
    ).rejects.toThrow("not currently approvable");
    expect(
      (await product.getExecutionRequest({ requestLocator: "71" }))?.capability,
    ).toMatchObject({
      canApprove: false,
      canReject: true,
      approveUnavailableReason: "SELF_APPROVAL_BLOCKED",
    });
    policy.content = buildWorkspacePolicyYaml("AUTO_APPROVE");
    context.client.state.repositoryPermissions = [
      { username: "developer", permission: "write", roleName: "write" },
    ];
    expect(
      (await product.getExecutionRequest({ requestLocator: "71" }))?.capability,
    ).toEqual({
      canApprove: false,
      canReject: false,
      approveUnavailableReason: "APPROVER_ROLE_REQUIRED",
      rejectUnavailableReason: "APPROVER_ROLE_REQUIRED",
    });
    await expect(
      product.approveExecutionRequest({ requestLocator: "71" }),
    ).rejects.toThrow("not currently approvable");
    await expect(
      product.rejectExecutionRequest({
        requestLocator: "71",
        reason: "Not permitted",
      }),
    ).rejects.toThrow("not currently rejectable");
    expect(context.client.createIssueComment).not.toHaveBeenCalled();
  });

  it("keeps missing or unreadable role proof inspectable and prevents decision writes", async () => {
    const context = createContext({
      getExecutionRequestIssue: vi.fn().mockResolvedValue(createIssue()),
    });
    context.client.state.files = context.client.state.files.filter(
      (file) => !file.path.endsWith("role-mapping.yml"),
    );
    const product = createGitHubLiteExecutionApprovalClient(context);
    for (const failRead of [false, true]) {
      if (failRead)
        context.client.getFile = vi
          .fn()
          .mockRejectedValue(new Error("role proof unavailable"));
      const request = await product.getExecutionRequest({
        requestLocator: "71",
      });
      expect(request).toMatchObject({
        requestId: draft.requestId,
        capability: {
          canApprove: false,
          canReject: false,
          approveUnavailableReason: "AUTHORIZATION_UNAVAILABLE",
          rejectUnavailableReason: "AUTHORIZATION_UNAVAILABLE",
        },
      });
      await expect(
        product.approveExecutionRequest({ requestLocator: "71" }),
      ).rejects.toThrow();
      await expect(
        product.rejectExecutionRequest({
          requestLocator: "71",
          reason: "Missing proof",
        }),
      ).rejects.toThrow();
      if (!failRead) {
        const created = await product.createExecutionRequest({
          draft: { ...draft, workspaceApprovalMode: "SELF_APPROVAL_BLOCKED" },
          expiresAt: "2026-09-11T10:00:00.000Z",
          parameters: [],
          reason: "Missing role proof",
          targetRevision: "main",
        });
        expect(created.postCreateError).toBeUndefined();
        expect(created.request.capability).toMatchObject({
          canApprove: false,
          canReject: false,
          approveUnavailableReason: "AUTHORIZATION_UNAVAILABLE",
          rejectUnavailableReason: "AUTHORIZATION_UNAVAILABLE",
        });
      }
    }
    expect(context.client.createIssueComment).not.toHaveBeenCalled();
  });

  it("uses current policy instead of the draft and automatically approves an eligible requester without granting a manual role", async () => {
    const context = createContext();
    context.client.state.repositoryPermissions = [
      { username: "developer", permission: "write", roleName: "write" },
    ];
    const product = createGitHubLiteExecutionApprovalClient(context);
    const input = {
      draft: {
        ...draft,
        workspaceApprovalMode: "SELF_APPROVAL_BLOCKED" as const,
      },
      expiresAt: "2026-09-11T10:00:00.000Z",
      parameters: [],
      reason: "Reconciled",
      targetRevision: "main",
    };
    const automatic = await product.createExecutionRequest(input);
    expect(automatic.request).toMatchObject({
      status: "APPROVED",
      approvalDecision: {
        source: "WORKSPACE_POLICY",
        currentAuthorization: "VERIFIED",
      },
    });
    expect(context.client.createIssueComment).toHaveBeenCalledOnce();
    const policy = context.client.state.files.find((file) =>
      file.path.endsWith("workspace.yml"),
    )!;
    policy.content = buildWorkspacePolicyYaml("SELF_APPROVAL_BLOCKED");
    const pending = await product.createExecutionRequest({ ...input, draft });
    expect(pending.request).toMatchObject({
      status: "REQUESTED",
      capability: {
        canApprove: false,
        canReject: false,
        approveUnavailableReason: "APPROVER_ROLE_REQUIRED",
      },
    });
    expect(context.client.createIssueComment).toHaveBeenCalledOnce();
    policy.content = buildWorkspacePolicyYaml("AUTO_APPROVE");
    context.client.state.repositoryPermissions = [
      { username: "developer", permission: "read", roleName: "read" },
    ];
    expect(await product.createExecutionRequest(input)).toMatchObject({
      postCreateError: { code: "AUTO_APPROVAL_RECORDING_FAILED" },
      request: { status: "REQUESTED" },
    });
    expect(context.client.createIssueComment).toHaveBeenCalledOnce();
  });

  it("keeps automatic approval independent of manual proof and revalidates its policy and requester role on reads", async () => {
    const context = createContext({
      getExecutionRequestIssue: vi.fn().mockResolvedValue(createIssue()),
    });
    const roles = context.client.state.files.find((file) =>
      file.path.endsWith("role-mapping.yml"),
    )!;
    roles.content = stringifyRepositoryYaml({
      apiVersion: "batchplane.io/v1",
      kind: "RoleMapping",
      metadata: { id: "default" },
      spec: {
        roles: {
          requester: { githubUsers: ["developer"] },
          approver: { githubTeams: ["approvers"] },
          maintainer: { githubUsers: ["maintainer"] },
          auditor: { githubUsers: ["auditor"] },
        },
      },
    });
    context.client.getTeamMembershipForUser = vi
      .fn()
      .mockRejectedValue(
        new Error("Manual approver membership is unavailable"),
      );
    const product = createGitHubLiteExecutionApprovalClient(context);
    const result = await product.createExecutionRequest({
      draft,
      expiresAt: "2026-09-11T10:00:00.000Z",
      parameters: [],
      reason: "Reconciled",
      targetRevision: "main",
    });
    expect(result.request).toMatchObject({
      attempts: { attempts: [], type: "loaded" },
      status: "APPROVED",
      workspaceLabel: "always0ne/batch",
      approvalDecision: {
        source: "WORKSPACE_POLICY",
        currentAuthorization: "VERIFIED",
      },
    });
    expect(result.postCreateError).toBeUndefined();
    expect(context.client.createIssueComment).toHaveBeenCalledOnce();

    const recordedComment = await vi.mocked(context.client.createIssueComment)
      .mock.results[0]!.value;
    context.client.listIssueComments = vi
      .fn()
      .mockResolvedValue([recordedComment]);
    context.client.state.currentUser = { login: "auditor" };
    roles.content = buildRoleMappingYaml();
    const permissionLookup = vi.spyOn(
      context.client,
      "getRepositoryPermissionForUser",
    );
    const policy = context.client.state.files.find((file) =>
      file.path.endsWith("workspace.yml"),
    )!;
    for (const mode of [
      "SELF_APPROVAL_ALLOWED",
      "SELF_APPROVAL_BLOCKED",
    ] as const) {
      policy.content = buildWorkspacePolicyYaml(mode);
      permissionLookup
        .mockClear()
        .mockRejectedValue(new Error("Requester role lookup is unavailable"));
      expect(
        await product.getExecutionRequest({ requestLocator: "71" }),
      ).toMatchObject({
        status: "APPROVED",
        approvalDecision: {
          actor: "developer",
          source: "WORKSPACE_POLICY",
          currentAuthorization: "DENIED",
        },
      });
      expect(
        permissionLookup.mock.calls.some(
          ([input]) => input.username === "developer",
        ),
      ).toBe(false);
    }

    policy.content = buildWorkspacePolicyYaml("AUTO_APPROVE");
    expect(
      (await product.getExecutionRequest({ requestLocator: "71" }))
        ?.approvalDecision?.currentAuthorization,
    ).toBe("UNAVAILABLE");
    expect(permissionLookup).toHaveBeenCalledWith({
      ...context.repositoryRef,
      username: "developer",
    });
    permissionLookup.mockResolvedValue({
      username: "developer",
      permission: "read",
      roleName: "read",
    });
    expect(
      (await product.getExecutionRequest({ requestLocator: "71" }))
        ?.approvalDecision?.currentAuthorization,
    ).toBe("DENIED");
    permissionLookup.mockResolvedValue({
      username: "developer",
      permission: "write",
      roleName: "write",
    });
    expect(
      (await product.getExecutionRequest({ requestLocator: "71" }))
        ?.approvalDecision?.currentAuthorization,
    ).toBe("VERIFIED");
    expect(context.client.createIssueComment).toHaveBeenCalledOnce();
  });

  it("keeps historical actor evidence separate from current decision authority and reads policy and roles at one effective SHA", async () => {
    const issue = createIssue();
    const parsed = parseExecutionRequestDetail(issue)!;
    const body = buildExecutionApprovalComment({
      approvedAt: new Date(),
      approver: "auditor",
      request: parsed,
    });
    const context = createContext({
      getExecutionRequestIssue: vi.fn().mockResolvedValue(issue),
    });
    context.client.listIssueComments = vi.fn().mockResolvedValue([
      {
        author: "auditor",
        body,
        createdAt: "2026-09-11T09:01:00.000Z",
        id: 1,
        issueNumber: 71,
      },
    ]);
    const getFile = vi.spyOn(context.client, "getFile");
    const product = createGitHubLiteExecutionApprovalClient(context);
    expect(
      await product.getExecutionRequest({ requestLocator: "71" }),
    ).toMatchObject({
      approvalDecision: {
        actor: "auditor",
        source: "USER",
        currentAuthorization: "DENIED",
      },
    });
    const policyReads = getFile.mock.calls
      .map(([input]) => input)
      .filter(
        (input) =>
          input.path.endsWith("workspace.yml") ||
          input.path.endsWith("role-mapping.yml"),
      );
    expect(policyReads).toHaveLength(2);
    expect(policyReads.every((input) => input.ref === "mock-main-sha")).toBe(
      true,
    );
    context.client.state.repositoryPermissions = [
      { username: "auditor", permission: "maintain", roleName: "maintain" },
      { username: "developer", permission: "maintain", roleName: "maintain" },
    ];
    expect(
      (await product.getExecutionRequest({ requestLocator: "71" }))
        ?.approvalDecision?.currentAuthorization,
    ).toBe("VERIFIED");
    expect(context.client.createIssueComment).not.toHaveBeenCalled();
  });
  it("records a manual approval on the current Issue without closing it", async () => {
    const context = createContext({
      getExecutionRequestIssue: vi.fn().mockResolvedValue(createIssue()),
    });
    const closeIssue = vi.spyOn(context.client, "closeIssue");
    const product = createGitHubLiteExecutionApprovalClient(context);
    const result = await product.approveExecutionRequest({
      requestLocator: "71",
    });
    expect(result.status).toBe("APPROVED");
    expect(context.client.getIssue).toHaveBeenCalledWith({
      ...context.repositoryRef,
      issueNumber: 71,
    });
    expect(context.client.listIssueComments).toHaveBeenCalledWith({
      ...context.repositoryRef,
      issueNumber: 71,
    });
    expect(context.client.createIssueComment).toHaveBeenCalledWith({
      ...context.repositoryRef,
      issueNumber: 71,
      body: expect.stringContaining("batchplane:execution-approval"),
    });
    expect(closeIssue).not.toHaveBeenCalled();
  });

  it("records rejection evidence before closing the current Issue", async () => {
    const context = createContext({
      getExecutionRequestIssue: vi.fn().mockResolvedValue(createIssue()),
    });
    const closeIssue = vi
      .spyOn(context.client, "closeIssue")
      .mockResolvedValue();
    const product = createGitHubLiteExecutionApprovalClient(context);
    const result = await product.rejectExecutionRequest({
      requestLocator: "71",
      reason: "  Reconciliation changed  ",
    });
    expect(result.status).toBe("REJECTED");
    expect(context.client.createIssueComment).toHaveBeenCalledWith({
      ...context.repositoryRef,
      issueNumber: 71,
      body: expect.stringContaining("Reconciliation changed"),
    });
    expect(closeIssue).toHaveBeenCalledWith({
      ...context.repositoryRef,
      issueNumber: 71,
    });
    expect(
      vi.mocked(context.client.createIssueComment).mock.invocationCallOrder[0],
    ).toBeLessThan(closeIssue.mock.invocationCallOrder[0]!);
  });

  it("returns a named not-found outcome when the loaded batch is absent", async () => {
    const context = createContext({ batchDefinitions: [] });
    const client = createGitHubLiteExecutionApprovalClient(context);

    await expect(
      client.loadExecutionRequestDraft({ batchId: "missing.batch" }),
    ).resolves.toEqual({ batchId: "missing.batch", type: "not-found" });
  });

  it("projects creation readiness and rejects a direct create that bypasses it", async () => {
    const definitions = [
      {
        ...batchDefinition(),
        execution: { command: "", runsOn: "ubuntu-latest" },
        gateRequired: false,
        status: "INACTIVE" as const,
      },
    ];
    vi.spyOn(batchRepository, "loadBatchDefinitions").mockResolvedValueOnce(
      definitions,
    );
    const context = createContext({
      batchDefinitions: [
        {
          ...batchDefinition(),
          execution: { command: "", runsOn: "ubuntu-latest" },
          gateRequired: false,
          status: "INACTIVE",
        },
      ],
    });
    const client = createGitHubLiteExecutionApprovalClient(context);
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
        targetRevision: "main",
      })
      .then(
        () => {
          throw new Error("expected creation to be unavailable");
        },
        (error: unknown) => {
          expect(isExecutionRequestCreationUnavailableError(error)).toBe(true);
        },
      );
    expect(context.client.createIssue).not.toHaveBeenCalled();
  });

  it("uses the authenticated requester and authoritative execution shape for preview, creation and auto-approval", async () => {
    const authoritative = {
      ...batchDefinition(),
      execution: {
        artifactPath: "vendor/releases/close.jar",
        command: "./close --settle",
        runsOn: ["self-hosted", "linux"],
      },
    };
    const createExecutionRequest = vi
      .fn()
      .mockImplementation(async ({ body }) => ({
        ...createIssue(),
        body,
      }));
    const context = createContext({
      batchDefinitions: [authoritative],
      createExecutionRequest,
    });
    context.client.getCurrentUser = vi
      .fn()
      .mockResolvedValue({ login: "Developer" });
    const client = createGitHubLiteExecutionApprovalClient(context);

    const input = {
      draft: {
        ...draft,
        requestedBy: "forged-requester",
        batch: {
          ...draft.batch,
          executionTarget: {
            ...draft.batch.executionTarget!,
            command: "display-only command must not be used",
            executionEnvironment: "display-only runner must not be used",
          },
        },
      },
      expiresAt: "2026-09-11T10:00:00.000Z",
      parameters: [],
      reason: "Close after reconciliation.",
      targetRevision: "release/2026-09",
    };
    const preview = await client.previewExecutionRequest(input);
    expect(preview).toMatchObject({
      request: {
        batchId: "payment.daily-close",
        evidence: { approvedBatchRevision: draft.approvedBatchRevision },
        requestId: draft.requestId,
        requestedBy: "Developer",
      },
    });
    const previewPayload = JSON.parse(
      preview.request.evidence.canonicalPayload ?? "{}",
    ) as {
      spec?: { execution?: unknown; workflow?: unknown; requestedBy?: string };
    };
    expect(previewPayload.spec?.requestedBy).toBe("Developer");
    expect(preview.request.evidence.requestDigest).toBe(
      await createRequestDigest(previewPayload as CanonicalValue),
    );
    expect(previewPayload.spec?.execution).toEqual({
      artifactPath: "vendor/releases/close.jar",
      command: "./close --settle",
      gateRequired: true,
      runsOn: ["self-hosted", "linux"],
    });
    expect(previewPayload.spec?.workflow).toEqual({
      path: ".github/workflows/payment.daily-close.yml",
      ref: "release/2026-09",
    });
    await client.createExecutionRequest(input);
    expect(createExecutionRequest.mock.calls[0]?.[0]?.body).toContain(
      "- Requested by: @Developer",
    );
    expect(context.client.createIssueComment).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining("- Approver: @Developer"),
      }),
    );
    const createdPayload = JSON.parse(
      String(createExecutionRequest.mock.calls[0]?.[0]?.body)
        .split("```json\n")[1]!
        .split("\n```")[0]!,
    ) as { spec?: { execution?: unknown; workflow?: unknown } };
    expect(createdPayload.spec).toMatchObject(previewPayload.spec ?? {});
    expect(context.client.getRepository).toHaveBeenCalled();
    expect(verifyApprovedBatchRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedRevision: draft.approvedBatchRevision,
      }),
    );
  });

  it("projects AUTO_APPROVE from the returned Issue and approval comment", async () => {
    const issue = createIssue();
    const context = createContext({
      createExecutionRequest: vi.fn().mockResolvedValue(issue),
    });
    const client = createGitHubLiteExecutionApprovalClient(context);

    const result = await client.createExecutionRequest({
      draft,
      expiresAt: "2026-09-11T10:00:00.000Z",
      parameters: [],
      reason: "Close after reconciliation.",
      targetRevision: "main",
    });

    expect(result.request.status).toBe("APPROVED");
    expect(result.request.approvalDecision).toMatchObject({
      source: "WORKSPACE_POLICY",
    });
    expect(result.request.approvalNotice).toEqual({
      kind: "SELF_APPROVAL_ALLOWED",
      mode: "AUTO_APPROVE",
    });
    expect(
      vi.mocked(context.client.createIssue).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(context.client.createIssueComment).mock.invocationCallOrder[0]!,
    );
    expect(context.client.getIssue).not.toHaveBeenCalled();
    expect(context.client.listIssues).not.toHaveBeenCalled();
  });

  it("keeps a self-request visible in the approval inventory with a disabled approve capability", async () => {
    const issue = createIssue();
    issue.author = "Developer";
    const context = createContext({
      getExecutionRequestIssue: vi.fn().mockResolvedValue(issue),
      listExecutionRequestIssues: vi.fn().mockResolvedValue([issue]),
      workspaceApprovalMode: "SELF_APPROVAL_BLOCKED",
    });
    const client = createGitHubLiteExecutionApprovalClient(context);
    context.client.getCurrentUser = vi
      .fn()
      .mockResolvedValue({ login: "DEVELOPER" });

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
    await expect(
      client.approveExecutionRequest({ requestLocator: "71" }),
    ).rejects.toThrow();
    expect(context.client.createIssueComment).not.toHaveBeenCalled();
  });

  it("keeps invalid requester evidence inspectable but prevents approval writes in every policy mode", async () => {
    const valid = await createCanonicalIssue();
    const invalidIssues = [
      { ...valid, body: `quoted - Requested by: @other\n${valid.body}` },
      { ...valid, author: "actual-attacker" },
      { ...valid, author: "" },
      {
        ...valid,
        body: valid.body.replace(
          "- Requested by: @developer",
          "- Requested by: @other",
        ),
      },
      {
        ...valid,
        body: valid.body.replace(
          '"requestedBy": "developer"',
          '"requestedBy": "other"',
        ),
      },
      {
        ...valid,
        body: valid.body.replace(
          "- Requested by: @developer",
          "- Requested by:",
        ),
      },
      { ...valid, body: valid.body.replace('"requestedBy": "developer",', "") },
    ];
    for (const issue of invalidIssues) {
      for (const mode of [
        "SELF_APPROVAL_BLOCKED",
        "SELF_APPROVAL_ALLOWED",
        "AUTO_APPROVE",
      ] as const) {
        const context = createContext({
          getExecutionRequestIssue: vi.fn().mockResolvedValue(issue),
          listExecutionRequestIssues: vi.fn().mockResolvedValue([issue]),
          workspaceApprovalMode: mode,
        });
        const client = createGitHubLiteExecutionApprovalClient(context);
        const detail = await client.getExecutionRequest({
          requestLocator: "71",
        });
        expect(detail).toMatchObject({
          requestId: draft.requestId,
          capability: {
            canApprove: false,
            canReject: true,
            approveUnavailableReason: "REQUESTER_IDENTITY_UNVERIFIED",
          },
        });
        expect(detail?.approvalNotice).toBeUndefined();
        expect((await client.listApprovalRequests()).requests).toHaveLength(1);
        await expect(
          client.approveExecutionRequest({ requestLocator: "71" }),
        ).rejects.toThrow("requester identity could not be verified");
        expect(context.client.createIssueComment).not.toHaveBeenCalled();
      }
    }
  });

  it("projects the self-approval-allowed notice from current policy and actor", async () => {
    const issue = createIssue();
    const context = createContext({
      listExecutionRequestIssues: vi.fn().mockResolvedValue([issue]),
      workspaceApprovalMode: "SELF_APPROVAL_ALLOWED",
    });
    const client = createGitHubLiteExecutionApprovalClient(context);

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
    const context = createContext({
      listExecutionRequestIssues: vi
        .fn()
        .mockResolvedValue([{ ...createIssue(), state: "closed" }]),
    });
    const client = createGitHubLiteExecutionApprovalClient(context);

    await expect(client.listApprovalRequests()).resolves.toEqual({
      requests: [],
      workspaceDefaultBranch: "main",
    });
  });

  it("keeps the raw source title on workspace inventory rows", async () => {
    const context = createContext({
      listExecutionRequestIssues: vi.fn().mockResolvedValue([createIssue()]),
    });
    const client = createGitHubLiteExecutionApprovalClient(context);

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

  it("projects the exact existing change request locator for a matching approved revision", async () => {
    const issue = await createCanonicalIssue();
    const context = createContext({
      getExecutionRequestIssue: vi.fn().mockResolvedValue(issue),
      listRegistrationRequests: vi.fn().mockResolvedValue([sourceChange()]),
    });
    const client = createGitHubLiteExecutionApprovalClient(context);

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
      const context = createContext({
        getExecutionRequestIssue: vi.fn().mockResolvedValue(issue),
        listRegistrationRequests: vi
          .fn()
          .mockResolvedValue([sourceChange(mismatch)]),
      });
      const client = createGitHubLiteExecutionApprovalClient(context);

      const result = await client.getExecutionRequest({ requestLocator: "71" });

      expect(result?.evidence.approvedBatchRevision).toEqual(
        draft.approvedBatchRevision,
      );
      expect(result?.evidence.sourceChange).toBeUndefined();
    },
  );

  it.each([
    { name: "missing", records: [] },
    {
      name: "ambiguous",
      records: [sourceChange(), { ...sourceChange(), number: 43 }],
    },
  ])(
    "omits the source link for $name matching change records",
    async ({ records }) => {
      const context = createContext({
        getExecutionRequestIssue: vi
          .fn()
          .mockResolvedValue(await createCanonicalIssue()),
        listRegistrationRequests: vi.fn().mockResolvedValue(records),
      });
      const client = createGitHubLiteExecutionApprovalClient(context);
      expect(
        (await client.getExecutionRequest({ requestLocator: "71" }))?.evidence
          .sourceChange,
      ).toBeUndefined();
    },
  );

  it("surfaces a source lookup failure instead of silently claiming no matching change", async () => {
    const context = createContext({
      getExecutionRequestIssue: vi
        .fn()
        .mockResolvedValue(await createCanonicalIssue()),
      listRegistrationRequests: vi
        .fn()
        .mockRejectedValue(new Error("Source lookup unavailable")),
    });
    await expect(
      createGitHubLiteExecutionApprovalClient(context).getExecutionRequest({
        requestLocator: "71",
      }),
    ).rejects.toThrow("Source lookup unavailable");
  });

  it("keeps a stable product locator for each failure follow-up work item", async () => {
    const context = createContext({
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
    const client = createGitHubLiteExecutionApprovalClient(context);

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

  it("lists review, revision, and ongoing follow-ups in that order for one run", async () => {
    const baseFollowUp = {
      actionTaken: "Checked the ledger.",
      author: "developer",
      batchId: "payment.daily-close",
      createdAt: "2026-09-11T09:02:00.000Z",
      explanation: "The ledger was delayed.",
      owner: "developer",
      requestId: draft.requestId,
      reviews: [],
      runId: "run-1",
      status: "OPEN" as const,
    };
    const context = createContext({
      executionRuns: [
        {
          batchId: "payment.daily-close",
          failureFollowUps: [
            {
              ...baseFollowUp,
              followUpId: "ongoing",
              reviewStatus: "AWAITING_REVIEW",
            },
            { ...baseFollowUp, followUpId: "revise", reviewStatus: "REJECTED" },
            {
              ...baseFollowUp,
              followUpId: "review",
              reviewStatus: "AWAITING_REVIEW",
              reviewCapability: { canReview: true },
            },
          ],
          requestId: draft.requestId,
          runId: "run-1",
          status: "FAILED",
        },
      ],
    });
    const items = (
      await createGitHubLiteExecutionApprovalClient(context).getMyWork()
    ).items;

    expect(
      items.map((item) =>
        item.itemType === "FAILURE_FOLLOW_UP" ? item.action : null,
      ),
    ).toEqual(["REVIEW_FOLLOW_UP", "UPDATE_FOLLOW_UP", "CONTINUE_FOLLOW_UP"]);
  });

  it("assigns a failed manual run's first follow-up to its requester", async () => {
    const context = createContext({
      executionRuns: [
        {
          batchId: "payment.daily-close",
          requestId: draft.requestId,
          runId: "manual-run",
          status: "FAILED",
        },
      ],
      listExecutionRequestIssues: vi.fn().mockResolvedValue([createIssue()]),
    });
    const items = (
      await createGitHubLiteExecutionApprovalClient(context).getMyWork()
    ).items;

    expect(
      items.filter((item) => item.itemType === "FAILURE_FOLLOW_UP"),
    ).toMatchObject([
      {
        action: "WRITE_FOLLOW_UP",
        isGateBlocked: false,
        itemLocator: "run:manual-run:follow-up-needed",
      },
    ]);
  });

  it("assigns a blocked scheduled run's first Gate review to the batch owner", async () => {
    const built = await buildExecutionRequestIssue({
      approvedBatchRevision: draft.approvedBatchRevision,
      batch: batchDefinition(),
      requestId: draft.requestId,
      requestedAt: new Date("2026-09-11T09:00:00.000Z"),
      requestedBy: "developer",
      schedule: {
        definitionCommitSha: "schedule-sha",
        definitionPath: ".batch-governance/batches/payment.daily-close.yml",
        repositoryId: "always0ne/batch",
        scheduleId: "daily",
        sourceRunAttempt: 1,
        sourceRunId: "scheduled-run",
      },
      triggerType: "SCHEDULE",
    });
    const context = createContext({
      executionRuns: [
        {
          batchId: "payment.daily-close",
          requestId: draft.requestId,
          runId: "scheduled-run",
          status: "BLOCKED",
        },
      ],
      listExecutionRequestIssues: vi
        .fn()
        .mockResolvedValue([{ ...createIssue(), body: built.body }]),
    });
    context.client.getCurrentUser = vi.fn().mockResolvedValue({ login: "ops" });
    const items = (
      await createGitHubLiteExecutionApprovalClient(context).getMyWork()
    ).items;

    expect(
      items.filter((item) => item.itemType === "FAILURE_FOLLOW_UP"),
    ).toMatchObject([
      {
        action: "REVIEW_GATE_EVIDENCE",
        isGateBlocked: true,
        itemLocator: "run:scheduled-run:follow-up-needed",
      },
    ]);
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
    const context = createContext({
      listExecutionRequestIssues: vi
        .fn()
        .mockResolvedValue([requested, missingRequestedAt]),
    });
    const client = createGitHubLiteExecutionApprovalClient(context);
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

  it.each(["write failure", "unverified requester"])(
    "returns the created pending request when AUTO_APPROVE encounters %s",
    async (failure) => {
      const issue = {
        ...createIssue(),
        author: failure === "unverified requester" ? "other" : "developer",
      };
      const context = createContext({
        createExecutionRequest: vi.fn().mockResolvedValue(issue),
      });
      context.client.createIssueComment = vi
        .fn()
        .mockRejectedValue(new Error("comment write failed"));
      const client = createGitHubLiteExecutionApprovalClient(context);

      await expect(
        client.createExecutionRequest({
          draft,
          expiresAt: "2026-09-11T10:00:00.000Z",
          parameters: [],
          reason: "Close after reconciliation.",
          targetRevision: "main",
        }),
      ).resolves.toMatchObject({
        postCreateError: { code: "AUTO_APPROVAL_RECORDING_FAILED" },
        request: { requestId: draft.requestId, status: "REQUESTED" },
      });
      expect(context.client.getIssue).not.toHaveBeenCalled();
      expect(context.client.listIssues).not.toHaveBeenCalled();
      if (failure === "unverified requester") {
        expect(context.client.createIssueComment).not.toHaveBeenCalled();
      } else {
        expect(context.client.createIssueComment).toHaveBeenCalledOnce();
      }
    },
  );
});

function createContext({
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
  batchDefinitions?: GitHubBatchDefinition[];
  createExecutionRequest?: GitHubLiteClient["createIssue"];
  executionRuns?: ExecutionRun[];
  getExecutionRequestIssue?: GitHubLiteClient["getIssue"];
  listExecutionRequestIssues?: GitHubLiteClient["listIssues"];
  listRegistrationRequests?: GitHubLiteClient["listPullRequests"];
  workspaceApprovalMode?:
    | "AUTO_APPROVE"
    | "SELF_APPROVAL_ALLOWED"
    | "SELF_APPROVAL_BLOCKED";
} = {}) {
  const state = createGitHubLiteMockState({
    currentUser: { login: "developer" },
  });
  state.files = [
    ...state.files.filter(
      (file) =>
        !file.path.startsWith(".batch-governance/batches/") &&
        file.path !== ".batch-governance/policies/role-mapping.yml" &&
        file.path !== ".batch-governance/workspace.yml",
    ),
    ...batchDefinitions.map((batch) => ({
      branch: "main",
      content: serializeBatchDefinitionYaml(batch),
      path: `.batch-governance/batches/${batch.batchId}.yml`,
      sha: "definition-sha",
    })),
    {
      branch: "main",
      content: buildWorkspacePolicyYaml(workspaceApprovalMode),
      path: ".batch-governance/workspace.yml",
      sha: "policy-sha",
    },
    {
      branch: "main",
      content: buildRoleMappingYaml(),
      path: ".batch-governance/policies/role-mapping.yml",
      sha: "roles-sha",
    },
  ];
  const client = createMockGitHubLiteClient(state);
  client.createIssue = createExecutionRequest;
  client.getIssue = getExecutionRequestIssue;
  client.listIssues = listExecutionRequestIssues;
  client.listPullRequests = listRegistrationRequests;
  client.listIssueComments = vi.fn().mockResolvedValue([]);
  client.createIssueComment = vi.fn().mockImplementation(async ({ body }) => ({
    author: "developer",
    body,
    createdAt: "2026-09-11T09:01:00.000Z",
    id: 12,
    issueNumber: 71,
  }));
  vi.spyOn(client, "getRepository");
  vi.mocked(verifyApprovedBatchRevision).mockReset().mockResolvedValue({
    controlStatus: "VERIFIED",
    approvedRevision: draft.approvedBatchRevision,
    verifiedSha: "approved-sha",
  });
  vi.mocked(listExecutionRunFacts)
    .mockReset()
    .mockResolvedValue(
      executionRuns.map((run) => ({ ...run, sourceStatus: "completed" })),
    );
  return { client, repositoryRef: { owner: "always0ne", repo: "batch" } };
}

function batchDefinition(): GitHubBatchDefinition {
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
      "### Canonical payload",
      "```json",
      JSON.stringify({
        spec: { batch: batchDefinition(), requestedBy: "developer" },
      }),
      "```",
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
  overrides: Partial<ChangeRequestEvidence> = {},
): RepositoryPullRequest {
  const evidence: ChangeRequestEvidence = {
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
    version: changeRequestEvidenceVersion,
    workspace: "always0ne/batch",
    ...overrides,
  };

  return {
    author: "developer",
    base: "main",
    body: buildChangeRequestBody(evidence),
    head: "batchplane/change/payment.daily-close",
    merged: true,
    number: 42,
    state: "closed",
    title: "Change batch payment.daily-close",
    url: "https://example.test/pulls/42",
  };
}
