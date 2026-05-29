export const batchPlaneApiVersion = "batchplane.io/v1";
export const legacyBatchPlaneApiVersion = "batchtrail.io/v1";
export const supportedBatchPlaneApiVersions = [
  batchPlaneApiVersion,
  legacyBatchPlaneApiVersion,
] as const;

export type BatchPlaneApiVersion =
  (typeof supportedBatchPlaneApiVersions)[number];

export function isBatchPlaneApiVersion(
  value: unknown,
): value is BatchPlaneApiVersion {
  return (
    typeof value === "string" &&
    supportedBatchPlaneApiVersions.includes(value as BatchPlaneApiVersion)
  );
}

export type BatchStatus = "ACTIVE" | "INACTIVE";

export type Criticality = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type WorkflowTarget = {
  path: string;
  ref: string;
};

export type RunnerLabel = string | string[];

export type BatchDefinition = {
  batchId: string;
  name: string;
  owner: string;
  domain: string;
  environment: string;
  criticality: Criticality;
  status: BatchStatus;
  workflow: WorkflowTarget;
  gateRequired: boolean;
  description?: string;
  execution?: {
    runsOn: RunnerLabel;
    command: string;
    artifactPath?: string;
  };
  labels?: string[];
};

export type GitHubRepositoryRole = "admin" | "maintain" | "write" | "triage";

export type ApproverSelector = {
  githubUsers?: string[];
  githubTeams?: string[];
  repositoryRoles?: GitHubRepositoryRole[];
};

export type ApprovalSubjectType =
  | "BATCH_REGISTRATION"
  | "BATCH_CHANGE"
  | "EXECUTION_REQUEST"
  | "SCHEDULE_DEFINITION";

export type ApprovalPolicy = {
  policyId: string;
  name: string;
  requiredApprovals: number;
  approvers: ApproverSelector;
  preventSelfApproval: boolean;
  appliesTo: ApprovalSubjectType[];
};

export type WorkspaceApprovalMode =
  | "SELF_APPROVAL_BLOCKED"
  | "SELF_APPROVAL_ALLOWED"
  | "AUTO_APPROVE";

export type WorkspacePolicy = {
  approval: {
    mode: WorkspaceApprovalMode;
  };
};

export const defaultWorkspacePolicy: WorkspacePolicy = {
  approval: {
    mode: "SELF_APPROVAL_BLOCKED",
  },
};

export type RoleMappingRole =
  | "requester"
  | "approver"
  | "maintainer"
  | "auditor";

export type RoleMapping = {
  roles: Record<RoleMappingRole, ApproverSelector>;
};

export type ExecutionRequestStatus =
  | "REQUESTED"
  | "APPROVED"
  | "REJECTED"
  | "CANCELED"
  | "DISPATCHING"
  | "DISPATCHED"
  | "DISPATCH_FAILED";

export type ExecutionTriggerType = "MANUAL" | "SCHEDULE";

export type ScheduleOccurrenceRef = {
  scheduleId: string;
  scheduledAt: string;
  definitionPath: string;
  definitionCommitSha: string;
};

export type ExecutionRequest = {
  requestId: string;
  batchId: string;
  requestedBy: string;
  requestedAt: string;
  expiresAt: string;
  requestDigest: string;
  status: ExecutionRequestStatus;
  reason?: string;
  triggerType?: ExecutionTriggerType;
  schedule?: ScheduleOccurrenceRef;
};

export type ApprovalDecisionValue = "APPROVED" | "REJECTED";

export type ApprovalDecision = {
  decisionId: string;
  subjectType: ApprovalSubjectType;
  subjectId: string;
  decision: ApprovalDecisionValue;
  decidedBy: string;
  decidedAt: string;
  requestDigest?: string;
  reason?: string;
};

export type ExecutionRunStatus =
  | "QUEUED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "BLOCKED"
  | "CANCELED";

export type GateDecision = {
  allowed: boolean;
  reasonCode: string;
  message: string;
  decidedAt: string;
};

export type ExecutionRunJob = {
  jobId: string;
  name: string;
  status: ExecutionRunStatus;
  conclusion?: string;
  startedAt?: string;
  completedAt?: string;
  url?: string;
};

export type ExecutionRunJobLog = {
  jobId: string;
  content: string;
  truncated: boolean;
  sizeBytes: number;
};

export type FailureFollowUpStatus =
  | "OPEN"
  | "INVESTIGATING"
  | "RESOLVED"
  | "ACCEPTED_RISK";

export type FailureFollowUp = {
  followUpId: string;
  runId: string;
  requestId: string;
  batchId: string;
  status: FailureFollowUpStatus;
  owner: string;
  explanation: string;
  actionTaken: string;
  author: string;
  createdAt: string;
};

