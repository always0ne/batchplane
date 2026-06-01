import { describe, expect, expectTypeOf, it } from "vitest";

import {
  addHours,
  buildExecutionApprovalComment,
  buildExecutionRequestIssue,
  createExecutionRequestId,
  createScheduledExecutionRequestId,
  formatYamlDiagnostics,
  normalizeWorkspacePolicy,
  normalizeApprovalPolicy,
  parseYamlDocument,
  serializeYamlDocument,
  validateApprovalPolicy,
  validateApprovalPolicyFile,
  validateBatchDefinition,
  validateBatchDefinitionFile,
  validateRoleMapping,
  validateRoleMappingFile,
  validateScheduleDefinition,
  validateScheduleDefinitionFile,
  validateWorkspacePolicy,
  validateWorkspacePolicyFile,
} from "./index";
import type {
  ApprovalDecision,
  ApprovalPolicy,
  ApprovalPolicyInput,
  ApprovalPolicyFile,
  AuditTimelineItem,
  BatchPlaneRuntimePorts,
  BatchDefinition,
  BatchDefinitionFile,
  BatchGovernanceConfigFile,
  ExecutionRequest,
  ExecutionRequestPayload,
  ExecutionRun,
  GitHubLiteRepositoryFile,
  RoleMapping,
  RoleMappingFile,
  ScheduleDefinition,
  ScheduleDefinitionFile,
  ScheduleOccurrenceRef,
  WorkspacePolicy,
  WorkspacePolicyFile,
} from "./index";

const batchDefinition: BatchDefinition = {
  batchId: "payment.daily-close",
  criticality: "HIGH",
  domain: "payments",
  environment: "PROD",
  gateRequired: true,
  name: "Daily Close",
  owner: "ops-team",
  status: "ACTIVE",
  workflow: {
    path: ".github/workflows/payment.daily-close.yml",
    ref: "main",
  },
};

const approvalPolicy: ApprovalPolicy = {
  appliesTo: ["BATCH_REGISTRATION", "EXECUTION_REQUEST"],
  approvers: {
    githubTeams: ["platform-ops"],
    repositoryRoles: ["maintain"],
  },
  name: "Production self-approval blocked",
  policyId: "prod-self-approval-blocked",
  preventSelfApproval: true,
  requiredApprovals: 1,
};

const roleMapping: RoleMapping = {
  roles: {
    approver: {
      githubTeams: ["platform-ops"],
    },
    auditor: {
      repositoryRoles: ["triage"],
    },
    maintainer: {
      repositoryRoles: ["maintain", "admin"],
    },
    requester: {
      repositoryRoles: ["write"],
    },
  },
};

const workspacePolicy: WorkspacePolicy = {
  approval: {
    mode: "SELF_APPROVAL_BLOCKED",
  },
};

const scheduleDefinition: ScheduleDefinition = {
  batchId: batchDefinition.batchId,
  cron: "0 5 * * *",
  definitionPath: ".batch-governance/schedules/payment.daily-close-daily.yml",
  enabled: true,
  name: "Daily settlement window",
  scheduleId: "payment.daily-close-daily",
  timezone: "Asia/Seoul",
};

