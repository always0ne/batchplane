import {
  batchPlaneApiVersion,
  defaultWorkspacePolicy,
  isBatchPlaneApiVersion,
  legacyBatchPlaneApiVersion,
  type ApprovalSubjectType,
  type BatchStatus,
  type Criticality,
  type WorkspacePolicy,
} from "@batchplane/domain";

import type { ExecutionRequestPayload } from "./execution-request-evidence.js";
import type { GitHubBatchDefinition } from "./github-batch-definition.js";

export { batchPlaneApiVersion, legacyBatchPlaneApiVersion };

export type GitHubRepositoryRole = "admin" | "maintain" | "write" | "triage";

export type ApproverSelector = {
  githubTeams?: string[];
  githubUsers?: string[];
  repositoryRoles?: GitHubRepositoryRole[];
};

export type ApprovalPolicy = {
  policyId: string;
  name: string;
  requiredApprovals: number;
  approvers: ApproverSelector;
  preventSelfApproval: boolean;
  appliesTo: ApprovalSubjectType[];
};

export type ApprovalPolicyInput = Omit<ApprovalPolicy, "preventSelfApproval"> &
  Partial<Pick<ApprovalPolicy, "preventSelfApproval">>;

export type RoleMappingRole =
  | "requester"
  | "approver"
  | "maintainer"
  | "auditor";

export type RoleMapping = {
  roles: Record<RoleMappingRole, ApproverSelector>;
};

export type BatchGovernanceConfigFile = {
  apiVersion: typeof batchPlaneApiVersion | typeof legacyBatchPlaneApiVersion;
  kind: "BatchGovernanceConfig";
  metadata: { repository?: string };
  spec: {
    configPath: ".batch-governance" | string;
    batchesPath: ".batch-governance/batches" | string;
    dispatcherWorkflowPath:
      | ".github/workflows/batchplane-dispatcher.yml"
      | string;
    defaultWorkflowRef: string;
  };
};

export type BatchDefinitionFile = {
  apiVersion: typeof batchPlaneApiVersion | typeof legacyBatchPlaneApiVersion;
  kind: "BatchDefinition";
  metadata: {
    governedChangeId?: string;
    id: string;
    labels?: string[];
    name: string;
  };
  spec: {
    criticality: Criticality;
    domain: string;
    environment: string;
    execution?: {
      artifactPath?: string;
      command: string;
      runsOn: string | string[];
    };
    gateRequired: true;
    owner: string;
    schedules?: Array<{
      cron: string;
      enabled: boolean;
      id: string;
      name: string;
      timezone: string;
    }>;
    status: BatchStatus;
    workflow: { path: string; ref: string };
  };
};

export type ApprovalPolicyFile = {
  apiVersion: typeof batchPlaneApiVersion | typeof legacyBatchPlaneApiVersion;
  kind: "ApprovalPolicy";
  metadata: { id: string; name: string };
  spec: ApprovalPolicy;
};

export type RoleMappingFile = {
  apiVersion: typeof batchPlaneApiVersion | typeof legacyBatchPlaneApiVersion;
  kind: "RoleMapping";
  metadata: { id: string };
  spec: RoleMapping;
};

export type WorkspacePolicyFile = {
  apiVersion: typeof batchPlaneApiVersion | typeof legacyBatchPlaneApiVersion;
  kind: "WorkspacePolicy";
  metadata: { id: string };
  spec: WorkspacePolicy;
};

export type GitHubLiteRepositoryFile =
  | ApprovalPolicyFile
  | BatchDefinitionFile
  | BatchGovernanceConfigFile
  | ExecutionRequestPayload
  | RoleMappingFile
  | WorkspacePolicyFile;

export type ValidationSeverity = "error" | "warning";

export type FieldValidationDiagnostic = {
  field: string;
  code: string;
  message: string;
  severity: ValidationSeverity;
};