export type ExecutionRun = {
  runId: string;
  requestId: string;
  batchId: string;
  status: ExecutionRunStatus;
  actor?: string;
  startedAt?: string;
  completedAt?: string;
  event?: string;
  runAttempt?: number;
  workflowName?: string;
  workflowPath?: string;
  workflowRunId?: string;
  workflowRunUrl?: string;
  gateDecision?: GateDecision;
  jobs?: ExecutionRunJob[];
  requestIssueNumber?: number;
  requestIssueUrl?: string;
  failureFollowUps?: FailureFollowUp[];
};

export type AuditTimelineItemType =
  | "BATCH_REGISTERED"
  | "BATCH_CHANGED"
  | "EXECUTION_REQUESTED"
  | "APPROVAL_RECORDED"
  | "DISPATCH_RECORDED"
  | "GATE_DECIDED"
  | "RUN_COMPLETED"
  | "SCHEDULE_OCCURRED";

export type AuditTimelineItem = {
  itemId: string;
  type: AuditTimelineItemType;
  subjectType: "BATCH" | "EXECUTION_REQUEST" | "EXECUTION_RUN" | "SCHEDULE";
  subjectId: string;
  actor: string;
  occurredAt: string;
  summary: string;
  sourceUrl?: string;
  metadata?: Record<string, string | number | boolean>;
};

export type RuntimeMode = "mock" | "github-lite" | "server-api";

export type RepositoryRef = {
  owner: string;
  repo: string;
};

export type RepositoryUser = {
  login: string;
};

export type Repository = RepositoryRef & {
  defaultBranch: string;
  private: boolean;
  url: string;
};

export type RepositoryIssueState = "open" | "closed" | "all";

export type RepositoryIssue = {
  number: number;
  title: string;
  body: string;
  labels: string[];
  url: string;
  state: Exclude<RepositoryIssueState, "all">;
  author: string;
  createdAt?: string;
  updatedAt?: string;
  isPullRequest: boolean;
};

export type RepositoryIssueComment = {
  id: number;
  issueNumber: number;
  body: string;
  author: string;
  createdAt: string;
};

export type RepositoryPullRequestState = "open" | "closed" | "all";

export type RepositoryPullRequest = {
  number: number;
  title: string;
  url: string;
  head: string;
  base: string;
  state: Exclude<RepositoryPullRequestState, "all">;
  author: string;
  body: string;
  createdAt?: string;
  updatedAt?: string;
  merged: boolean;
};

export type RepositoryMergeResult = {
  merged: boolean;
  message: string;
  sha: string;
};

export type RepositoryFile = {
  content: string;
  path: string;
  ref: string;
};

export type RuntimeInstallationStatus = {
  installed: boolean;
  missingPaths: string[];
  presentPaths: string[];
  requiredPaths: string[];
};

export type RuntimeInstallationPullRequestResult = {
  pullRequest: RepositoryPullRequest;
  status: RuntimeInstallationStatus;
};

export type RegistrationArtifactInput = {
  path: string;
  content: string;
  encoding?: "utf-8" | "base64";
};

export type RegistrationTargetStatus = {
  batchDefinitionExists: boolean;
  workflowExists: boolean;
};

export type CreateRegistrationPullRequestInput = {
  artifact?: RegistrationArtifactInput;
  baseBranch: string;
  batchDefinitionPath: string;
  batchDefinitionYaml: string;
  body: string;
  branch: string;
  title: string;
  workflowPath: string;
  workflowYaml: string;
};

export type BatchPort = {
  listBatchDefinitions(params: { ref: string }): Promise<BatchDefinition[]>;
};

export type RegistrationPort = {
  checkRegistrationTargets(params: {
    baseBranch: string;
    batchDefinitionPath: string;
    workflowPath: string;
  }): Promise<RegistrationTargetStatus>;
  createRegistrationPullRequest(
    params: CreateRegistrationPullRequestInput,
  ): Promise<RepositoryPullRequest>;
};

export type ExecutionPort = {
  createFailureFollowUp(params: {
    actionTaken: string;
    explanation: string;
    owner: string;
    runId: string;
    status: FailureFollowUpStatus;
  }): Promise<FailureFollowUp>;
  createExecutionRequest(params: {
    body: string;
    labels: string[];
    title: string;
  }): Promise<RepositoryIssue>;
  getExecutionRun(params: { runId: string }): Promise<ExecutionRun | null>;
  getExecutionRunJobLog(params: { jobId: string }): Promise<ExecutionRunJobLog>;
  listExecutionRuns(params?: {
    batchId?: string;
    limit?: number;
    requestId?: string;
    workflowPath?: string;
  }): Promise<ExecutionRun[]>;
};

