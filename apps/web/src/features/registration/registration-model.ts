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
  workflowPath: string;
  workflowRef: string;
  gateRequired: boolean;
};

export const defaultBatchRegistrationValues: BatchRegistrationFormValues = {
  batchId: "",
  name: "",
  owner: "",
  domain: "",
  environment: "PROD",
  criticality: "MEDIUM",
  status: "ACTIVE",
  workflowPath: ".github/workflows/",
  workflowRef: "main",
  gateRequired: true,
};

export function toBatchDefinition(
  values: BatchRegistrationFormValues,
): BatchDefinition {
  return {
    batchId: values.batchId.trim(),
    name: values.name.trim(),
    owner: values.owner.trim(),
    domain: values.domain.trim(),
    environment: values.environment.trim(),
    criticality: values.criticality,
    status: values.status,
    workflow: {
      path: values.workflowPath.trim(),
      ref: values.workflowRef.trim(),
    },
    gateRequired: values.gateRequired,
  };
}

export function getBatchDefinitionPath(batchId: string): string {
  return `.batch-governance/batches/${batchId.trim()}.yml`;
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
    "",
    "This pull request was generated by BatchTrail Repo Mode.",
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