export type ValidationResult<T> =
  | { diagnostics: []; ok: true; value: T }
  | { diagnostics: FieldValidationDiagnostic[]; ok: false };

export function isCanonicalBatchId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9](?:[A-Za-z0-9]|[.-](?=[A-Za-z0-9]))*$/.test(value)
  );
}

export function validateBatchDefinition(
  definition: unknown,
): FieldValidationDiagnostic[] {
  const diagnostics: FieldValidationDiagnostic[] = [];
  const record = requireRecord(definition, "$", diagnostics);

  if (!record) return diagnostics;

  requireCanonicalBatchId(record.batchId, diagnostics);
  requireString(record, "name", diagnostics);
  requireString(record, "owner", diagnostics);
  requireString(record, "domain", diagnostics);
  requireString(record, "environment", diagnostics);
  validateEnum(
    record.criticality,
    "criticality",
    criticalityValues,
    diagnostics,
  );
  validateEnum(record.status, "status", batchStatusValues, diagnostics);
  validateWorkflow(record.workflow, "workflow", diagnostics);
  validateGateRequired(record.gateRequired, diagnostics);
  validateExecution(record.execution, diagnostics);
  validateStringArray(record.labels, "labels", diagnostics, false);
  validateSchedules(record.schedules, "schedules", diagnostics);
  return diagnostics;
}

export function validateBatchDefinitionFile(
  file: unknown,
): ValidationResult<BatchDefinitionFile> {
  const diagnostics: FieldValidationDiagnostic[] = [];
  const record = requireRecord(file, "$", diagnostics);

  if (!record) return { diagnostics, ok: false };

  validateApiVersion(record.apiVersion, diagnostics);
  validateExact(record.kind, "kind", "BatchDefinition", diagnostics);
  const metadata = requireRecord(record.metadata, "metadata", diagnostics);
  const spec = requireRecord(record.spec, "spec", diagnostics);

  if (metadata && spec) {
    const schedules = Array.isArray(spec.schedules)
      ? spec.schedules.map((schedule) => {
          const item = isRecord(schedule) ? schedule : {};
          return {
            cron: item.cron,
            enabled: item.enabled,
            name: item.name,
            scheduleId: item.id,
            timezone: item.timezone,
          };
        })
      : undefined;
    diagnostics.push(
      ...validateBatchDefinition({
        batchId: metadata.id,
        criticality: spec.criticality,
        domain: spec.domain,
        environment: spec.environment,
        execution: spec.execution,
        gateRequired: spec.gateRequired,
        labels: metadata.labels,
        name: metadata.name,
        owner: spec.owner,
        schedules,
        status: spec.status,
        workflow: spec.workflow,
      }).map(mapBatchDiagnosticToFile),
    );
  }

  return diagnostics.length
    ? { diagnostics, ok: false }
    : { diagnostics: [], ok: true, value: file as BatchDefinitionFile };
}

export function batchDefinitionFromFile(
  file: BatchDefinitionFile,
): GitHubBatchDefinition {
  return {
    batchId: file.metadata.id,
    criticality: file.spec.criticality,
    domain: file.spec.domain,
    environment: file.spec.environment,
    ...(file.spec.execution ? { execution: file.spec.execution } : {}),
    gateRequired: file.spec.gateRequired,
    ...(file.metadata.governedChangeId
      ? { governedChangeId: file.metadata.governedChangeId }
      : {}),
    ...(file.metadata.labels ? { labels: file.metadata.labels } : {}),
    name: file.metadata.name,
    owner: file.spec.owner,
    ...(file.spec.schedules
      ? {
          schedules: file.spec.schedules.map((schedule) => ({
            cron: schedule.cron,
            enabled: schedule.enabled,
            name: schedule.name,
            scheduleId: schedule.id,
            timezone: schedule.timezone,
          })),
        }
      : {}),
    status: file.spec.status,
    workflow: file.spec.workflow,
  };
}

