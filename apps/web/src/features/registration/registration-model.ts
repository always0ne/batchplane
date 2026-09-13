import {
  formatYamlDiagnostics,
  parseYamlDocument,
  serializeYamlDocument,
} from "@batchplane/domain";
import type {
  BatchSchedule,
  BatchDefinition,
  BatchStatus,
  Criticality,
  RunnerLabel,
  YamlValue,
} from "@batchplane/domain";

import { buildBatchWorkflowYaml as buildCanonicalBatchWorkflowYaml } from "@batchplane/github-lite";

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

export type RegistrationRequestMode = "create" | "change" | "delete";

export type BatchDefinitionOptions = {
  artifactPath?: string | null;
  governedChangeId?: string;
  schedules?: BatchSchedule[];
};

export type GeneratedScheduleCron = {
  cron: string;
  source: "native";
};

export const defaultBatchRegistrationValues: BatchRegistrationFormValues = {
  batchId: "",
  name: "",
  owner: "",
  domain: "",
  environment: "PROD",
  criticality: "MEDIUM",
  status: "ACTIVE",
  runCommand: "",
  runnerLabel: "ubuntu-latest",
  workflowRef: "main",
};

export function toBatchRegistrationFormValues(
  definition: BatchDefinition,
): BatchRegistrationFormValues {
  return {
    batchId: definition.batchId,
    criticality: definition.criticality,
    domain: definition.domain,
    environment: definition.environment,
    name: definition.name,
    owner: definition.owner,
    runCommand: definition.execution?.command ?? "",
    runnerLabel: formatRunnerLabelInput(definition.execution?.runsOn),
    status: definition.status,
    workflowRef: definition.workflow.ref,
  };
}

export function toBatchDefinition(
  values: BatchRegistrationFormValues,
  options: BatchDefinitionOptions = {},
): BatchDefinition {
  const batchId = values.batchId.trim();
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
  const id = batchId.trim();

  if (!id) {
    return "";
  }

  return `.batch-governance/batches/${id}.yml`;
}

export function getBatchWorkflowPath(batchId: string): string {
  const slug = toFileSlug(batchId);

  if (!slug) {
    return "";
  }

  return `.github/workflows/${slug}.yml`;
}

