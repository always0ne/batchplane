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
  ScheduleDefinition,
  YamlValue,
} from "@batchplane/domain";

import {
  batchPlaneDispatcherActionRef,
  batchPlaneGateActionRef,
  batchPlaneScheduleRequestActionRef,
} from "../../shared/github-action-references";

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
  schedules?: BatchSchedule[];
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
  const workflowName = definition.name || definition.batchId || "New batch";
  const batchId = definition.batchId || "batch-id";
  const runCommandLines = indentRunCommand(runCommand);
  const runner = formatRunnerLabel(runnerLabel);
  const batchPath = getBatchDefinitionPath(batchId);
  const enabledSchedules = (definition.schedules ?? []).filter(
    (schedule) => schedule.enabled,
  );
  const scheduleEntries = Array.from(
    new Map(
      enabledSchedules
        .map((schedule) => ({
          cron: schedule.cron.trim(),
          timezone: schedule.timezone.trim(),
        }))
        .filter((schedule) => schedule.cron)
        .map((schedule) => [
          `${schedule.cron}@@${schedule.timezone}`,
          schedule,
        ]),
    ).values(),
  );

  return [
    `name: ${yamlString(`BatchPlane - ${workflowName}`)}`,
    "run-name: BatchPlane ${{ github.event.inputs.batch_id || 'scheduled' }} ${{ github.event.inputs.request_id || github.event.schedule || '' }}",
    "",
    "on:",
    "  workflow_dispatch:",
    "    inputs:",
    "      request_id:",
    "        description: BatchPlane execution request ID",
    "        required: true",
    "        type: string",
    "      batch_id:",
    "        description: BatchPlane batch ID",
    "        required: true",
    "        type: string",
    "      request_digest:",
    "        description: BatchPlane approved request digest",
    "        required: true",
    "        type: string",
    "      schedule_id:",
    "        description: BatchPlane schedule identifier for scheduled dispatches",
    "        required: false",
    "        type: string",
    ...(scheduleEntries.length > 0
      ? [
          "  schedule:",
          ...scheduleEntries.flatMap((schedule) => [
            `    - cron: ${yamlString(schedule.cron)}`,
            `      timezone: ${yamlString(schedule.timezone)}`,
          ]),
        ]
      : []),
    "",
    "jobs:",
    ...enabledSchedules.flatMap((schedule) =>
      buildScheduledRequestJobLines({
        batchId,
        batchPath,
        schedule,
      }),
    ),
    "  batchplane-gate:",
    "    name: BatchPlane Gate",
    "    if: github.event_name == 'workflow_dispatch'",
    "    runs-on: ubuntu-latest",
    "    permissions:",
    "      contents: read",
    "      issues: read",
    "    steps:",
    "      - name: Verify approved execution evidence",
    `        uses: ${batchPlaneGateActionRef}`,
    "        with:",
    "          mode: lite",
    "          batch-id: ${{ inputs.batch_id }}",
    "          config-path: .batch-governance",
    "          request-id: ${{ inputs.request_id }}",
    "          approval-source: issue",
    "          approval-ref: ${{ inputs.request_id }}",
    "          request-digest: ${{ inputs.request_digest }}",
    "          schedule-id: ${{ inputs.schedule_id }}",
    "          github-token: ${{ secrets.GITHUB_TOKEN }}",
    "",
    "  run-batch:",
    "    name: Run governed batch",
    "    if: github.event_name == 'workflow_dispatch'",
    `    runs-on: ${runner}`,
    "    needs: batchplane-gate",
    "    permissions:",
    "      contents: read",
    "    steps:",
    "      - name: Checkout registered assets",
    "        uses: actions/checkout@v4",
    "",
    "      - name: Run batch",
    "        run: |",
    '          echo "::group::BatchPlane batch command"',
    "          trap 'status=$?; echo \"::endgroup::\"; exit $status' EXIT",
    `          echo ${yamlString(`BatchPlane approved execution for ${batchId}`)}`,
    ...runCommandLines,
    "",
  ].join("\n");
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
  schedules: ScheduleDefinition[] = [],
  deletedSchedules: ScheduleDefinition[] = [],
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
            `- Batch ID: \`${schedule.batchId}\``,
            `- Schedule ID: \`${schedule.scheduleId}\``,
            `- Name: ${schedule.name}`,
            `- Batch definition: \`${schedule.definitionPath}\``,
            `- Cron: \`${schedule.cron}\``,
            `- Timezone: \`${schedule.timezone}\``,
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
            `- Batch ID: \`${schedule.batchId}\``,
            `- Schedule ID: \`${schedule.scheduleId}\``,
            `- Name: ${schedule.name}`,
            `- Batch definition: \`${schedule.definitionPath}\``,
            `- Cron: \`${schedule.cron}\``,
            `- Timezone: \`${schedule.timezone}\``,
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

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function githubExpressionString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
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