export type ApprovalPort = {
  listRegistrationRequests(params: {
    baseBranch: string;
    state?: RepositoryPullRequestState;
  }): Promise<RepositoryPullRequest[]>;
  readRegistrationRequestFile(params: {
    path: string;
    ref: string;
  }): Promise<RepositoryFile | null>;
  listExecutionRequestIssues(params?: {
    state?: RepositoryIssueState;
  }): Promise<RepositoryIssue[]>;
  listExecutionRequestComments(params: {
    issueNumber: number;
  }): Promise<RepositoryIssueComment[]>;
  approveRegistration(params: {
    body: string;
    commitTitle: string;
    pullNumber: number;
  }): Promise<RepositoryMergeResult>;
  rejectRegistration(params: {
    body: string;
    pullNumber: number;
  }): Promise<void>;
  approveExecution(params: {
    body: string;
    issueNumber: number;
  }): Promise<void>;
  rejectExecution(params: { body: string; issueNumber: number }): Promise<void>;
};

export type AuditPort = {
  listAuditTimeline(params?: { limit?: number }): Promise<AuditTimelineItem[]>;
};

export type SettingsPort = {
  getCurrentUser(): Promise<RepositoryUser>;
  getRepository(): Promise<Repository>;
  getWorkspacePolicy(params?: { ref?: string }): Promise<WorkspacePolicy>;
  checkInstallationStatus(params: {
    ref: string;
  }): Promise<RuntimeInstallationStatus>;
  createInstallationPullRequest(params: {
    defaultBranch: string;
  }): Promise<RuntimeInstallationPullRequestResult>;
  createWorkspacePolicyPullRequest(params: {
    defaultBranch: string;
    policy: WorkspacePolicy;
  }): Promise<RepositoryPullRequest>;
};

export type BatchPlaneRuntimePorts = {
  approvals: ApprovalPort;
  audit: AuditPort;
  batches: BatchPort;
  executions: ExecutionPort;
  registration: RegistrationPort;
  settings: SettingsPort;
};

export type BatchGovernanceConfigFile = {
  apiVersion: BatchPlaneApiVersion;
  kind: "BatchGovernanceConfig";
  metadata: {
    repository?: string;
  };
  spec: {
    configPath: ".batch-governance" | string;
    batchesPath: ".batch-governance/batches" | string;
    schedulesPath: ".batch-governance/schedules" | string;
    dispatcherWorkflowPath:
      | ".github/workflows/batchplane-dispatcher.yml"
      | string;
    defaultWorkflowRef: string;
  };
};

export type BatchDefinitionFile = {
  apiVersion: BatchPlaneApiVersion;
  kind: "BatchDefinition";
  metadata: {
    id: string;
    name: string;
    labels?: string[];
  };
  spec: {
    owner: string;
    domain: string;
    environment: string;
    criticality: Criticality;
    status: BatchStatus;
    workflow: WorkflowTarget;
    gateRequired: true;
    execution?: {
      runsOn: RunnerLabel;
      command: string;
      artifactPath?: string;
    };
  };
};

export type ApprovalPolicyFile = {
  apiVersion: BatchPlaneApiVersion;
  kind: "ApprovalPolicy";
  metadata: {
    id: string;
    name: string;
  };
  spec: ApprovalPolicy;
};

export type RoleMappingFile = {
  apiVersion: BatchPlaneApiVersion;
  kind: "RoleMapping";
  metadata: {
    id: string;
  };
  spec: RoleMapping;
};

export type WorkspacePolicyFile = {
  apiVersion: BatchPlaneApiVersion;
  kind: "WorkspacePolicy";
  metadata: {
    id: string;
  };
  spec: WorkspacePolicy;
};

export type ScheduleDefinitionFile = {
  apiVersion: BatchPlaneApiVersion;
  kind: "ScheduleDefinition";
  metadata: {
    id: string;
    batchId: string;
    name: string;
  };
  spec: {
    cron: string;
    timezone: string;
    enabled: boolean;
    approvalPolicyId: string;
  };
};

export type ExecutionRequestPayload = {
  apiVersion: BatchPlaneApiVersion;
  kind: "ExecutionRequest";
  metadata: {
    requestId: string;
    batchId: string;
  };
  spec: {
    triggerType?: ExecutionTriggerType;
    requestedBy: string;
    requestedAt: string;
    expiresAt: string;
    reason?: string;
    batch: Pick<
      BatchDefinition,
      "name" | "owner" | "domain" | "environment" | "criticality"
    >;
    parameters?: Record<
      string,
      | {
          sensitive?: false;
          value: string;
        }
      | {
          sensitive: true;
          valueDigest: string;
        }
    >;
    execution?: NonNullable<BatchDefinition["execution"]> & {
      gateRequired: boolean;
    };
    workflow: WorkflowTarget;
    schedule?: ScheduleOccurrenceRef;
  };
};

