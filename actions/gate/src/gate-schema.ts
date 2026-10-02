export type GitHubRepositoryRole = "admin" | "maintain" | "write" | "triage";

const batchPlaneApiVersion = "batchplane.io/v1";
const legacyBatchPlaneApiVersion = "batchtrail.io/v1";
const supportedBatchPlaneApiVersions = [
  batchPlaneApiVersion,
  legacyBatchPlaneApiVersion,
] as const;

type BatchPlaneApiVersion = (typeof supportedBatchPlaneApiVersions)[number];

export type ApproverSelector = {
  githubUsers?: string[];
  githubTeams?: string[];
  repositoryRoles?: GitHubRepositoryRole[];
};

export type BatchDefinitionFile = {
  apiVersion: BatchPlaneApiVersion;
  kind: "BatchDefinition";
  metadata: {
    id: string;
    name: string;
  };
  spec: {
    gateRequired: boolean;
    status: "ACTIVE" | "INACTIVE";
    workflow: {
      path: string;
      ref: string;
    };
    schedules?: Array<{
      cron: string;
      id: string;
      enabled: boolean;
    }>;
  };
};

export type RoleMappingFile = {
  apiVersion: BatchPlaneApiVersion;
  kind: "RoleMapping";
  metadata: {
    id: string;
  };
  spec: {
    roles: {
      approver: ApproverSelector;
    };
  };
};

export type WorkspaceApprovalMode =
  | "SELF_APPROVAL_BLOCKED"
  | "SELF_APPROVAL_ALLOWED"
  | "AUTO_APPROVE";

export type WorkspacePolicyFile = {
  apiVersion: BatchPlaneApiVersion;
  kind: "WorkspacePolicy";
  metadata: {
    id: string;
  };
  spec: {
    approval: {
      mode: WorkspaceApprovalMode;
    };
  };
};

export type ValidationResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
    };

type UnknownRecord = Record<string, unknown>;

const repositoryRoleValues = ["admin", "maintain", "write", "triage"] as const;
const workspaceApprovalModeValues = [
  "SELF_APPROVAL_BLOCKED",
  "SELF_APPROVAL_ALLOWED",
  "AUTO_APPROVE",
] as const;

export function validateBatchDefinitionFile(
  file: unknown,
): ValidationResult<BatchDefinitionFile> {
  if (!isRecord(file)) {
    return { ok: false };
  }

  if (
    !isBatchPlaneApiVersion(file.apiVersion) ||
    file.kind !== "BatchDefinition"
  ) {
    return { ok: false };
  }

  const metadata = asRecord(file.metadata);
  const spec = asRecord(file.spec);

  if (!metadata || !spec) {
    return { ok: false };
  }

  if (!isString(metadata.id) || !isString(metadata.name)) {
    return { ok: false };
  }

  const workflow = asRecord(spec.workflow);

  if (!workflow) {
    return { ok: false };
  }

  if (
    !isBoolean(spec.gateRequired) ||
    !isAllowedBatchStatus(spec.status) ||
    !isString(workflow.path) ||
    !isString(workflow.ref)
  ) {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      apiVersion: batchPlaneApiVersion,
      kind: "BatchDefinition",
      metadata: {
        id: metadata.id,
        name: metadata.name,
      },
      spec: {
        gateRequired: spec.gateRequired,
        schedules: Array.isArray(spec.schedules)
          ? spec.schedules
              .map(asRecord)
              .filter(
                (
                  schedule,
                ): schedule is {
                  cron: string;
                  id: string;
                  enabled: boolean;
                } =>
                  schedule !== null &&
                  isString(schedule.cron) &&
                  isString(schedule.id) &&
                  isBoolean(schedule.enabled),
              )
              .map((schedule) => ({
                cron: schedule.cron,
                enabled: schedule.enabled,
                id: schedule.id,
              }))
          : undefined,
        status: spec.status,
        workflow: {
          path: workflow.path,
          ref: workflow.ref,
        },
      },
    },
  };
}

export function validateRoleMappingFile(
  file: unknown,
): ValidationResult<RoleMappingFile> {
  if (!isRecord(file)) {
    return { ok: false };
  }

  if (!isBatchPlaneApiVersion(file.apiVersion) || file.kind !== "RoleMapping") {
    return { ok: false };
  }

  const metadata = asRecord(file.metadata);
  const spec = asRecord(file.spec);
  const roles = asRecord(spec?.roles);
  const approver = asRecord(roles?.approver);

  if (!metadata || !spec || !roles || !approver || !isString(metadata.id)) {
    return { ok: false };
  }

  const githubUsers = readOptionalStringArray(approver.githubUsers);
  const githubTeams = readOptionalStringArray(approver.githubTeams);
  const repositoryRoles = readOptionalRepositoryRolesArray(
    approver.repositoryRoles,
  );

  if (!githubUsers.ok || !githubTeams.ok || !repositoryRoles.ok) {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      apiVersion: batchPlaneApiVersion,
      kind: "RoleMapping",
      metadata: { id: metadata.id },
      spec: {
        roles: {
          approver: {
            ...(githubUsers.value ? { githubUsers: githubUsers.value } : {}),
            ...(githubTeams.value ? { githubTeams: githubTeams.value } : {}),
            ...(repositoryRoles.value
              ? { repositoryRoles: repositoryRoles.value }
              : {}),
          },
        },
      },
    },
  };
}

export function validateWorkspacePolicyFile(
  file: unknown,
): ValidationResult<WorkspacePolicyFile> {
  if (!isRecord(file)) {
    return { ok: false };
  }

  if (
    !isBatchPlaneApiVersion(file.apiVersion) ||
    file.kind !== "WorkspacePolicy"
  ) {
    return { ok: false };
  }

  const metadata = asRecord(file.metadata);
  const spec = asRecord(file.spec);
  const approval = asRecord(spec?.approval);

  if (
    !metadata ||
    !spec ||
    !approval ||
    !isString(metadata.id) ||
    !isWorkspaceApprovalMode(approval.mode)
  ) {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      apiVersion: batchPlaneApiVersion,
      kind: "WorkspacePolicy",
      metadata: { id: metadata.id },
      spec: {
        approval: {
          mode: approval.mode,
        },
      },
    },
  };
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function asRecord(value: unknown): UnknownRecord | null {
  return isRecord(value) ? value : null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isBatchPlaneApiVersion(value: unknown): value is BatchPlaneApiVersion {
  return (
    typeof value === "string" &&
    supportedBatchPlaneApiVersions.includes(value as BatchPlaneApiVersion)
  );
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isAllowedBatchStatus(value: unknown): value is "ACTIVE" | "INACTIVE" {
  return value === "ACTIVE" || value === "INACTIVE";
}

function isWorkspaceApprovalMode(
  value: unknown,
): value is WorkspaceApprovalMode {
  return workspaceApprovalModeValues.includes(value as never);
}

function readOptionalStringArray(
  value: unknown,
): { ok: true; value: string[] | undefined } | { ok: false } {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  if (!Array.isArray(value) || value.some((item) => !isString(item))) {
    return { ok: false };
  }

  return { ok: true, value: value as string[] };
}

function readOptionalRepositoryRolesArray(
  value: unknown,
): { ok: true; value: GitHubRepositoryRole[] | undefined } | { ok: false } {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  if (
    !Array.isArray(value) ||
    value.some((item) => !repositoryRoleValues.includes(item as never))
  ) {
    return { ok: false };
  }

  return { ok: true, value: value as GitHubRepositoryRole[] };
}