describe("domain model contracts", () => {
  it("exports core batch, approval, execution, and audit contracts", () => {
    const request: ExecutionRequest = {
      batchId: batchDefinition.batchId,
      expiresAt: "2026-05-13T02:00:00.000Z",
      requestDigest:
        "sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      requestedAt: "2026-05-13T01:00:00.000Z",
      requestedBy: "developer",
      requestId: "btr-20260513010000-payment.daily-close-abcdef12",
      status: "REQUESTED",
      triggerType: "MANUAL",
    };
    const decision: ApprovalDecision = {
      decidedAt: "2026-05-13T01:05:00.000Z",
      decidedBy: "maintainer",
      decision: "APPROVED",
      decisionId: "approval-1",
      requestDigest: request.requestDigest,
      subjectId: request.requestId,
      subjectType: "EXECUTION_REQUEST",
    };
    const run: ExecutionRun = {
      batchId: request.batchId,
      requestId: request.requestId,
      runId: "run-1",
      status: "QUEUED",
    };
    const auditItem: AuditTimelineItem = {
      actor: decision.decidedBy,
      itemId: "audit-1",
      occurredAt: decision.decidedAt,
      subjectId: decision.subjectId,
      subjectType: "EXECUTION_REQUEST",
      summary: "Execution request approved.",
      type: "APPROVAL_RECORDED",
    };

    expect(batchDefinition.workflow.path).toBe(
      ".github/workflows/payment.daily-close.yml",
    );
    expect(approvalPolicy.preventSelfApproval).toBe(true);
    expect(roleMapping.roles.maintainer.repositoryRoles).toContain("admin");
    expect(request.status).toBe("REQUESTED");
    expect(decision.decision).toBe("APPROVED");
    expect(run.status).toBe("QUEUED");
    expect(auditItem.type).toBe("APPROVAL_RECORDED");
  });

  it("exports GitHub Lite repository file schemas", () => {
    const configFile: BatchGovernanceConfigFile = {
      apiVersion: "batchplane.io/v1",
      kind: "BatchGovernanceConfig",
      metadata: {
        repository: "always0ne/batch",
      },
      spec: {
        batchesPath: ".batch-governance/batches",
        configPath: ".batch-governance",
        defaultWorkflowRef: "main",
        dispatcherWorkflowPath: ".github/workflows/batchplane-dispatcher.yml",
        schedulesPath: ".batch-governance/schedules",
      },
    };
    const batchFile: BatchDefinitionFile = {
      apiVersion: "batchplane.io/v1",
      kind: "BatchDefinition",
      metadata: {
        id: batchDefinition.batchId,
        name: batchDefinition.name,
      },
      spec: {
        criticality: batchDefinition.criticality,
        domain: batchDefinition.domain,
        environment: batchDefinition.environment,
        gateRequired: true,
        owner: batchDefinition.owner,
        status: batchDefinition.status,
        workflow: batchDefinition.workflow,
      },
    };
    const roleMappingFile: RoleMappingFile = {
      apiVersion: "batchplane.io/v1",
      kind: "RoleMapping",
      metadata: {
        id: "default",
      },
      spec: roleMapping,
    };
    const approvalPolicyFile: ApprovalPolicyFile = {
      apiVersion: "batchplane.io/v1",
      kind: "ApprovalPolicy",
      metadata: {
        id: approvalPolicy.policyId,
        name: approvalPolicy.name,
      },
      spec: approvalPolicy,
    };
    const workspacePolicyFile: WorkspacePolicyFile = {
      apiVersion: "batchplane.io/v1",
      kind: "WorkspacePolicy",
      metadata: {
        id: "default",
      },
      spec: workspacePolicy,
    };
    const scheduleFile: ScheduleDefinitionFile = {
      apiVersion: "batchplane.io/v1",
      kind: "ScheduleDefinition",
      metadata: {
        batchId: scheduleDefinition.batchId,
        id: scheduleDefinition.scheduleId,
        name: scheduleDefinition.name,
      },
      spec: {
        cron: scheduleDefinition.cron,
        enabled: scheduleDefinition.enabled,
        timezone: scheduleDefinition.timezone,
      },
    };
    const requestPayload: ExecutionRequestPayload = {
      apiVersion: "batchplane.io/v1",
      kind: "ExecutionRequest",
      metadata: {
        batchId: batchDefinition.batchId,
        requestId: "btr-20260513010000-payment.daily-close-abcdef12",
      },
      spec: {
        batch: {
          criticality: batchDefinition.criticality,
          domain: batchDefinition.domain,
          environment: batchDefinition.environment,
          name: batchDefinition.name,
          owner: batchDefinition.owner,
        },
        execution: {
          command: "echo close payments",
          gateRequired: true,
          runsOn: "ubuntu-latest",
        },
        expiresAt: "2026-05-13T02:00:00.000Z",
        requestedAt: "2026-05-13T01:00:00.000Z",
        requestedBy: "developer",
        triggerType: "MANUAL",
        workflow: batchDefinition.workflow,
      },
    };
    const files: GitHubLiteRepositoryFile[] = [
      configFile,
      batchFile,
      approvalPolicyFile,
      roleMappingFile,
      workspacePolicyFile,
      scheduleFile,
      requestPayload,
    ];

    expect(files.map((file) => file.kind)).toEqual([
      "BatchGovernanceConfig",
      "BatchDefinition",
      "ApprovalPolicy",
      "RoleMapping",
      "WorkspacePolicy",
      "ScheduleDefinition",
      "ExecutionRequest",
    ]);
  });

  it("keeps required and optional file fields explicit", () => {
    expectTypeOf<BatchDefinitionFile["metadata"]>().toEqualTypeOf<{
      id: string;
      labels?: string[];
      name: string;
    }>();
    expectTypeOf<
      BatchDefinitionFile["spec"]["gateRequired"]
    >().toEqualTypeOf<true>();
    expectTypeOf<ExecutionRequestPayload["spec"]["schedule"]>().toEqualTypeOf<
      ScheduleOccurrenceRef | undefined
    >();
  });

  it("defines runtime ports that can be implemented by adapters", () => {
    const runtime: BatchPlaneRuntimePorts = {
      approvals: {
        approveExecution: async () => undefined,
        approveRegistration: async () => ({
          merged: true,
          message: "merged",
          sha: "merge-sha",
        }),
        listExecutionRequestComments: async () => [],
        listExecutionRequestIssues: async () => [],
        listRegistrationRequests: async () => [],
        readRegistrationRequestFile: async () => null,
        rejectExecution: async () => undefined,
        rejectRegistration: async () => undefined,
      },
      audit: {
        listAuditTimeline: async () => [],
      },
      batches: {
        listBatchDefinitions: async () => [batchDefinition],
      },
      executions: {
        createFailureFollowUp: async () => ({
          actionTaken: "Restarted after upstream correction.",
          author: "operator",
          batchId: "payment.daily-close",
          createdAt: "2026-05-14T01:30:00.000Z",
          explanation: "Upstream ledger file arrived late.",
          followUpId: "ffu-1",
          owner: "ops-team",
          requestId: "btr-1",
          runId: "200",
          status: "RESOLVED",
        }),
        createExecutionRequest: async () => ({
          author: "requester",
          body: "body",
          isPullRequest: false,
          labels: ["batchplane:execution-request"],
          number: 1,
          state: "open",
          title: "Run batch",
          url: "https://github.com/always0ne/batch/issues/1",
        }),
        getExecutionRun: async () => null,
        getExecutionRunJobLog: async ({ jobId }) => ({
          content: "log",
          jobId,
          sizeBytes: 3,
          truncated: false,
        }),
        listExecutionRuns: async () => [],
      },
      registration: {
        checkRegistrationTargets: async () => ({
          batchDefinitionExists: false,
          workflowExists: false,
        }),
        createRegistrationPullRequest: async () => ({
          author: "requester",
          base: "main",
          body: "body",
          head: "batchplane/register/payment.daily-close",
          merged: false,
          number: 2,
          state: "open",
          title: "Register batch payment.daily-close",
          url: "https://github.com/always0ne/batch/pull/2",
        }),
      },
      schedules: {
        checkScheduleDefinitionTarget: async () => ({
          scheduleDefinitionExists: false,
        }),
        createScheduleDefinitionPullRequest: async () => ({
          author: "requester",
          base: "main",
          body: "body",
          head: "batchplane/schedule/register/payment.daily-close-daily",
          merged: false,
          number: 5,
          state: "open",
          title: "Register schedule payment.daily-close-daily",
          url: "https://github.com/always0ne/batch/pull/5",
        }),
        listScheduleDefinitions: async () => [scheduleDefinition],
      },
      settings: {
        checkInstallationStatus: async () => ({
          installed: true,
          missingPaths: [],
          presentPaths: [".github/workflows/batchplane-dispatcher.yml"],
          requiredPaths: [".github/workflows/batchplane-dispatcher.yml"],
        }),
        createInstallationPullRequest: async () => ({
          pullRequest: {
            author: "requester",
            base: "main",
            body: "body",
            head: "batchplane/install/lite-20260514000000",
            merged: false,
            number: 3,
            state: "open",
            title: "Install BatchPlane Lite",
            url: "https://github.com/always0ne/batch/pull/3",
          },
          status: {
            installed: false,
            missingPaths: [".github/workflows/batchplane-dispatcher.yml"],
            presentPaths: [],
            requiredPaths: [".github/workflows/batchplane-dispatcher.yml"],
          },
        }),
        createWorkspacePolicyPullRequest: async () => ({
          author: "requester",
          base: "main",
          body: "body",
          head: "batchplane/workspace/policy-20260514000000",
          merged: false,
          number: 4,
          state: "open",
          title: "Update BatchPlane Workspace policy",
          url: "https://github.com/always0ne/batch/pull/4",
        }),
        getCurrentUser: async () => ({ login: "always0ne" }),
        getRepository: async () => ({
          defaultBranch: "main",
          owner: "always0ne",
          private: true,
          repo: "batch",
          url: "https://github.com/always0ne/batch",
        }),
        getWorkspacePolicy: async () => workspacePolicy,
      },
    };

    expect(runtime).toBeDefined();
  });
});