export function normalizeApprovalPolicy(
  policy: ApprovalPolicyInput,
): ApprovalPolicy {
  return { ...policy, preventSelfApproval: policy.preventSelfApproval ?? true };
}

export function validateApprovalPolicy(
  policy: unknown,
): FieldValidationDiagnostic[] {
  const diagnostics: FieldValidationDiagnostic[] = [];
  const record = requireRecord(policy, "$", diagnostics);
  if (!record) return diagnostics;
  requireString(record, "policyId", diagnostics);
  requireString(record, "name", diagnostics);
  validatePositiveInteger(
    record.requiredApprovals,
    "requiredApprovals",
    diagnostics,
  );
  validateApproverSelector(record.approvers, "approvers", diagnostics);
  validateOptionalBoolean(
    record.preventSelfApproval,
    "preventSelfApproval",
    diagnostics,
  );
  validateEnumArray(
    record.appliesTo,
    "appliesTo",
    approvalSubjectValues,
    diagnostics,
  );
  return diagnostics;
}

export function validateApprovalPolicyFile(
  file: unknown,
): ValidationResult<ApprovalPolicyFile> {
  return validateFile<ApprovalPolicyFile>(
    file,
    "ApprovalPolicy",
    (spec, diagnostics) => {
      diagnostics.push(...withSpecPrefix(validateApprovalPolicy(spec)));
    },
  );
}

export function normalizeWorkspacePolicy(
  policy: Partial<WorkspacePolicy> | null | undefined,
): WorkspacePolicy {
  return {
    approval: {
      mode: policy?.approval?.mode ?? defaultWorkspacePolicy.approval.mode,
    },
  };
}

export function validateWorkspacePolicy(
  policy: unknown,
): FieldValidationDiagnostic[] {
  const diagnostics: FieldValidationDiagnostic[] = [];
  const record = requireRecord(policy, "$", diagnostics);
  if (!record) return diagnostics;
  const approval = requireRecord(record.approval, "approval", diagnostics);
  if (approval) {
    validateEnum(
      approval.mode,
      "approval.mode",
      workspaceApprovalModeValues,
      diagnostics,
    );
  }
  return diagnostics;
}

export function validateWorkspacePolicyFile(
  file: unknown,
): ValidationResult<WorkspacePolicyFile> {
  return validateFile<WorkspacePolicyFile>(
    file,
    "WorkspacePolicy",
    (spec, diagnostics) => {
      diagnostics.push(...withSpecPrefix(validateWorkspacePolicy(spec)));
    },
  );
}

export function validateRoleMapping(
  roleMapping: unknown,
): FieldValidationDiagnostic[] {
  const diagnostics: FieldValidationDiagnostic[] = [];
  const record = requireRecord(roleMapping, "$", diagnostics);
  if (!record) return diagnostics;
  const roles = requireRecord(record.roles, "roles", diagnostics);
  if (!roles) return diagnostics;
  Object.keys(roles)
    .filter((role) => !roleMappingRoles.includes(role as RoleMappingRole))
    .forEach((role) =>
      diagnostics.push(
        problem(
          "unexpected_role",
          `roles.${role}`,
          `Role '${role}' is not a supported BatchPlane role.`,
        ),
      ),
    );
  roleMappingRoles.forEach((role) =>
    validateApproverSelector(roles[role], `roles.${role}`, diagnostics),
  );
  return diagnostics;
}

export function validateRoleMappingFile(
  file: unknown,
): ValidationResult<RoleMappingFile> {
  return validateFile<RoleMappingFile>(
    file,
    "RoleMapping",
    (spec, diagnostics) => {
      diagnostics.push(...withSpecPrefix(validateRoleMapping(spec)));
    },
  );
}

