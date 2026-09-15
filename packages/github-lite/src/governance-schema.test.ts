import { describe, expect, it } from "vitest";

import {
  isCanonicalBatchId,
  normalizeApprovalPolicy,
  normalizeWorkspacePolicy,
  validateApprovalPolicy,
  validateApprovalPolicyFile,
  validateBatchDefinition,
  validateBatchDefinitionFile,
  validateRoleMappingFile,
  validateRoleMapping,
  validateWorkspacePolicy,
  validateWorkspacePolicyFile,
} from "./governance-schema.js";

describe("GitHub Lite governance schemas", () => {
  it("accepts canonical dot and hyphen Batch IDs but rejects repository paths", () => {
    expect(isCanonicalBatchId("payment.daily-close")).toBe(true);
    expect(isCanonicalBatchId("../payment")).toBe(false);
  });

  it("returns field-level diagnostics when required batch fields are missing", () => {
    expect(validateBatchDefinition({}).map((item) => item.field)).toContain(
      "batchId",
    );
  });

  it("validates active and inactive batch status values", () => {
    expect(
      validateBatchDefinition({
        batchId: "payment",
        name: "Payment",
        owner: "ops",
        domain: "payments",
        environment: "PROD",
        criticality: "HIGH",
        gateRequired: true,
        status: "ACTIVE",
        workflow: { path: ".github/workflows/payment.yml", ref: "main" },
      }),
    ).toEqual([]);
    expect(
      validateBatchDefinition({
        batchId: "payment",
        name: "Payment",
        owner: "ops",
        domain: "payments",
        environment: "PROD",
        criticality: "HIGH",
        gateRequired: true,
        status: "OTHER",
        workflow: { path: ".github/workflows/payment.yml", ref: "main" },
      }).some((item) => item.field === "status"),
    ).toBe(true);
  });

  it("validates workflow target fields and mandatory Gate usage", () => {
    const diagnostics = validateBatchDefinition({
      batchId: "payment",
      name: "Payment",
      owner: "ops",
      domain: "payments",
      environment: "PROD",
      criticality: "HIGH",
      gateRequired: false,
      status: "ACTIVE",
      workflow: { path: "", ref: "" },
    });
    expect(diagnostics.map((item) => item.field)).toEqual(
      expect.arrayContaining(["gateRequired", "workflow.path", "workflow.ref"]),
    );
  });

  it("validates a standard YAML-derived batch file after syntax parsing", () => {
    const result = validateBatchDefinitionFile({
      apiVersion: "batchplane.io/v1",
      kind: "BatchDefinition",
      metadata: { id: "payment.daily-close", name: "Daily close" },
      spec: {
        criticality: "HIGH",
        domain: "payments",
        environment: "PROD",
        execution: {
          command: "./close --settle\n./archive",
          runsOn: ["self-hosted", "linux"],
        },
        gateRequired: true,
        owner: "payments-platform",
        schedules: [
          {
            cron: "0 5 * * *",
            enabled: true,
            id: "daily-close",
            name: "Daily close",
            timezone: "Asia/Seoul",
          },
        ],
        status: "ACTIVE",
        workflow: {
          path: ".github/workflows/payment.daily-close.yml",
          ref: "main",
        },
      },
    });

    expect(result.ok).toBe(true);
  });

  it("retains field diagnostics for unsafe paths and missing Gate control", () => {
    const result = validateBatchDefinitionFile({
      apiVersion: "batchplane.io/v1",
      kind: "BatchDefinition",
      metadata: { id: "../../workflow", name: "Unsafe" },
      spec: {
        criticality: "HIGH",
        domain: "payments",
        environment: "PROD",
        gateRequired: false,
        owner: "payments-platform",
        status: "ACTIVE",
        workflow: { path: "workflow.yml", ref: "" },
      },
    });

    expect(result).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          code: "invalid_batch_id",
          field: "metadata.id",
        }),
        expect.objectContaining({
          code: "gate_required",
          field: "spec.gateRequired",
        }),
      ]),
    });
  });

  it("preserves approval and role-mapping validation semantics", () => {
    expect(
      normalizeApprovalPolicy({
        appliesTo: ["EXECUTION_REQUEST"],
        approvers: { repositoryRoles: ["maintain"] },
        name: "Execution approval",
        policyId: "execution-approval",
        requiredApprovals: 1,
      }).preventSelfApproval,
    ).toBe(true);
    expect(
      validateApprovalPolicy({
        appliesTo: ["EXECUTION_REQUEST"],
        approvers: { repositoryRoles: ["read"] },
        name: "Execution approval",
        policyId: "execution-approval",
        requiredApprovals: 1,
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "approvers.repositoryRoles.0",
        }),
      ]),
    );
    expect(
      validateRoleMappingFile({
        apiVersion: "batchplane.io/v1",
        kind: "RoleMapping",
        metadata: { id: "default" },
        spec: {
          roles: {
            approver: { repositoryRoles: ["maintain"] },
            auditor: { repositoryRoles: ["triage"] },
            maintainer: { repositoryRoles: ["maintain"] },
            requester: { repositoryRoles: ["write"] },
          },
        },
      }).ok,
    ).toBe(true);
    expect(normalizeWorkspacePolicy(null)).toEqual({
      approval: { mode: "SELF_APPROVAL_BLOCKED" },
    });
    expect(
      validateWorkspacePolicyFile({
        apiVersion: "batchplane.io/v1",
        kind: "WorkspacePolicy",
        metadata: { id: "default" },
        spec: { approval: { mode: "AUTO_APPROVE" } },
      }).ok,
    ).toBe(true);
  });

  it("parses approval selectors and defaults preventSelfApproval", () => {
    expect(
      normalizeApprovalPolicy({
        appliesTo: ["EXECUTION_REQUEST"],
        approvers: {},
        name: "Approval",
        policyId: "approval",
        requiredApprovals: 1,
      }).preventSelfApproval,
    ).toBe(true);
  });

  it("rejects invalid approval policy repository roles", () => {
    expect(
      validateApprovalPolicy({
        appliesTo: ["EXECUTION_REQUEST"],
        approvers: { repositoryRoles: ["read"] },
        name: "Approval",
        policyId: "approval",
        requiredApprovals: 1,
      }).some((item) => item.field === "approvers.repositoryRoles.0"),
    ).toBe(true);
  });

  it("validates approval policy repository files", () => {
    expect(
      validateApprovalPolicyFile({
        apiVersion: "batchplane.io/v1",
        kind: "ApprovalPolicy",
        metadata: { id: "approval", name: "Approval" },
        spec: {
          appliesTo: ["EXECUTION_REQUEST"],
          approvers: { repositoryRoles: ["maintain"] },
          name: "Approval",
          policyId: "approval",
          preventSelfApproval: true,
          requiredApprovals: 1,
        },
      }).ok,
    ).toBe(true);
  });

  it("defaults and validates Workspace approval modes", () => {
    expect(normalizeWorkspacePolicy(null)).toEqual({
      approval: { mode: "SELF_APPROVAL_BLOCKED" },
    });
    expect(
      validateWorkspacePolicy({ approval: { mode: "UNKNOWN" } }),
    ).not.toEqual([]);
  });

  it("validates role mapping selectors for all built-in roles", () => {
    expect(
      validateRoleMapping({
        roles: {
          approver: { repositoryRoles: ["maintain"] },
          auditor: { repositoryRoles: ["triage"] },
          maintainer: { repositoryRoles: ["maintain"] },
          requester: { repositoryRoles: ["write"] },
        },
      }),
    ).toEqual([]);
  });
});
