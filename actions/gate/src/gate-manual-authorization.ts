import { parseRepositoryYaml } from "@batchplane/github-lite";
import { parseApproverSelectorFromRoleMappingFile } from "./gate-evidence.js";
import type { GateGitHubClient } from "./gate-github-client.js";
import {
  type WorkspaceApprovalMode,
  validateWorkspacePolicyFile,
} from "./gate-schema.js";
import type {
  GateEvidence,
  GateInput,
  GateRepositoryRef,
  GateResult,
} from "./gate-types.js";

export async function verifyManualAuthorization({
  client,
  evidence,
  input,
  repository,
}: {
  client: GateGitHubClient;
  evidence: GateEvidence;
  input: GateInput;
  repository: GateRepositoryRef;
}): Promise<GateResult> {
  const request = evidence.request;
  const approval = evidence.approval;

  if (!request || !approval) {
    return deny(
      "EXECUTION_REQUEST_NOT_APPROVED",
      "Execution request does not have approved comment evidence.",
    );
  }

  if (approval.edited) {
    return deny(
      "APPROVAL_COMMENT_EDITED",
      "Execution approval comment was edited after creation.",
    );
  }

  if (
    approval.commandDigest &&
    approval.commandDigest !== request.requestDigest
  ) {
    return deny(
      "REQUEST_DIGEST_MISMATCH",
      "Approval command digest does not match execution request digest.",
    );
  }

  if (
    approval.requestDigest !== input.requestDigest ||
    approval.requestDigest !== request.requestDigest
  ) {
    return deny(
      "REQUEST_DIGEST_MISMATCH",
      "Execution approval digest does not match execution request digest.",
    );
  }

  if (approval.approvalType === "SCHEDULE_DELEGATED") {
    return deny(
      "SCHEDULE_DELEGATED_APPROVAL_NOT_SUPPORTED",
      "Delegated schedule approval evidence is historical and cannot authorize a new execution.",
    );
  }

  let workspaceApprovalMode: WorkspaceApprovalMode;

  try {
    workspaceApprovalMode = await readWorkspaceApprovalMode({
      client,
      configPath: input.configPath,
      ref: request.workflowRef || input.ref,
    });
  } catch (error) {
    return deny(
      "WORKSPACE_POLICY_LOOKUP_FAILED",
      `Workspace policy lookup failed: ${toErrorMessage(error)}`,
    );
  }

  if (approval.approvalType === "WORKSPACE_AUTO_APPROVED") {
    return workspaceApprovalMode === "AUTO_APPROVE"
      ? {
          message:
            "Execution request, Workspace auto-approval evidence, and batch policy are verified.",
          result: "ALLOW",
        }
      : deny(
          "WORKSPACE_AUTO_APPROVAL_NOT_ALLOWED",
          "Workspace auto-approval evidence requires AUTO_APPROVE policy mode.",
        );
  }

  if (
    approval.approver === request.requestedBy &&
    !allowsSelfApproval(workspaceApprovalMode)
  ) {
    return deny(
      "SELF_APPROVAL_NOT_ALLOWED",
      "Requester and approver must be different users.",
    );
  }

  const approverAuthorized = await verifyApproverAuthorization({
    allowMissingRoleMapping:
      approval.approver === request.requestedBy &&
      allowsSelfApproval(workspaceApprovalMode),
    approver: approval.approver,
    client,
    configPath: input.configPath,
    ref: request.workflowRef || input.ref,
    repository,
  });

  if (!approverAuthorized.allowed) {
    return deny(
      "APPROVER_NOT_AUTHORIZED",
      approverAuthorized.message ||
        `Approver @${approval.approver} is not authorized.`,
    );
  }

  return {
    message:
      "Execution request, approval evidence, and batch policy are verified.",
    result: "ALLOW",
  };
}

async function readWorkspaceApprovalMode({
  client,
  configPath,
  ref,
}: {
  client: GateGitHubClient;
  configPath: string;
  ref?: string;
}): Promise<WorkspaceApprovalMode> {
  const effectiveRef = ref?.trim();

  if (!effectiveRef) {
    return "SELF_APPROVAL_BLOCKED";
  }

  const workspacePolicyPath = `${configPath.replace(/\/+$/u, "")}/workspace.yml`;
  const workspacePolicyFile = await client.getFile(
    workspacePolicyPath,
    effectiveRef,
  );

  if (!workspacePolicyFile) {
    return "SELF_APPROVAL_BLOCKED";
  }

  const parsed = parseRepositoryYaml(workspacePolicyFile.content);

  if (!parsed.ok) {
    throw new Error(
      `Workspace policy YAML is invalid: ${workspacePolicyPath}.`,
    );
  }

  const validated = validateWorkspacePolicyFile(parsed.value);

  if (!validated.ok) {
    throw new Error(`Workspace policy is invalid: ${workspacePolicyPath}.`);
  }

  return validated.value.spec.approval.mode;
}

async function verifyApproverAuthorization({
  allowMissingRoleMapping,
  approver,
  client,
  configPath,
  ref,
  repository,
}: {
  allowMissingRoleMapping?: boolean;
  approver: string;
  client: GateGitHubClient;
  configPath: string;
  ref?: string;
  repository: GateRepositoryRef;
}): Promise<{ allowed: boolean; message?: string }> {
  const effectiveRef = ref?.trim();

  if (!effectiveRef) {
    return {
      allowed: false,
      message: "Workflow ref is required for approver authorization.",
    };
  }

  const roleMappingPath = `${configPath.replace(/\/+$/u, "")}/policies/role-mapping.yml`;
  const roleMappingFile = await client.getFile(roleMappingPath, effectiveRef);

  if (!roleMappingFile) {
    if (allowMissingRoleMapping) {
      return { allowed: true };
    }

    return {
      allowed: false,
      message: `Role mapping file was not found: ${roleMappingPath}.`,
    };
  }

  const selector = parseApproverSelectorFromRoleMappingFile(
    roleMappingFile.content,
  );

  if (!selector) {
    return {
      allowed: false,
      message: `Role mapping file is invalid: ${roleMappingPath}.`,
    };
  }

  const normalizedApprover = approver.trim().toLowerCase();

  if (selector.githubUsers.length > 0) {
    const hasUserMatch = selector.githubUsers
      .map((value) => value.toLowerCase())
      .includes(normalizedApprover);

    if (hasUserMatch) {
      return { allowed: true };
    }
  }

  if (selector.repositoryRoles.length > 0) {
    const permission = await client.getRepositoryPermissionForUser(approver);
    const normalizedRoles = selector.repositoryRoles.map((value) =>
      value.toLowerCase(),
    );
    const actualRole = permission.roleName?.toLowerCase() ?? "";
    const fallbackRole = permission.permission.toLowerCase();

    if (
      normalizedRoles.includes(actualRole) ||
      normalizedRoles.includes(fallbackRole)
    ) {
      return { allowed: true };
    }
  }

  if (selector.githubTeams.length > 0) {
    for (const teamSlug of selector.githubTeams) {
      const membership = await client.getTeamMembershipForUser({
        org: repository.owner,
        teamSlug,
        username: approver,
      });

      if (membership?.state === "active") {
        return { allowed: true };
      }
    }
  }

  return { allowed: false };
}

function allowsSelfApproval(mode: WorkspaceApprovalMode): boolean {
  return mode === "SELF_APPROVAL_ALLOWED" || mode === "AUTO_APPROVE";
}

function deny(reasonCode: string, message: string): GateResult {
  return { message, reasonCode, result: "DENY" };
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
