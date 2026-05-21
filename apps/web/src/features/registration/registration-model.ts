import {
  formatYamlDiagnostics,
  parseYamlDocument,
  serializeYamlDocument,
} from "@batchtrail/domain";
import type {
  BatchDefinition,
  BatchStatus,
  Criticality,
  RunnerLabel,
  YamlValue,
} from "@batchtrail/domain";

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
    apiVersion: "batchtrail.io/v1",
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

  return [
    `name: ${yamlString(`BatchPlane - ${workflowName}`)}`,
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
    "",
    "permissions:",
    "  contents: read",
    "  issues: read",
    "",
    "jobs:",
    "  batchtrail-gate:",
    "    name: BatchPlane Gate",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - name: Verify approved execution evidence",
    "        uses: always0ne/batchtrail/actions/gate@main",
    "        with:",
    "          mode: lite",
    "          batch-id: ${{ inputs.batch_id }}",
    "          config-path: .batch-governance",
    "          request-id: ${{ inputs.request_id }}",
    "          approval-source: issue",
    "          approval-ref: ${{ inputs.request_id }}",
    "          request-digest: ${{ inputs.request_digest }}",
    "          github-token: ${{ secrets.GITHUB_TOKEN }}",
    "",
    "  run-batch:",
    "    name: Run governed batch",
    `    runs-on: ${runner}`,
    "    needs: batchtrail-gate",
    "    steps:",
    "      - name: Checkout registered assets",
    "        uses: actions/checkout@v4",
    "",
    "      - name: Run batch",
    "        run: |",
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

  return `batchtrail/register/${slug || "batch"}-${timestamp}`;
}

export function buildRegistrationPullRequestTitle(definition: BatchDefinition) {
  return `Register batch ${definition.batchId}`;
}

export function buildRegistrationPullRequestBody(definition: BatchDefinition) {
  const execution = definition.execution;

  return [
    "## BatchPlane Registration",
    "",
    `- Batch ID: \`${definition.batchId}\``,
    `- Name: ${definition.name}`,
    `- Environment: ${definition.environment}`,
    `- Criticality: ${definition.criticality}`,
    `- Workflow: \`${definition.workflow.path}\``,
    "- Runtime: GitHub Actions / BatchPlane Lite",
    `- Runs on: ${execution ? formatRunnerLabelText(execution.runsOn) : "not recorded"}`,
    "- BatchPlane Gate: required",
    ...(execution?.artifactPath
      ? [`- Execution file: \`${execution.artifactPath}\``]
      : []),
    "",
    "### Batch command",
    "",
    "```sh",
    execution?.command || "",
    "```",
    "",
    "This pull request was generated by BatchPlane Lite and registers both the governed batch definition and its GitHub Actions workflow.",
  ].join("\n");
}

function yamlString(value: string): string {
  return JSON.stringify(value);
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