export function getBatchArtifactPath(
  batchId: string,
  fileName: string,
): string {
  const batchSlug = toFileSlug(batchId);
  const fileSlug = toFileNameSlug(fileName);

  if (!batchSlug) {
    return "";
  }

  return `.batch-governance/batches/${batchSlug}/artifacts/${fileSlug || "artifact.bin"}`;
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

export function buildBatchWorkflowYaml(
  definition: BatchDefinition,
  runCommand: string,
  runnerLabel: string,
): string {
  return buildCanonicalBatchWorkflowYaml({
    ...definition,
    execution: {
      ...(definition.execution?.artifactPath
        ? { artifactPath: definition.execution.artifactPath }
        : {}),
      command: runCommand,
      runsOn: parseRunnerLabel(runnerLabel),
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

export function validateBatchRegistration(
  definition: BatchDefinition,
): string[] {
  const missingFields: string[] = [];

  if (!definition.batchId) missingFields.push("batchId");
  if (!definition.name) missingFields.push("name");
  if (!definition.owner) missingFields.push("owner");
  if (!definition.domain) missingFields.push("domain");
  if (!definition.environment) missingFields.push("environment");
  if (!definition.workflow.path) missingFields.push("workflow.path");
  if (!definition.workflow.ref) missingFields.push("workflow.ref");

  return missingFields;
}

export function createRegistrationBranchName(
  batchId: string,
  mode: RegistrationRequestMode = "create",
  date = new Date(),
): string {
  const timestamp = date
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replaceAll(".", "")
    .replaceAll("T", "")
    .replaceAll("Z", "")
    .slice(0, 14);
  const slug = batchId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  const prefix =
    mode === "delete" ? "delete" : mode === "change" ? "change" : "register";

  return `batchplane/${prefix}/${slug || "batch"}-${timestamp}`;
}

export function buildRegistrationPullRequestTitle(
  definition: BatchDefinition,
  mode: RegistrationRequestMode = "create",
) {
  const verb =
    mode === "delete" ? "Delete" : mode === "change" ? "Change" : "Register";

  return `${verb} batch ${definition.batchId}`;
}

export function buildRegistrationPullRequestBody(
  definition: BatchDefinition,
  mode: RegistrationRequestMode = "create",
  schedules: BatchSchedule[] = [],
  deletedSchedules: BatchSchedule[] = [],
) {
  const execution = definition.execution;
  const requestType = getRegistrationRequestType(mode);
  const heading =
    mode === "delete"
      ? "## BatchPlane Deletion"
      : mode === "change"
        ? "## BatchPlane Change"
        : "## BatchPlane Registration";
  const summary = getRegistrationRequestSummary(mode);
  const definitionSchedules = mode === "delete" ? [] : schedules;
  const deletionSchedules = mode === "delete" ? schedules : deletedSchedules;

  return [
    heading,
    "",
    `- Request type: ${requestType}`,
    `- Batch ID: \`${definition.batchId}\``,
    `- Name: ${definition.name}`,
    `- Owner: ${definition.owner}`,
    `- Domain: ${definition.domain}`,
    `- Environment: ${definition.environment}`,
    `- Criticality: ${definition.criticality}`,
    `- Workflow: \`${definition.workflow.path}\``,
    "- Runtime: GitHub Actions / BatchPlane Lite",
    `- Runs on: ${execution ? formatRunnerLabelText(execution.runsOn) : "not recorded"}`,
    "- BatchPlane Gate: required",
    ...(execution?.artifactPath
      ? [`- Execution file: \`${execution.artifactPath}\``]
      : []),
    `- Schedule count: ${schedules.length}`,
    `- Schedule deletion count: ${deletionSchedules.length}`,
    ...(mode === "delete"
      ? [
          "",
          "### Delete scope",
          "",
          `- Batch definition: \`${getBatchDefinitionPath(definition.batchId)}\``,
          `- Workflow: \`${definition.workflow.path}\``,
          ...(execution?.artifactPath
            ? [`- Execution file: \`${execution.artifactPath}\``]
            : []),
        ]
      : []),
    "",
    "### Batch command",
    "",
    "```sh",
    execution?.command || "",
    "```",
    ...(definitionSchedules.length > 0
      ? [
          "",
          "### Schedule definitions",
          "",
          ...definitionSchedules.flatMap((schedule, index) => [
            `#### Schedule ${index + 1}`,
            `- Schedule ID: \`${schedule.scheduleId}\``,
            `- Name: ${schedule.name}`,
            `- Cron: \`${schedule.cron}\``,
            `- Timezone: \`${schedule.timezone}\``,
            `- Generated scheduler cron: \`${formatGeneratedScheduleCrons(schedule)}\``,
            `- Enabled: ${schedule.enabled ? "true" : "false"}`,
            "",
          ]),
        ]
      : []),
    ...(deletionSchedules.length > 0
      ? [
          "",
          "### Schedule deletions",
          "",
          ...deletionSchedules.flatMap((schedule, index) => [
            `#### Deleted schedule ${index + 1}`,
            `- Schedule ID: \`${schedule.scheduleId}\``,
            `- Name: ${schedule.name}`,
            `- Cron: \`${schedule.cron}\``,
            `- Timezone: \`${schedule.timezone}\``,
            `- Generated scheduler cron: \`${formatGeneratedScheduleCrons(schedule)}\``,
            `- Enabled: ${schedule.enabled ? "true" : "false"}`,
            "",
          ]),
        ]
      : []),
    "",
    summary,
  ].join("\n");
}

function getRegistrationRequestType(
  mode: RegistrationRequestMode,
): "REGISTER" | "CHANGE" | "DELETE" {
  if (mode === "delete") {
    return "DELETE";
  }

  return mode === "change" ? "CHANGE" : "REGISTER";
}

function getRegistrationRequestSummary(mode: RegistrationRequestMode): string {
  if (mode === "delete") {
    return "This pull request was generated by BatchPlane Lite and deletes the governed batch definition, generated workflow, and optional execution file while keeping this request as the deleted batch archive.";
  }

  if (mode === "change") {
    return "This pull request was generated by BatchPlane Lite and updates the governed batch definition and its GitHub Actions workflow.";
  }

  return "This pull request was generated by BatchPlane Lite and registers both the governed batch definition and its GitHub Actions workflow.";
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

function toFileSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/[._-]+$/g, "")
    .replace(/^[._-]+/g, "")
    .slice(0, 80);
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

function formatRunnerLabelText(runsOn: RunnerLabel): string {
  return Array.isArray(runsOn) ? runsOn.join(", ") : runsOn;
}

function formatRunnerLabelInput(runsOn: RunnerLabel | undefined): string {
  if (!runsOn) {
    return defaultBatchRegistrationValues.runnerLabel;
  }

  return Array.isArray(runsOn) ? runsOn.join(", ") : runsOn;
}

export function getGeneratedScheduleCrons(
  schedule: Pick<BatchSchedule, "cron" | "timezone">,
): GeneratedScheduleCron[] {
  const cron = schedule.cron.trim();
  const timezone = schedule.timezone.trim();
  validateTimeZone(timezone);
  if (cron.split(/\s+/u).length !== 5) {
    throw new Error("GitHub Actions schedules require a 5-field cron.");
  }
  return [{ cron, source: "native" }];
}

export function formatGeneratedScheduleCrons(
  schedule: Pick<BatchSchedule, "cron" | "timezone">,
): string {
  return getGeneratedScheduleCrons(schedule)
    .map((entry) => entry.cron)
    .join(", ");
}

function validateTimeZone(timeZone: string): void {
  new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
}