function validateFile<T>(
  file: unknown,
  kind: "ApprovalPolicy" | "RoleMapping" | "WorkspacePolicy",
  validateSpec: (
    spec: unknown,
    diagnostics: FieldValidationDiagnostic[],
  ) => void,
): ValidationResult<T> {
  const diagnostics: FieldValidationDiagnostic[] = [];
  const record = requireRecord(file, "$", diagnostics);
  if (!record) return { diagnostics, ok: false };
  validateApiVersion(record.apiVersion, diagnostics);
  validateExact(record.kind, "kind", kind, diagnostics);
  const metadata = requireRecord(record.metadata, "metadata", diagnostics);
  const spec = requireRecord(record.spec, "spec", diagnostics);
  if (metadata) {
    requireString(metadata, "id", diagnostics, "metadata.id");
    if (kind === "ApprovalPolicy") {
      requireString(metadata, "name", diagnostics, "metadata.name");
    }
  }
  if (spec) validateSpec(spec, diagnostics);
  return diagnostics.length
    ? { diagnostics, ok: false }
    : { diagnostics: [], ok: true, value: file as T };
}

function withSpecPrefix(diagnostics: FieldValidationDiagnostic[]) {
  return diagnostics.map((diagnostic) => ({
    ...diagnostic,
    field: `spec.${diagnostic.field}`,
  }));
}

