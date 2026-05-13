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
        message: "Tabs are not supported in BatchTrail YAML indentation.",
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
