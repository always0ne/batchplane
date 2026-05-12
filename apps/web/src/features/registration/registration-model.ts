import type {
  BatchDefinition,
  BatchStatus,
  Criticality,
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
): BatchDefinition {
  const batchId = values.batchId.trim();

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
  return [
    "apiVersion: batchtrail.io/v1",
    "kind: BatchDefinition",
    "metadata:",
    `  id: ${yamlString(definition.batchId)}`,
    `  name: ${yamlString(definition.name)}`,
    "spec:",
    `  owner: ${yamlString(definition.owner)}`,
    `  domain: ${yamlString(definition.domain)}`,
    `  environment: ${yamlString(definition.environment)}`,
    `  criticality: ${yamlString(definition.criticality)}`,
    `  status: ${yamlString(definition.status)}`,
    "  workflow:",
    `    path: ${yamlString(definition.workflow.path)}`,
    `    ref: ${yamlString(definition.workflow.ref)}`,
    `  gateRequired: ${definition.gateRequired ? "true" : "false"}`,
    "",
  ].join("\n");
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
    `name: ${yamlString(`BatchTrail - ${workflowName}`)}`,
    "",
    "on:",
    "  workflow_dispatch:",
    "    inputs:",
    "      request_id:",
    "        description: BatchTrail execution request ID",
    "        required: true",
    "        type: string",
    "      batch_id:",
    "        description: BatchTrail batch ID",
    "        required: true",
    "        type: string",
    "      request_digest:",
    "        description: BatchTrail approved request digest",
    "        required: true",
    "        type: string",
    "",
    "permissions:",
    "  contents: read",
    "  issues: read",
    "",
    "jobs:",
    "  batchtrail-gate:",
    "    name: BatchTrail Gate",
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
    `          echo ${yamlString(`BatchTrail approved execution for ${batchId}`)}`,
    ...runCommandLines,
    "",
  ].join("\n");
}

export function parseBatchDefinitionYaml(yaml: string): BatchDefinition {
  const fieldMap = new Map<string, string>();
  let section = "";
  let nestedSection = "";

  for (const rawLine of yaml.split("\n")) {
    const line = rawLine.trimEnd();

    if (!line.trim() || line.trimStart().startsWith("#")) {
      continue;
    }

    if (!line.startsWith(" ") && line.endsWith(":")) {
      section = line.slice(0, -1);
      nestedSection = "";
      continue;
    }

    if (line.startsWith("  ") && !line.startsWith("    ")) {
      const [key, value] = splitYamlPair(line.trim());

      if (value === undefined) {
        nestedSection = key;
        continue;
      }

      fieldMap.set(`${section}.${key}`, value);
      nestedSection = "";
      continue;
    }

    if (line.startsWith("    ")) {
      const [key, value] = splitYamlPair(line.trim());

      if (value !== undefined) {
        fieldMap.set(`${section}.${nestedSection}.${key}`, value);
      }
    }
  }

  const criticality = parseCriticality(
    readYamlString(fieldMap, "spec.criticality"),
  );
  const status = parseBatchStatus(readYamlString(fieldMap, "spec.status"));

  return {
    batchId: readYamlString(fieldMap, "metadata.id"),
    name: readYamlString(fieldMap, "metadata.name"),
    owner: readYamlString(fieldMap, "spec.owner"),
    domain: readYamlString(fieldMap, "spec.domain"),
    environment: readYamlString(fieldMap, "spec.environment"),
    criticality,
    status,
    workflow: {
      path: readYamlString(fieldMap, "spec.workflow.path"),
      ref: readYamlString(fieldMap, "spec.workflow.ref"),
    },
    gateRequired: readYamlBoolean(fieldMap, "spec.gateRequired"),
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
  return [
    "## BatchTrail Registration",
    "",
    `- Batch ID: \`${definition.batchId}\``,
    `- Name: ${definition.name}`,
    `- Environment: ${definition.environment}`,
    `- Criticality: ${definition.criticality}`,
    `- Workflow: \`${definition.workflow.path}\``,
    "- BatchTrail Gate: required",
    "",
    "This pull request was generated by BatchTrail Repo Mode and registers both the governed batch definition and its GitHub Actions workflow.",
  ].join("\n");
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function splitYamlPair(line: string): [string, string | undefined] {
  const separatorIndex = line.indexOf(":");

  if (separatorIndex < 0) {
    return [line, undefined];
  }

  const key = line.slice(0, separatorIndex).trim();
  const value = line.slice(separatorIndex + 1).trim();

  return [key, value || undefined];
}

function readYamlString(fieldMap: Map<string, string>, path: string): string {
  const rawValue = fieldMap.get(path);

  if (!rawValue) {
    return "";
  }

  try {
    const parsedValue = JSON.parse(rawValue) as unknown;
    return typeof parsedValue === "string" ? parsedValue : String(parsedValue);
  } catch {
    return rawValue;
  }
}

function readYamlBoolean(fieldMap: Map<string, string>, path: string): boolean {
  return fieldMap.get(path) === "true";
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