function indentRunCommand(runCommand: string): string[] {
  const lines = runCommand.trimEnd().split("\n");

  if (lines.length === 0 || lines.every((line) => !line.trim())) {
    return [
      "          # Define the governed batch command during registration.",
    ];
  }

  return lines.map((line) => `          ${line}`);
}

function formatRunnerLabel(runnerLabel: string): string {
  const runner = runnerLabel.trim() || "ubuntu-latest";

  if (runner.startsWith("[") || runner.startsWith("${{")) {
    return runner;
  }

  if (runner.includes(",")) {
    const labels = runner
      .split(",")
      .map((label) => label.trim())
      .filter(Boolean)
      .map(yamlString);

    return `[${labels.join(", ")}]`;
  }

  return yamlString(runner);
}

function buildScheduledRequestJobLines({
  batchId,
  batchPath,
  schedule,
}: {
  batchId: string;
  batchPath: string;
  schedule: BatchSchedule;
}): string[] {
  const jobId = toWorkflowJobId(`schedule-${schedule.scheduleId}`);

  return [
    `  ${jobId}:`,
    `    name: ${yamlString(`Schedule ${schedule.name || schedule.scheduleId}`)}`,
    `    if: github.event_name == 'schedule' && github.event.schedule == ${githubExpressionString(schedule.cron)} && github.run_attempt == 1`,
    "    concurrency:",
    `      group: ${yamlString(`batchplane-schedule-${toWorkflowJobId(batchId)}-${toWorkflowJobId(schedule.scheduleId)}`)}`,
    "      cancel-in-progress: false",
    "    runs-on: ubuntu-latest",
    "    permissions:",
    "      actions: write",
    "      contents: read",
    "      issues: write",
    "    steps:",
    "      - name: Create or reuse scheduled execution request",
    "        id: schedule_request",
    `        uses: ${batchPlaneScheduleRequestActionRef}`,
    "        with:",
    `          batch-id: ${yamlString(batchId)}`,
    `          schedule-id: ${yamlString(schedule.scheduleId)}`,
    `          cron: ${yamlString(schedule.cron)}`,
    `          timezone: ${yamlString(schedule.timezone)}`,
    `          definition-path: ${yamlString(batchPath)}`,
    "          config-path: .batch-governance",
    "          github-token: ${{ secrets.GITHUB_TOKEN }}",
    "      - name: Dispatch approved scheduled request",
    "        if: steps.schedule_request.outputs.approval-comment-id != ''",
    `        uses: ${batchPlaneDispatcherActionRef}`,
    "        with:",
    "          issue-number: ${{ steps.schedule_request.outputs.issue-number }}",
    "          comment-id: ${{ steps.schedule_request.outputs.approval-comment-id }}",
    "          github-token: ${{ secrets.GITHUB_TOKEN }}",
    "",
  ];
}

function toWorkflowJobId(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48) || "schedule_request"
  );
}