export type GitHubLiteRepositoryFile =
  | BatchGovernanceConfigFile
  | BatchDefinitionFile
  | ApprovalPolicyFile
  | RoleMappingFile
  | WorkspacePolicyFile
  | ScheduleDefinitionFile
  | ExecutionRequestPayload;

export type ValidationSeverity = "error" | "warning";

export type FieldValidationDiagnostic = {
  field: string;
  code: string;
  message: string;
  severity: ValidationSeverity;
};

export type ValidationResult<T> =
  | {
      diagnostics: [];
      ok: true;
      value: T;
    }
  | {
      diagnostics: FieldValidationDiagnostic[];
      ok: false;
    };

export type ApprovalPolicyInput = Omit<ApprovalPolicy, "preventSelfApproval"> &
  Partial<Pick<ApprovalPolicy, "preventSelfApproval">>;

export function validateBatchDefinition(
  definition: unknown,
): FieldValidationDiagnostic[] {
  const diagnostics: FieldValidationDiagnostic[] = [];
  const record = requireRecord(definition, "$", diagnostics);

  if (!record) {
    return diagnostics;
  }

  requireString(record, "batchId", diagnostics);
  requireString(record, "name", diagnostics);
  requireString(record, "owner", diagnostics);
  requireString(record, "domain", diagnostics);
  requireString(record, "environment", diagnostics);
  validateEnumField(
    record.criticality,
    "criticality",
    criticalityValues,
    diagnostics,
  );
  validateEnumField(record.status, "status", batchStatusValues, diagnostics);
  validateWorkflowTarget(record.workflow, "workflow", diagnostics);
  validateGateRequired(record.gateRequired, diagnostics);
  validateOptionalExecution(record.execution, diagnostics);
  validateOptionalStringArray(record.labels, "labels", diagnostics);

  return diagnostics;
}

export function validateBatchDefinitionFile(
  file: unknown,
): ValidationResult<BatchDefinitionFile> {
  const diagnostics: FieldValidationDiagnostic[] = [];
  const record = requireRecord(file, "$", diagnostics);

  if (!record) {
    return { diagnostics, ok: false };
  }

  validateBatchPlaneApiVersion(record.apiVersion, diagnostics);
  validateExactValue(record.kind, "kind", "BatchDefinition", diagnostics);

  const metadata = requireRecord(record.metadata, "metadata", diagnostics);
  const spec = requireRecord(record.spec, "spec", diagnostics);

  if (metadata && spec) {
    const batchDefinition = {
      batchId: metadata.id,
      criticality: spec.criticality,
      domain: spec.domain,
      environment: spec.environment,
      execution: spec.execution,
      gateRequired: spec.gateRequired,
      labels: metadata.labels,
      name: metadata.name,
      owner: spec.owner,
      status: spec.status,
      workflow: spec.workflow,
    };

    diagnostics.push(
      ...validateBatchDefinition(batchDefinition).map(
        mapBatchDefinitionDiagnosticToFile,
      ),
    );
  }

  if (diagnostics.length > 0) {
    return { diagnostics, ok: false };
  }

  return { diagnostics: [], ok: true, value: file as BatchDefinitionFile };
}

export function normalizeApprovalPolicy(
  policy: ApprovalPolicyInput,
): ApprovalPolicy {
  return {
    ...policy,
    preventSelfApproval: policy.preventSelfApproval ?? true,
  };
}

export function validateApprovalPolicy(
  policy: unknown,
): FieldValidationDiagnostic[] {
  const diagnostics: FieldValidationDiagnostic[] = [];
  const record = requireRecord(policy, "$", diagnostics);

  if (!record) {
    return diagnostics;
  }

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
  validateEnumArrayField(
    record.appliesTo,
    "appliesTo",
    approvalSubjectTypeValues,
    diagnostics,
  );

  return diagnostics;
}

