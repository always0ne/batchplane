export type BatchTrailApiVersion = "batchtrail.io/v1";

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

export type ExecutionRun = {
  runId: string;
  requestId: string;
  batchId: string;
  status: ExecutionRunStatus;
  startedAt?: string;
  completedAt?: string;
  workflowRunId?: string;
  workflowRunUrl?: string;
  gateDecision?: GateDecision;
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
  metadata?: Record<string, string | number | boolean>;
};

export type RuntimeMode = "mock" | "github-lite" | "server-api";

export type BatchGovernanceConfigFile = {
  apiVersion: BatchTrailApiVersion;
  kind: "BatchGovernanceConfig";
  metadata: {
    repository?: string;
  };
  spec: {
    configPath: ".batch-governance" | string;
    batchesPath: ".batch-governance/batches" | string;
    schedulesPath: ".batch-governance/schedules" | string;
    dispatcherWorkflowPath:
      | ".github/workflows/batchtrail-dispatcher.yml"
      | string;
    defaultWorkflowRef: string;
  };
};

export type BatchDefinitionFile = {
  apiVersion: BatchTrailApiVersion;
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
  apiVersion: BatchTrailApiVersion;
  kind: "ApprovalPolicy";
  metadata: {
    id: string;
    name: string;
  };
  spec: ApprovalPolicy;
};

export type RoleMappingFile = {
  apiVersion: BatchTrailApiVersion;
  kind: "RoleMapping";
  metadata: {
    id: string;
  };
  spec: RoleMapping;
};

export type ScheduleDefinitionFile = {
  apiVersion: BatchTrailApiVersion;
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
  apiVersion: BatchTrailApiVersion;
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
    workflow: WorkflowTarget;
    schedule?: ScheduleOccurrenceRef;
  };
};

export type GitHubLiteRepositoryFile =
  | BatchGovernanceConfigFile
  | BatchDefinitionFile
  | ApprovalPolicyFile
  | RoleMappingFile
  | ScheduleDefinitionFile
  | ExecutionRequestPayload;
