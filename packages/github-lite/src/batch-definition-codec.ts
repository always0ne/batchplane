import {
  formatYamlDiagnostics,
  isCanonicalBatchId,
  parseYamlDocument,
  serializeYamlDocument,
  validateBatchDefinitionFile,
} from "@batchplane/domain";
import type {
  BatchSchedule,
  BatchDefinition,
  BatchStatus,
  Criticality,
  RunnerLabel,
  YamlValue,
} from "@batchplane/domain";

export type BatchRegistrationFormValues = {
  batchId: string;
  name: string;
  owner: string;
  domain: string;
  environment: string;
  criticality: Criticality;
  status: BatchStatus;
  runCommand: string;
  runnerLabel: string;
  workflowRef: string;
};

export type BatchDefinitionOptions = {
  artifactPath?: string | null;
  governedChangeId?: string;
  schedules?: BatchSchedule[];
};

export function toBatchDefinition(
  values: BatchRegistrationFormValues,
  options: BatchDefinitionOptions = {},
): BatchDefinition {
  const batchId = assertCanonicalBatchId(values.batchId);
  const command = values.runCommand.trim();

  return {
    batchId,
    name: values.name.trim(),
    owner: values.owner.trim(),
    domain: values.domain.trim(),
    environment: values.environment.trim(),
    criticality: values.criticality,
    status: values.status,
    workflow: {
      path: getBatchWorkflowPath(batchId),
      ref: values.workflowRef.trim(),
    },
    gateRequired: true,
    ...(options.governedChangeId
      ? { governedChangeId: options.governedChangeId }
      : {}),
    execution: {
      artifactPath: options.artifactPath?.trim() || undefined,
      command,
      runsOn: parseRunnerLabel(values.runnerLabel),
    },
    schedules: options.schedules?.map((schedule) => ({
      cron: schedule.cron.trim(),
      enabled: schedule.enabled,
      name: schedule.name.trim(),
      scheduleId: schedule.scheduleId.trim(),
      timezone: schedule.timezone.trim(),
    })),
  };
}

export function getBatchDefinitionPath(batchId: string): string {
  return `.batch-governance/batches/${assertCanonicalBatchId(batchId)}.yml`;
}

export function getBatchWorkflowPath(batchId: string): string {
  return `.github/workflows/${assertCanonicalBatchId(batchId)}.yml`;
}

export function getBatchArtifactPath(
  batchId: string,
  fileName: string,
): string {
  const batchSlug = assertCanonicalBatchId(batchId);
  const fileSlug = toFileNameSlug(fileName);

  return `.batch-governance/batches/${batchSlug}/artifacts/${fileSlug || "artifact.bin"}`;
}

export function assertCanonicalBatchId(batchId: string): string {
  if (isCanonicalBatchId(batchId)) {
    return batchId;
  }

  throw new Error(
    "Batch ID must be a canonical repository-safe identifier containing only letters, digits, dots, and hyphens.",
  );
}

export function serializeBatchDefinitionYaml(
  definition: BatchDefinition,
): string {
  return serializeYamlDocument({
    apiVersion: "batchplane.io/v1",
    kind: "BatchDefinition",
    metadata: {
      governedChangeId: definition.governedChangeId,
      id: definition.batchId,
      name: definition.name,
    },
    spec: {
      criticality: definition.criticality,
      domain: definition.domain,
      environment: definition.environment,
      gateRequired: definition.gateRequired,
      owner: definition.owner,
      status: definition.status,
      workflow: {
        path: definition.workflow.path,
        ref: definition.workflow.ref,
      },
      execution: definition.execution
        ? {
            artifactPath: definition.execution.artifactPath,
            command: definition.execution.command,
            runsOn: definition.execution.runsOn,
          }
        : undefined,
      schedules: definition.schedules?.map((schedule) => ({
        cron: schedule.cron,
        enabled: schedule.enabled,
        id: schedule.scheduleId,
        name: schedule.name,
        timezone: schedule.timezone,
      })),
    },
  });
}