describe("execution request builders", () => {
  const executableBatch: BatchDefinition = {
    ...batchDefinition,
    execution: {
      command: "echo close payments",
      runsOn: "ubuntu-latest",
    },
    schedules: [
      {
        cron: "0 5 * * *",
        enabled: true,
        name: "Daily settlement window",
        scheduleId: "payment.daily-close-daily",
        timezone: "Asia/Seoul",
      },
    ],
  };

  it("creates manual execution request ids", () => {
    expect(
      createExecutionRequestId(
        "Payment Daily Close",
        new Date("2026-05-09T01:02:03.000Z"),
        "abcdef12",
      ),
    ).toBe("btr-20260509010203-payment-daily-close-abcdef12");
  });

  it("creates deterministic scheduled execution request ids", () => {
    expect(
      createScheduledExecutionRequestId(
        "payment.daily-close",
        "payment.daily-close-daily",
        "2026-05-13T05:00:00.000Z",
      ),
    ).toBe("btr-20260513050000-payment.daily-close-payment.daily-close-dail");
  });

  it("builds a scheduled execution request with delegated evidence fields", async () => {
    const issue = await buildExecutionRequestIssue({
      batch: executableBatch,
      expiresAt: addHours(new Date("2026-05-13T05:01:00.000Z"), 24),
      requestedAt: new Date("2026-05-13T05:01:00.000Z"),
      requestedBy: "github-actions[bot]",
      schedule: {
        definitionCommitSha: "abc123",
        definitionPath: ".batch-governance/batches/payment.daily-close.yml",
        scheduleId: "payment.daily-close-daily",
        scheduledAt: "2026-05-13T05:00:00.000Z",
      },
      triggerType: "SCHEDULE",
      workflowRef: "main",
    });

    expect(issue.title).toBe("Scheduled run payment.daily-close");
    expect(issue.labels).toEqual([
      "batchplane:execution-request",
      "batchplane:scheduled-execution",
    ]);
    expect(issue.body).toContain("- Trigger type: `SCHEDULE`");
    expect(issue.body).toContain("- Schedule ID: `payment.daily-close-daily`");
    expect(issue.request.requestDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("builds delegated schedule approval comments", () => {
    expect(
      buildExecutionApprovalComment({
        approvalType: "SCHEDULE_DELEGATED",
        approvedAt: new Date("2026-05-13T05:01:30.000Z"),
        approver: "github-actions[bot]",
        request: {
          batchId: "payment.daily-close",
          requestDigest:
            "sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          requestId:
            "btr-20260513050000-payment.daily-close-payment.daily-close-d",
          requestedBy: "github-actions[bot]",
        },
      }),
    ).toContain("approvalType=SCHEDULE_DELEGATED");
  });
});

describe("domain schema validation", () => {
  it("returns field-level diagnostics when required batch fields are missing", () => {
    expect(
      validateBatchDefinition({ ...batchDefinition, batchId: "", owner: "" }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "required",
          field: "batchId",
        }),
        expect.objectContaining({
          code: "required",
          field: "owner",
        }),
      ]),
    );
  });

  it("validates active and inactive batch status values", () => {
    expect(validateBatchDefinition(batchDefinition)).toEqual([]);
    expect(
      validateBatchDefinition({
        ...batchDefinition,
        status: "PAUSED",
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "invalid_value",
          field: "status",
        }),
      ]),
    );
  });

  it("validates workflow target fields and mandatory Gate usage", () => {
    expect(
      validateBatchDefinition({
        ...batchDefinition,
        gateRequired: false,
        workflow: {
          path: "workflows/payment.daily-close.yml",
          ref: "",
        },
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "invalid_workflow_path",
          field: "workflow.path",
        }),
        expect.objectContaining({
          code: "required",
          field: "workflow.ref",
        }),
        expect.objectContaining({
          code: "gate_required",
          field: "gateRequired",
        }),
      ]),
    );
  });

  it("validates required schedule definition fields", () => {
    expect(validateScheduleDefinition(scheduleDefinition)).toEqual([]);
    expect(
      validateScheduleDefinition({
        ...scheduleDefinition,
        cron: "",
        timezone: "",
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "required",
          field: "cron",
        }),
        expect.objectContaining({
          code: "required",
          field: "timezone",
        }),
      ]),
    );
  });

  it("validates schedule definition file documents", () => {
    const file: ScheduleDefinitionFile = {
      apiVersion: "batchplane.io/v1",
      kind: "ScheduleDefinition",
      metadata: {
        batchId: scheduleDefinition.batchId,
        id: scheduleDefinition.scheduleId,
        name: scheduleDefinition.name,
      },
      spec: {
        cron: scheduleDefinition.cron,
        enabled: scheduleDefinition.enabled,
        timezone: scheduleDefinition.timezone,
      },
    };

    expect(validateScheduleDefinitionFile(file)).toEqual({
      diagnostics: [],
      ok: true,
      value: file,
    });
    expect(
      validateScheduleDefinitionFile({
        ...file,
        metadata: {
          ...file.metadata,
          batchId: "",
        },
        spec: {
          ...file.spec,
          cron: "",
        },
      }),
    ).toEqual({
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          code: "required",
          field: "metadata.batchId",
        }),
        expect.objectContaining({
          code: "required",
          field: "spec.cron",
        }),
      ]),
      ok: false,
    });
  });

  it("validates batch definition repository files", () => {
    const result = validateBatchDefinitionFile({
      apiVersion: "batchplane.io/v1",
      kind: "BatchDefinition",
      metadata: {
        id: batchDefinition.batchId,
        name: batchDefinition.name,
      },
      spec: {
        criticality: batchDefinition.criticality,
        domain: batchDefinition.domain,
        environment: batchDefinition.environment,
        gateRequired: true,
        owner: batchDefinition.owner,
        status: batchDefinition.status,
        workflow: batchDefinition.workflow,
      },
    });

    expect(result.ok).toBe(true);
  });

  it("parses approval selectors and defaults preventSelfApproval", () => {
    const policyWithoutSelfApproval: ApprovalPolicyInput = {
      appliesTo: ["EXECUTION_REQUEST"],
      approvers: {
        githubTeams: ["platform-ops"],
        githubUsers: ["always0ne"],
        repositoryRoles: ["maintain"],
      },
      name: "Execution approval",
      policyId: "execution-approval",
      requiredApprovals: 1,
    };

    expect(normalizeApprovalPolicy(policyWithoutSelfApproval)).toMatchObject({
      preventSelfApproval: true,
    });
    expect(validateApprovalPolicy(policyWithoutSelfApproval)).toEqual([]);
  });

  it("rejects invalid approval policy repository roles", () => {
    expect(
      validateApprovalPolicy({
        ...approvalPolicy,
        approvers: {
          repositoryRoles: ["read"],
        },
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "invalid_value",
          field: "approvers.repositoryRoles.0",
        }),
      ]),
    );
  });

  it("validates approval policy repository files", () => {
    const result = validateApprovalPolicyFile({
      apiVersion: "batchplane.io/v1",
      kind: "ApprovalPolicy",
      metadata: {
        id: approvalPolicy.policyId,
        name: approvalPolicy.name,
      },
      spec: approvalPolicy,
    });

    expect(result.ok).toBe(true);
  });

  it("defaults and validates Workspace approval modes", () => {
    expect(normalizeWorkspacePolicy(null)).toEqual({
      approval: {
        mode: "SELF_APPROVAL_BLOCKED",
      },
    });
    expect(
      validateWorkspacePolicy({
        approval: {
          mode: "SELF_APPROVAL_ALLOWED",
        },
      }),
    ).toEqual([]);
    expect(
      validateWorkspacePolicy({
        approval: {
          mode: "INVALID",
        },
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "invalid_value",
          field: "approval.mode",
        }),
      ]),
    );
  });

  it("validates Workspace policy repository files", () => {
    const result = validateWorkspacePolicyFile({
      apiVersion: "batchplane.io/v1",
      kind: "WorkspacePolicy",
      metadata: {
        id: "default",
      },
      spec: workspacePolicy,
    });

    expect(result.ok).toBe(true);
  });

  it("validates role mapping selectors for all built-in roles", () => {
    expect(validateRoleMapping(roleMapping)).toEqual([]);
    expect(
      validateRoleMapping({
        roles: {
          requester: {
            repositoryRoles: ["write"],
          },
        },
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "required",
          field: "roles.approver",
        }),
        expect.objectContaining({
          code: "required",
          field: "roles.maintainer",
        }),
        expect.objectContaining({
          code: "required",
          field: "roles.auditor",
        }),
      ]),
    );
  });

  it("validates role mapping repository files", () => {
    const result = validateRoleMappingFile({
      apiVersion: "batchplane.io/v1",
      kind: "RoleMapping",
      metadata: {
        id: "default",
      },
      spec: roleMapping,
    });

    expect(result.ok).toBe(true);
  });
});