export function validateApprovalPolicyFile(
  file: unknown,
): ValidationResult<ApprovalPolicyFile> {
  const diagnostics: FieldValidationDiagnostic[] = [];
  const record = requireRecord(file, "$", diagnostics);

  if (!record) {
    return { diagnostics, ok: false };
  }

  validateBatchPlaneApiVersion(record.apiVersion, diagnostics);
  validateExactValue(record.kind, "kind", "ApprovalPolicy", diagnostics);

  const metadata = requireRecord(record.metadata, "metadata", diagnostics);
  const spec = requireRecord(record.spec, "spec", diagnostics);

  if (metadata) {
    requireString(metadata, "id", diagnostics, "metadata.id");
    requireString(metadata, "name", diagnostics, "metadata.name");
  }

  if (spec) {
    diagnostics.push(
      ...validateApprovalPolicy(spec).map((diagnostic) => ({
        ...diagnostic,
        field: `spec.${diagnostic.field}`,
      })),
    );
  }

  if (diagnostics.length > 0) {
    return { diagnostics, ok: false };
  }

  return { diagnostics: [], ok: true, value: file as ApprovalPolicyFile };
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

  if (!record) {
    return diagnostics;
  }

  const approval = requireRecord(record.approval, "approval", diagnostics);

  if (approval) {
    validateEnumField(
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
  const diagnostics: FieldValidationDiagnostic[] = [];
  const record = requireRecord(file, "$", diagnostics);

  if (!record) {
    return { diagnostics, ok: false };
  }

  validateBatchPlaneApiVersion(record.apiVersion, diagnostics);
  validateExactValue(record.kind, "kind", "WorkspacePolicy", diagnostics);

  const metadata = requireRecord(record.metadata, "metadata", diagnostics);
  const spec = requireRecord(record.spec, "spec", diagnostics);

  if (metadata) {
    requireString(metadata, "id", diagnostics, "metadata.id");
  }

  if (spec) {
    diagnostics.push(
      ...validateWorkspacePolicy(spec).map((diagnostic) => ({
        ...diagnostic,
        field: `spec.${diagnostic.field}`,
      })),
    );
  }

  if (diagnostics.length > 0) {
    return { diagnostics, ok: false };
  }

  return { diagnostics: [], ok: true, value: file as WorkspacePolicyFile };
}

export function validateRoleMapping(
  roleMapping: unknown,
): FieldValidationDiagnostic[] {
  const diagnostics: FieldValidationDiagnostic[] = [];
  const record = requireRecord(roleMapping, "$", diagnostics);

  if (!record) {
    return diagnostics;
  }

  const roles = requireRecord(record.roles, "roles", diagnostics);

  if (!roles) {
    return diagnostics;
  }

  Object.keys(roles)
    .filter((role) => !roleMappingRoles.includes(role as RoleMappingRole))
    .forEach((role) => {
      diagnostics.push({
        code: "unexpected_role",
        field: `roles.${role}`,
        message: `Role '${role}' is not a supported BatchPlane role.`,
        severity: "error",
      });
    });

  roleMappingRoles.forEach((role) => {
    validateApproverSelector(roles[role], `roles.${role}`, diagnostics);
  });

  return diagnostics;
}

export function validateRoleMappingFile(
  file: unknown,
): ValidationResult<RoleMappingFile> {
  const diagnostics: FieldValidationDiagnostic[] = [];
  const record = requireRecord(file, "$", diagnostics);

  if (!record) {
    return { diagnostics, ok: false };
  }

  validateBatchPlaneApiVersion(record.apiVersion, diagnostics);
  validateExactValue(record.kind, "kind", "RoleMapping", diagnostics);

  const metadata = requireRecord(record.metadata, "metadata", diagnostics);
  const spec = requireRecord(record.spec, "spec", diagnostics);

  if (metadata) {
    requireString(metadata, "id", diagnostics, "metadata.id");
  }

  if (spec) {
    diagnostics.push(
      ...validateRoleMapping(spec).map((diagnostic) => ({
        ...diagnostic,
        field: `spec.${diagnostic.field}`,
      })),
    );
  }

  if (diagnostics.length > 0) {
    return { diagnostics, ok: false };
  }

  return { diagnostics: [], ok: true, value: file as RoleMappingFile };
}

export type YamlScalar = string | number | boolean | null;

export type YamlValue =
  | YamlScalar
  | YamlValue[]
  | { [key: string]: YamlValue | undefined };

export type YamlDiagnostic = {
  line: number;
  column: number;
  message: string;
};

export type YamlParseResult<T = YamlValue> =
  | {
      ok: true;
      value: T;
    }
  | {
      diagnostics: YamlDiagnostic[];
      ok: false;
    };

export function serializeYamlDocument(value: YamlValue): string {
  return `${serializeYamlValue(value, 0).join("\n")}\n`;
}

export function parseYamlDocument(input: string): YamlParseResult {
  const diagnostics: YamlDiagnostic[] = [];
  const root: Record<string, YamlValue | undefined> = {};
  const stack: Array<{
    indent: number;
    value: Record<string, YamlValue | undefined>;
  }> = [{ indent: -2, value: root }];
  const lines = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  lines.forEach((rawLine, index) => {
    const lineNumber = index + 1;

    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) {
      return;
    }

    if (rawLine.includes("\t")) {
      diagnostics.push({
        column: rawLine.indexOf("\t") + 1,
        line: lineNumber,
        message: "Tabs are not supported in BatchPlane YAML indentation.",
      });
      return;
    }

    const indent = countLeadingSpaces(rawLine);

    if (indent % 2 !== 0) {
      diagnostics.push({
        column: indent + 1,
        line: lineNumber,
        message: "Indentation must use two-space levels.",
      });
      return;
    }

    while (stack.length > 1 && indent <= stack[stack.length - 1]!.indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1]!;

    if (indent > parent.indent + 2) {
      diagnostics.push({
        column: indent + 1,
        line: lineNumber,
        message: "Indentation jumps more than one level.",
      });
      return;
    }

    const trimmed = rawLine.trim();
    const separatorIndex = trimmed.indexOf(":");

    if (separatorIndex <= 0) {
      diagnostics.push({
        column: indent + 1,
        line: lineNumber,
        message: "Expected a YAML key followed by ':'.",
      });
      return;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();

    if (!key) {
      diagnostics.push({
        column: indent + 1,
        line: lineNumber,
        message: "YAML keys must not be empty.",
      });
      return;
    }

    if (Object.hasOwn(parent.value, key)) {
      diagnostics.push({
        column: indent + 1,
        line: lineNumber,
        message: `Duplicate YAML key '${key}'.`,
      });
      return;
    }

    if (!rawValue) {
      const child: Record<string, YamlValue | undefined> = {};
      parent.value[key] = child;
      stack.push({ indent, value: child });
      return;
    }

    const parsedValue = parseYamlScalar(rawValue, lineNumber, indent + 1);

    if (parsedValue.ok) {
      parent.value[key] = parsedValue.value;
    } else {
      diagnostics.push(...parsedValue.diagnostics);
    }
  });

  if (diagnostics.length > 0) {
    return { diagnostics, ok: false };
  }

  return { ok: true, value: root };
}

export function formatYamlDiagnostics(diagnostics: YamlDiagnostic[]): string {
  return diagnostics
    .map(
      (diagnostic) =>
        `line ${diagnostic.line}, column ${diagnostic.column}: ${diagnostic.message}`,
    )
    .join("; ");
}

function serializeYamlValue(value: YamlValue, indent: number): string[] {
  if (!isYamlRecord(value)) {
    return [`${" ".repeat(indent)}${formatYamlScalar(value)}`];
  }

  return Object.entries(value).flatMap(([key, child]) => {
    if (child === undefined) {
      return [];
    }

    if (isYamlRecord(child)) {
      return [
        `${" ".repeat(indent)}${key}:`,
        ...serializeYamlValue(child, indent + 2),
      ];
    }

    return [`${" ".repeat(indent)}${key}: ${formatYamlScalar(child)}`];
  });
}

function formatYamlScalar(value: YamlValue): string {
  if (Array.isArray(value)) {
    return JSON.stringify(value.map((item) => normalizeInlineYamlValue(item)));
  }

  if (value === null) {
    return "null";
  }

  if (typeof value === "string") {
    return JSON.stringify(value.replace(/\r\n/g, "\n").replace(/\r/g, "\n"));
  }

  return String(value);
}

function normalizeInlineYamlValue(value: YamlValue): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeInlineYamlValue(item));
  }

  if (isYamlRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter((entry): entry is [string, YamlValue] => entry[1] !== undefined)
        .map(([key, child]) => [key, normalizeInlineYamlValue(child)]),
    );
  }

  return value;
}