function requireRecord(
  value: unknown,
  field: string,
  diagnostics: FieldValidationDiagnostic[],
): Record<string, unknown> | undefined {
  if (isRecord(value)) return value;
  diagnostics.push(
    problem(
      value === undefined ? "required" : "invalid_type",
      field,
      value === undefined
        ? `${field} is required.`
        : `${field} must be an object.`,
    ),
  );
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireCanonicalBatchId(
  value: unknown,
  diagnostics: FieldValidationDiagnostic[],
) {
  if (isCanonicalBatchId(value)) return;
  diagnostics.push(
    problem(
      value === undefined || value === "" ? "required" : "invalid_batch_id",
      "batchId",
      value === undefined || value === ""
        ? "batchId is required."
        : "batchId must be a canonical repository-safe Batch ID.",
    ),
  );
}

function requireString(
  record: Record<string, unknown>,
  key: string,
  diagnostics: FieldValidationDiagnostic[],
  field = key,
) {
  const value = record[key];
  if (typeof value === "string" && value.trim()) return value;
  diagnostics.push(
    problem(
      value === undefined || value === "" ? "required" : "invalid_type",
      field,
      value === undefined || value === ""
        ? `${field} is required.`
        : `${field} must be a non-empty string.`,
    ),
  );
  return undefined;
}

function validateExact(
  value: unknown,
  field: string,
  expected: string,
  diagnostics: FieldValidationDiagnostic[],
) {
  if (value === expected) return;
  diagnostics.push(
    problem(
      value === undefined ? "required" : "invalid_value",
      field,
      `${field} must be '${expected}'.`,
    ),
  );
}

function validateApiVersion(
  value: unknown,
  diagnostics: FieldValidationDiagnostic[],
) {
  if (isBatchPlaneApiVersion(value)) return;
  diagnostics.push(
    problem(
      value === undefined ? "required" : "invalid_value",
      "apiVersion",
      "apiVersion must be one of: batchplane.io/v1, batchtrail.io/v1.",
    ),
  );
}

function validateEnum(
  value: unknown,
  field: string,
  values: readonly string[],
  diagnostics: FieldValidationDiagnostic[],
) {
  if (typeof value === "string" && values.includes(value)) return;
  diagnostics.push(
    problem(
      value === undefined || value === "" ? "required" : "invalid_value",
      field,
      `${field} must be one of: ${values.join(", ")}.`,
    ),
  );
}

function validateEnumArray(
  value: unknown,
  field: string,
  values: readonly string[],
  diagnostics: FieldValidationDiagnostic[],
) {
  if (!Array.isArray(value)) {
    diagnostics.push(
      problem(
        value === undefined ? "required" : "invalid_type",
        field,
        `${field} must be a non-empty array.`,
      ),
    );
    return;
  }
  if (!value.length) {
    diagnostics.push(
      problem("required", field, `${field} must include at least one value.`),
    );
    return;
  }
  value.forEach((item, index) => {
    if (typeof item !== "string" || !values.includes(item)) {
      diagnostics.push(
        problem(
          "invalid_value",
          `${field}.${index}`,
          `${field}.${index} must be one of: ${values.join(", ")}.`,
        ),
      );
    }
  });
}

function validatePositiveInteger(
  value: unknown,
  field: string,
  diagnostics: FieldValidationDiagnostic[],
) {
  if (Number.isInteger(value) && Number(value) > 0) return;
  diagnostics.push(
    problem(
      value === undefined ? "required" : "invalid_value",
      field,
      `${field} must be a positive integer.`,
    ),
  );
}

function validateOptionalBoolean(
  value: unknown,
  field: string,
  diagnostics: FieldValidationDiagnostic[],
) {
  if (value === undefined || typeof value === "boolean") return;
  diagnostics.push(
    problem("invalid_type", field, `${field} must be a boolean when provided.`),
  );
}

function validateWorkflow(
  value: unknown,
  field: string,
  diagnostics: FieldValidationDiagnostic[],
) {
  const workflow = requireRecord(value, field, diagnostics);
  if (!workflow) return;
  const path = requireString(workflow, "path", diagnostics, `${field}.path`);
  requireString(workflow, "ref", diagnostics, `${field}.ref`);
  if (path && !/^\.github\/workflows\/[^/]+\.ya?ml$/u.test(path.trim())) {
    diagnostics.push(
      problem(
        "invalid_workflow_path",
        `${field}.path`,
        `${field}.path must be a .yml or .yaml file directly under .github/workflows/.`,
      ),
    );
  }
}

function validateGateRequired(
  value: unknown,
  diagnostics: FieldValidationDiagnostic[],
) {
  if (value === true) return;
  diagnostics.push(
    problem(
      value === undefined ? "required" : "gate_required",
      "gateRequired",
      "gateRequired must be true for Lite batches.",
    ),
  );
}

function validateExecution(
  value: unknown,
  diagnostics: FieldValidationDiagnostic[],
) {
  if (value === undefined) return;
  const execution = requireRecord(value, "execution", diagnostics);
  if (!execution) return;
  const runsOn = execution.runsOn;
  if (
    !(typeof runsOn === "string" && runsOn.trim()) &&
    !(
      Array.isArray(runsOn) &&
      runsOn.length &&
      runsOn.every((item) => typeof item === "string" && item.trim())
    )
  ) {
    diagnostics.push(
      problem(
        runsOn === undefined ? "required" : "invalid_type",
        "execution.runsOn",
        "execution.runsOn must be a non-empty string or string array.",
      ),
    );
  }
  requireString(execution, "command", diagnostics, "execution.command");
  if (
    execution.artifactPath !== undefined &&
    typeof execution.artifactPath !== "string"
  ) {
    diagnostics.push(
      problem(
        "invalid_type",
        "execution.artifactPath",
        "execution.artifactPath must be a string when provided.",
      ),
    );
  }
}

function validateSchedules(
  value: unknown,
  field: string,
  diagnostics: FieldValidationDiagnostic[],
) {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    diagnostics.push(
      problem(
        "invalid_type",
        field,
        `${field} must be an array when provided.`,
      ),
    );
    return;
  }
  value.forEach((schedule, index) => {
    const item = requireRecord(schedule, `${field}.${index}`, diagnostics);
    if (!item) return;
    requireString(
      item,
      "scheduleId",
      diagnostics,
      `${field}.${index}.scheduleId`,
    );
    requireString(item, "name", diagnostics, `${field}.${index}.name`);
    requireString(item, "cron", diagnostics, `${field}.${index}.cron`);
    requireString(item, "timezone", diagnostics, `${field}.${index}.timezone`);
    if (typeof item.enabled !== "boolean")
      diagnostics.push(
        problem(
          item.enabled === undefined ? "required" : "invalid_type",
          `${field}.${index}.enabled`,
          `${field}.${index}.enabled must be a boolean.`,
        ),
      );
  });
}