export function parseBatchDefinitionYaml(yaml: string): BatchDefinition {
  const result = parseYamlDocument(yaml);

  if (!result.ok) {
    throw new Error(
      `Invalid BatchPlane YAML: ${formatYamlDiagnostics(result.diagnostics)}`,
    );
  }

  const document = asYamlRecord(result.value);
  const validation = validateBatchDefinitionFile(document);

  if (!validation.ok) {
    throw new Error(
      `Invalid BatchPlane BatchDefinition: ${validation.diagnostics
        .map((diagnostic) => `${diagnostic.field}: ${diagnostic.message}`)
        .join("; ")}`,
    );
  }
  const metadata = asYamlRecord(document.metadata);
  const spec = asYamlRecord(document.spec);
  const workflow = asYamlRecord(spec.workflow);
  const execution = asYamlRecord(spec.execution);
  const schedules = readYamlSchedules(spec, "schedules");
  const criticality = parseCriticality(readYamlString(spec, "criticality"));
  const status = parseBatchStatus(readYamlString(spec, "status"));
  const command = readYamlString(execution, "command");
  const runsOn = readYamlRunnerLabel(execution, "runsOn");
  const artifactPath = readYamlString(execution, "artifactPath");

  return {
    batchId: readYamlString(metadata, "id"),
    governedChangeId: readYamlString(metadata, "governedChangeId") || undefined,
    name: readYamlString(metadata, "name"),
    owner: readYamlString(spec, "owner"),
    domain: readYamlString(spec, "domain"),
    environment: readYamlString(spec, "environment"),
    criticality,
    status,
    workflow: {
      path: readYamlString(workflow, "path"),
      ref: readYamlString(workflow, "ref"),
    },
    gateRequired: readYamlBoolean(spec, "gateRequired"),
    execution:
      command || runsOn
        ? {
            ...(artifactPath ? { artifactPath } : {}),
            command,
            runsOn: runsOn || "",
          }
        : undefined,
    schedules: schedules.length > 0 ? schedules : undefined,
  };
}

function asYamlRecord(
  value: YamlValue | undefined,
): Record<string, YamlValue | undefined> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function readYamlString(
  record: Record<string, YamlValue | undefined>,
  key: string,
): string {
  const value = record[key];

  if (value === undefined || value === null || Array.isArray(value)) {
    return "";
  }

  return typeof value === "object" ? "" : String(value);
}

function readYamlRunnerLabel(
  record: Record<string, YamlValue | undefined>,
  key: string,
): RunnerLabel | "" {
  const value = record[key];

  if (typeof value === "string") {
    return value;
  }

  if (
    Array.isArray(value) &&
    value.every((item): item is string => typeof item === "string")
  ) {
    return value;
  }

  return "";
}

function readYamlBoolean(
  record: Record<string, YamlValue | undefined>,
  key: string,
): boolean {
  return record[key] === true;
}

function readYamlSchedules(
  record: Record<string, YamlValue | undefined>,
  key: string,
): BatchSchedule[] {
  const value = record[key];

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => asYamlRecord(item))
    .map((item) => ({
      cron: readYamlString(item, "cron"),
      enabled: readYamlBoolean(item, "enabled"),
      name: readYamlString(item, "name"),
      scheduleId: readYamlString(item, "id"),
      timezone: readYamlString(item, "timezone"),
    }))
    .filter(
      (schedule) =>
        Boolean(schedule.scheduleId) ||
        Boolean(schedule.name) ||
        Boolean(schedule.cron) ||
        Boolean(schedule.timezone),
    );
}

function parseCriticality(value: string): Criticality {
  if (
    value === "LOW" ||
    value === "MEDIUM" ||
    value === "HIGH" ||
    value === "CRITICAL"
  ) {
    return value;
  }

  return "MEDIUM";
}

function parseBatchStatus(value: string): BatchStatus {
  if (value === "ACTIVE" || value === "INACTIVE") {
    return value;
  }

  return "INACTIVE";
}

function toFileNameSlug(value: string): string {
  return value
    .trim()
    .replace(/[\\/]+/g, "-")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/[._-]+$/g, "")
    .replace(/^[._-]+/g, "")
    .slice(0, 120);
}

function parseRunnerLabel(value: string): RunnerLabel {
  const runner = value.trim();

  if (runner.includes(",")) {
    const labels = runner
      .split(",")
      .map((label) => label.trim())
      .filter(Boolean);

    return labels.length > 0 ? labels : "";
  }

  return runner;
}