function parseYamlScalar(
  value: string,
  line: number,
  column: number,
): YamlParseResult<YamlValue> {
  if (value === "true") {
    return { ok: true, value: true };
  }

  if (value === "false") {
    return { ok: true, value: false };
  }

  if (value === "null") {
    return { ok: true, value: null };
  }

  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return { ok: true, value: Number(value) };
  }

  if (value.startsWith('"') || value.startsWith("[") || value.startsWith("{")) {
    try {
      return { ok: true, value: JSON.parse(value) as YamlValue };
    } catch {
      return {
        diagnostics: [
          {
            column,
            line,
            message: "Invalid quoted or inline JSON YAML value.",
          },
        ],
        ok: false,
      };
    }
  }

  return { ok: true, value };
}

function isYamlRecord(
  value: YamlValue,
): value is { [key: string]: YamlValue | undefined } {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function countLeadingSpaces(value: string): number {
  return value.length - value.trimStart().length;
}

const batchStatusValues = ["ACTIVE", "INACTIVE"] as const;
const criticalityValues = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const repositoryRoleValues = ["admin", "maintain", "write", "triage"] as const;
const approvalSubjectTypeValues = [
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

type UnknownRecord = Record<string, unknown>;

function requireRecord(
  value: unknown,
  field: string,
  diagnostics: FieldValidationDiagnostic[],
): UnknownRecord | undefined {
  if (isRecord(value)) {
    return value;
  }

  diagnostics.push({
    code: value === undefined ? "required" : "invalid_type",
    field,
    message:
      value === undefined
        ? `${field} is required.`
        : `${field} must be an object.`,
    severity: "error",
  });

  return undefined;
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireString(
  record: UnknownRecord,
  key: string,
  diagnostics: FieldValidationDiagnostic[],
  field = key,
): string | undefined {
  const value = record[key];

  if (typeof value === "string" && value.trim()) {
    return value;
  }

  diagnostics.push({
    code: value === undefined || value === "" ? "required" : "invalid_type",
    field,
    message:
      value === undefined || value === ""
        ? `${field} is required.`
        : `${field} must be a non-empty string.`,
    severity: "error",
  });

  return undefined;
}

function validateExactValue(
  value: unknown,
  field: string,
  expected: string,
  diagnostics: FieldValidationDiagnostic[],
) {
  if (value === expected) {
    return;
  }

  diagnostics.push({
    code: value === undefined ? "required" : "invalid_value",
    field,
    message: `${field} must be '${expected}'.`,
    severity: "error",
  });
}

function validateBatchPlaneApiVersion(
  value: unknown,
  diagnostics: FieldValidationDiagnostic[],
) {
  if (isBatchPlaneApiVersion(value)) {
    return;
  }

  diagnostics.push({
    code: value === undefined ? "required" : "invalid_value",
    field: "apiVersion",
    message: `apiVersion must be one of: ${supportedBatchPlaneApiVersions.join(", ")}.`,
    severity: "error",
  });
}

function validateEnumField<const T extends readonly string[]>(
  value: unknown,
  field: string,
  allowedValues: T,
  diagnostics: FieldValidationDiagnostic[],
) {
  if (typeof value === "string" && allowedValues.includes(value)) {
    return;
  }

  diagnostics.push({
    code: value === undefined || value === "" ? "required" : "invalid_value",
    field,
    message: `${field} must be one of: ${allowedValues.join(", ")}.`,
    severity: "error",
  });
}

function validateEnumArrayField<const T extends readonly string[]>(
  value: unknown,
  field: string,
  allowedValues: T,
  diagnostics: FieldValidationDiagnostic[],
) {
  if (!Array.isArray(value)) {
    diagnostics.push({
      code: value === undefined ? "required" : "invalid_type",
      field,
      message: `${field} must be a non-empty array.`,
      severity: "error",
    });
    return;
  }

  if (value.length === 0) {
    diagnostics.push({
      code: "required",
      field,
      message: `${field} must include at least one value.`,
      severity: "error",
    });
    return;
  }

  value.forEach((item, index) => {
    if (typeof item === "string" && allowedValues.includes(item)) {
      return;
    }

    diagnostics.push({
      code: "invalid_value",
      field: `${field}.${index}`,
      message: `${field}.${index} must be one of: ${allowedValues.join(", ")}.`,
      severity: "error",
    });
  });
}

function validatePositiveInteger(
  value: unknown,
  field: string,
  diagnostics: FieldValidationDiagnostic[],
) {
  if (Number.isInteger(value) && Number(value) > 0) {
    return;
  }

  diagnostics.push({
    code: value === undefined ? "required" : "invalid_value",
    field,
    message: `${field} must be a positive integer.`,
    severity: "error",
  });
}

function validateOptionalBoolean(
  value: unknown,
  field: string,
  diagnostics: FieldValidationDiagnostic[],
) {
  if (value === undefined || typeof value === "boolean") {
    return;
  }

  diagnostics.push({
    code: "invalid_type",
    field,
    message: `${field} must be a boolean when provided.`,
    severity: "error",
  });
}

function validateWorkflowTarget(
  value: unknown,
  field: string,
  diagnostics: FieldValidationDiagnostic[],
) {
  const workflow = requireRecord(value, field, diagnostics);

  if (!workflow) {
    return;
  }

  const path = requireString(workflow, "path", diagnostics, `${field}.path`);
  requireString(workflow, "ref", diagnostics, `${field}.ref`);

  if (path && !/^\.github\/workflows\/[^/]+\.ya?ml$/u.test(path.trim())) {
    diagnostics.push({
      code: "invalid_workflow_path",
      field: `${field}.path`,
      message: `${field}.path must be a .yml or .yaml file directly under .github/workflows/.`,
      severity: "error",
    });
  }
}

function validateGateRequired(
  value: unknown,
  diagnostics: FieldValidationDiagnostic[],
) {
  if (value === true) {
    return;
  }

  diagnostics.push({
    code: value === undefined ? "required" : "gate_required",
    field: "gateRequired",
    message: "gateRequired must be true for Lite batches.",
    severity: "error",
  });
}

function validateOptionalExecution(
  value: unknown,
  diagnostics: FieldValidationDiagnostic[],
) {
  if (value === undefined) {
    return;
  }

  const execution = requireRecord(value, "execution", diagnostics);

  if (!execution) {
    return;
  }

  validateRunnerLabel(execution.runsOn, "execution.runsOn", diagnostics);
  requireString(execution, "command", diagnostics, "execution.command");

  if (
    execution.artifactPath !== undefined &&
    typeof execution.artifactPath !== "string"
  ) {
    diagnostics.push({
      code: "invalid_type",
      field: "execution.artifactPath",
      message: "execution.artifactPath must be a string when provided.",
      severity: "error",
    });
  }
}

function validateRunnerLabel(
  value: unknown,
  field: string,
  diagnostics: FieldValidationDiagnostic[],
) {
  if (typeof value === "string" && value.trim()) {
    return;
  }

  if (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof item === "string" && item.trim())
  ) {
    return;
  }

  diagnostics.push({
    code: value === undefined ? "required" : "invalid_type",
    field,
    message: `${field} must be a non-empty string or string array.`,
    severity: "error",
  });
}

function validateOptionalStringArray(
  value: unknown,
  field: string,
  diagnostics: FieldValidationDiagnostic[],
) {
  if (value === undefined) {
    return;
  }

  validateStringArray(value, field, diagnostics, false);
}

function validateStringArray(
  value: unknown,
  field: string,
  diagnostics: FieldValidationDiagnostic[],
  requireNonEmpty: boolean,
) {
  if (!Array.isArray(value)) {
    diagnostics.push({
      code: value === undefined ? "required" : "invalid_type",
      field,
      message: `${field} must be an array of non-empty strings.`,
      severity: "error",
    });
    return;
  }

  if (requireNonEmpty && value.length === 0) {
    diagnostics.push({
      code: "required",
      field,
      message: `${field} must include at least one value.`,
      severity: "error",
    });
    return;
  }

  value.forEach((item, index) => {
    if (typeof item === "string" && item.trim()) {
      return;
    }

    diagnostics.push({
      code: "invalid_type",
      field: `${field}.${index}`,
      message: `${field}.${index} must be a non-empty string.`,
      severity: "error",
    });
  });
}

function validateApproverSelector(
  value: unknown,
  field: string,
  diagnostics: FieldValidationDiagnostic[],
) {
  const selector = requireRecord(value, field, diagnostics);

  if (!selector) {
    return;
  }

  const hasGithubUsers =
    Array.isArray(selector.githubUsers) && selector.githubUsers.length > 0;
  const hasGithubTeams =
    Array.isArray(selector.githubTeams) && selector.githubTeams.length > 0;
  const hasRepositoryRoles =
    Array.isArray(selector.repositoryRoles) &&
    selector.repositoryRoles.length > 0;

  if (!hasGithubUsers && !hasGithubTeams && !hasRepositoryRoles) {
    diagnostics.push({
      code: "selector_required",
      field,
      message: `${field} must define at least one of githubUsers, githubTeams, or repositoryRoles.`,
      severity: "error",
    });
  }

  if (selector.githubUsers !== undefined) {
    validateStringArray(
      selector.githubUsers,
      `${field}.githubUsers`,
      diagnostics,
      true,
    );
  }

  if (selector.githubTeams !== undefined) {
    validateStringArray(
      selector.githubTeams,
      `${field}.githubTeams`,
      diagnostics,
      true,
    );
  }

  if (selector.repositoryRoles !== undefined) {
    validateEnumArrayField(
      selector.repositoryRoles,
      `${field}.repositoryRoles`,
      repositoryRoleValues,
      diagnostics,
    );
  }
}

function mapBatchDefinitionDiagnosticToFile(
  diagnostic: FieldValidationDiagnostic,
): FieldValidationDiagnostic {
  if (diagnostic.field === "batchId") {
    return { ...diagnostic, field: "metadata.id" };
  }

  if (diagnostic.field === "name") {
    return { ...diagnostic, field: "metadata.name" };
  }

  if (diagnostic.field === "labels") {
    return { ...diagnostic, field: "metadata.labels" };
  }

  if (diagnostic.field.startsWith("labels.")) {
    return {
      ...diagnostic,
      field: `metadata.${diagnostic.field}`,
    };
  }

  return { ...diagnostic, field: `spec.${diagnostic.field}` };
}