function validateStringArray(
  value: unknown,
  field: string,
  diagnostics: FieldValidationDiagnostic[],
  required: boolean,
) {
  if (value === undefined && !required) return;
  if (!Array.isArray(value)) {
    diagnostics.push(
      problem(
        value === undefined ? "required" : "invalid_type",
        field,
        `${field} must be an array of non-empty strings.`,
      ),
    );
    return;
  }
  if (required && !value.length)
    diagnostics.push(
      problem("required", field, `${field} must include at least one value.`),
    );
  value.forEach((item, index) => {
    if (typeof item !== "string" || !item.trim())
      diagnostics.push(
        problem(
          "invalid_type",
          `${field}.${index}`,
          `${field}.${index} must be a non-empty string.`,
        ),
      );
  });
}

function validateApproverSelector(
  value: unknown,
  field: string,
  diagnostics: FieldValidationDiagnostic[],
) {
  const selector = requireRecord(value, field, diagnostics);
  if (!selector) return;
  const hasValue = [
    selector.githubUsers,
    selector.githubTeams,
    selector.repositoryRoles,
  ].some((candidate) => Array.isArray(candidate) && candidate.length);
  if (!hasValue)
    diagnostics.push(
      problem(
        "selector_required",
        field,
        `${field} must define at least one of githubUsers, githubTeams, or repositoryRoles.`,
      ),
    );
  if (selector.githubUsers !== undefined)
    validateStringArray(
      selector.githubUsers,
      `${field}.githubUsers`,
      diagnostics,
      true,
    );
  if (selector.githubTeams !== undefined)
    validateStringArray(
      selector.githubTeams,
      `${field}.githubTeams`,
      diagnostics,
      true,
    );
  if (selector.repositoryRoles !== undefined)
    validateEnumArray(
      selector.repositoryRoles,
      `${field}.repositoryRoles`,
      repositoryRoleValues,
      diagnostics,
    );
}

function mapBatchDiagnosticToFile(
  diagnostic: FieldValidationDiagnostic,
): FieldValidationDiagnostic {
  if (diagnostic.field === "batchId")
    return { ...diagnostic, field: "metadata.id" };
  if (diagnostic.field === "name")
    return { ...diagnostic, field: "metadata.name" };
  if (diagnostic.field === "labels" || diagnostic.field.startsWith("labels."))
    return { ...diagnostic, field: `metadata.${diagnostic.field}` };
  if (diagnostic.field.startsWith("schedules."))
    return {
      ...diagnostic,
      field: `spec.${diagnostic.field.replace(/^(schedules\.\d+)\.scheduleId$/u, "$1.id")}`,
    };
  return { ...diagnostic, field: `spec.${diagnostic.field}` };
}

function problem(
  code: string,
  field: string,
  message: string,
): FieldValidationDiagnostic {
  return { code, field, message, severity: "error" };
}

const batchStatusValues = ["ACTIVE", "INACTIVE"] as const;
const criticalityValues = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const repositoryRoleValues = ["admin", "maintain", "write", "triage"] as const;
const approvalSubjectValues = [
  "BATCH_REGISTRATION",
  "BATCH_CHANGE",
  "EXECUTION_REQUEST",
  "SCHEDULE_DEFINITION",
] as const;
const workspaceApprovalModeValues = [
  "SELF_APPROVAL_BLOCKED",
  "SELF_APPROVAL_ALLOWED",
  "AUTO_APPROVE",
] as const;
const roleMappingRoles: RoleMappingRole[] = [
  "requester",
  "approver",
  "maintainer",
  "auditor",
];