describe("BatchPlane YAML utilities", () => {
  it("serializes and parses valid BatchPlane YAML fixtures", () => {
    const yaml = serializeYamlDocument({
      apiVersion: "batchplane.io/v1",
      kind: "BatchDefinition",
      metadata: {
        id: "payment.daily-close",
        name: "Daily Close",
      },
      spec: {
        gateRequired: true,
        labels: ["prod", "close"],
        workflow: {
          path: ".github/workflows/payment.daily-close.yml",
          ref: "main",
        },
      },
    });

    expect(yaml).toContain('id: "payment.daily-close"');
    expect(yaml).toContain('labels: ["prod","close"]');

    expect(parseYamlDocument(yaml)).toEqual({
      ok: true,
      value: {
        apiVersion: "batchplane.io/v1",
        kind: "BatchDefinition",
        metadata: {
          id: "payment.daily-close",
          name: "Daily Close",
        },
        spec: {
          gateRequired: true,
          labels: ["prod", "close"],
          workflow: {
            path: ".github/workflows/payment.daily-close.yml",
            ref: "main",
          },
        },
      },
    });
  });

  it("returns readable diagnostics for invalid YAML", () => {
    const result = parseYamlDocument("metadata:\n   id: broken\n");

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(formatYamlDiagnostics(result.diagnostics)).toContain(
        "Indentation must use two-space levels.",
      );
    }
  });
});
