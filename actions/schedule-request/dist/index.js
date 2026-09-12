// src/index.ts
import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// ../../packages/digest/src/index.ts
function canonicalize(value) {
  return JSON.stringify(normalize(value));
}
async function createCanonicalDigest(value) {
  return `sha256:${await sha256Hex(canonicalize(value))}`;
}
async function createParameterDigest(parameters) {
  return createCanonicalDigest({ parameters });
}
async function createRequestDigest(input) {
  return createCanonicalDigest(isDigestEnvelope(input) ? input.payload : input);
}
async function sha256Hex(value) {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return digestToHex(digest);
}
async function sha256BytesHex(value) {
  const bytes = toByteView(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return digestToHex(digest);
}
function toByteView(value) {
  const source = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  const copiedBytes = new Uint8Array(source.byteLength);
  copiedBytes.set(source);
  return copiedBytes;
}
function digestToHex(digest) {
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0")
  ).join("");
}
function normalize(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalize(item));
  }
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((acc, key) => {
      const entry = value[key];
      if (entry === void 0 || entry === null || entry === "") {
        return acc;
      }
      acc[key] = normalize(entry);
      return acc;
    }, {});
  }
  if (typeof value === "string") {
    return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }
  return value;
}
function isDigestEnvelope(value) {
  return Boolean(
    value && typeof value === "object" && !Array.isArray(value) && "payload" in value
  );
}

// ../../packages/domain/src/governed-change.ts
var governedChangeEvidenceVersion = "batchplane.io/governed-change/v2";
async function createGovernedChangeRequestDigest(evidence) {
  return createCanonicalDigest(toRequestDigestPayload(evidence));
}
async function createTargetRevisionDigest(artifacts) {
  const resultingArtifacts = artifacts.filter((artifact) => artifact.afterDigest !== null).map(({ afterDigest, kind, path }) => ({ afterDigest, kind, path }));
  return createCanonicalDigest({
    artifacts: sortArtifacts(resultingArtifacts),
    resultingState: resultingArtifacts.length === 0 ? "EMPTY" : "PRESENT",
    version: governedChangeEvidenceVersion
  });
}
function toRequestDigestPayload(evidence) {
  return {
    artifacts: sortArtifacts(evidence.artifacts).map(toArtifactDigestPayload),
    baseRevisionSha: evidence.baseRevisionSha,
    batchId: evidence.batchId,
    governedChangeId: evidence.governedChangeId,
    headRevisionSha: evidence.headRevisionSha,
    repository: evidence.repository,
    requester: evidence.requester,
    requestedAt: evidence.requestedAt,
    ...evidence.remediation ? { remediation: evidence.remediation } : {},
    targetRevisionDigest: evidence.targetRevisionDigest,
    type: evidence.type,
    version: evidence.version,
    workspace: evidence.workspace
  };
}
function toArtifactDigestPayload(artifact) {
  return {
    afterDigest: artifact.afterDigest,
    beforeDigest: artifact.beforeDigest,
    kind: artifact.kind,
    path: artifact.path
  };
}
function sortArtifacts(artifacts) {
  return [...artifacts].sort(
    (left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0
  );
}

// ../../packages/domain/src/index.ts
var batchPlaneApiVersion = "batchplane.io/v1";
var legacyBatchPlaneApiVersion = "batchtrail.io/v1";
var supportedBatchPlaneApiVersions = [
  batchPlaneApiVersion,
  legacyBatchPlaneApiVersion
];
function isBatchPlaneApiVersion(value) {
  return typeof value === "string" && supportedBatchPlaneApiVersions.includes(value);
}
function isCanonicalBatchId(value) {
  return typeof value === "string" && /^[A-Za-z0-9](?:[A-Za-z0-9]|[.-](?=[A-Za-z0-9]))*$/.test(value);
}
var defaultWorkspacePolicy = {
  approval: {
    mode: "SELF_APPROVAL_BLOCKED"
  }
};
async function buildExecutionRequestIssue({
  approvedBatchRevision,
  batch,
  expiresAt,
  parameters = [],
  reason = "Manual request from BatchPlane Lite.",
  requestId,
  requestedAt,
  requestedBy,
  schedule,
  triggerType = "MANUAL",
  workflowRef
}) {
  if (!approvedBatchRevision.governedChangeId.trim() || !approvedBatchRevision.targetRevisionDigest.startsWith("sha256:")) {
    throw new Error(
      "Execution requests require an approved governed Batch revision binding."
    );
  }
  const effectiveRequestId = requestId ?? (triggerType === "SCHEDULE" && schedule ? await createScheduledExecutionRequestId(
    batch.batchId,
    schedule.scheduleId,
    schedule.repositoryId,
    schedule.sourceRunId
  ) : createExecutionRequestId(batch.batchId, requestedAt));
  const requestedAtIso = requestedAt.toISOString();
  if (triggerType !== "SCHEDULE" && !expiresAt) {
    throw new Error("Manual execution requests require an expiration time.");
  }
  const expiresAtIso = expiresAt?.toISOString();
  const parameterPayload = await buildParameterPayload(parameters);
  const effectiveWorkflowRef = workflowRef?.trim() || batch.workflow.ref;
  const payload = {
    apiVersion: batchPlaneApiVersion,
    kind: "ExecutionRequest",
    metadata: {
      batchId: batch.batchId,
      requestId: effectiveRequestId
    },
    spec: {
      approvedBatchRevision: {
        governedChangeId: approvedBatchRevision.governedChangeId.trim(),
        targetRevisionDigest: approvedBatchRevision.targetRevisionDigest.trim()
      },
      batch: {
        criticality: batch.criticality,
        domain: batch.domain,
        environment: batch.environment,
        name: batch.name,
        owner: batch.owner
      },
      execution: batch.execution ? {
        ...batch.execution.artifactPath ? { artifactPath: batch.execution.artifactPath } : {},
        command: batch.execution.command,
        gateRequired: batch.gateRequired,
        runsOn: batch.execution.runsOn
      } : void 0,
      ...expiresAtIso ? { expiresAt: expiresAtIso } : {},
      ...triggerType === "SCHEDULE" ? { contractVersion: "NATIVE_SCHEDULE_V2" } : {},
      reason,
      requestedAt: requestedAtIso,
      requestedBy,
      ...parameterPayload ? { parameters: parameterPayload } : {},
      ...triggerType !== "MANUAL" ? { triggerType } : {},
      workflow: {
        path: batch.workflow.path,
        ref: effectiveWorkflowRef
      },
      ...schedule ? { schedule } : {}
    }
  };
  const requestDigest = await createRequestDigest(
    payload
  );
  const request = {
    approvedBatchRevision: payload.spec.approvedBatchRevision,
    batchId: batch.batchId,
    ...expiresAtIso ? { expiresAt: expiresAtIso } : {},
    requestDigest,
    requestedAt: requestedAtIso,
    requestedBy,
    requestId: effectiveRequestId,
    status: "REQUESTED",
    ...reason ? { reason } : {},
    ...triggerType !== "MANUAL" ? { triggerType } : {},
    ...schedule ? { schedule } : {}
  };
  return {
    body: buildExecutionRequestBody({ payload, request }),
    labels: triggerType === "SCHEDULE" ? ["batchplane:execution-request", "batchplane:scheduled-execution"] : ["batchplane:execution-request"],
    payload,
    request,
    title: triggerType === "SCHEDULE" ? `Scheduled run ${batch.batchId}` : `Run batch ${batch.batchId}`
  };
}
function createExecutionRequestId(batchId, date = /* @__PURE__ */ new Date(), entropy = createEntropy()) {
  return `btr-${formatRequestTimestamp(date.toISOString())}-${toRequestSlug(
    batchId,
    48
  )}-${entropy}`;
}
async function createScheduledExecutionRequestId(batchId, scheduleId, repositoryId, sourceRunId) {
  const run2 = String(sourceRunId).trim();
  if (!repositoryId.trim() || !run2) {
    throw new Error(
      "Scheduled execution requests require the native repository and Run identifiers."
    );
  }
  const tupleDigest = await createRequestDigest({
    batchId,
    repositoryId,
    scheduleId,
    sourceRunId: run2
  });
  return `btr-schedule-${tupleDigest.slice("sha256:".length)}`;
}
function buildExecutionRequestBody({
  payload,
  request
}) {
  return [
    "## BatchPlane Execution Request",
    "",
    `- Request ID: \`${request.requestId}\``,
    `- Batch ID: \`${request.batchId}\``,
    `- Requested by: @${request.requestedBy}`,
    `- Requested at: ${request.requestedAt}`,
    ...request.expiresAt ? [`- Expires at: ${request.expiresAt}`] : [],
    `- Trigger type: \`${request.triggerType ?? "MANUAL"}\``,
    `- Approved Batch change: \`${request.approvedBatchRevision.governedChangeId}\``,
    `- Approved Batch digest: \`${request.approvedBatchRevision.targetRevisionDigest}\``,
    ...request.schedule ? [
      `- Schedule ID: \`${request.schedule.scheduleId}\``,
      `- Native source Run: \`${request.schedule.sourceRunId}\``,
      `- Native repository: \`${request.schedule.repositoryId}\``
    ] : [],
    `- Request digest: \`${request.requestDigest}\``,
    `- Status: ${request.status}`,
    "",
    "### Canonical payload",
    "",
    "```json",
    JSON.stringify(payload, null, 2),
    "```",
    "",
    "<!-- batchplane:execution-request",
    `requestId=${request.requestId}`,
    `batchId=${request.batchId}`,
    `requestDigest=${request.requestDigest}`,
    `status=${request.status}`,
    "-->"
  ].join("\n");
}
function createEntropy() {
  const bytes = new Uint8Array(4);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
}
async function buildParameterPayload(parameters) {
  const entries = await Promise.all(
    parameters.map((parameter) => ({
      name: parameter.name.trim(),
      sensitive: parameter.sensitive,
      value: parameter.value
    })).filter((parameter) => parameter.name.length > 0).map(async (parameter) => {
      if (parameter.sensitive) {
        return [
          parameter.name,
          {
            sensitive: true,
            valueDigest: await createParameterDigest({
              [parameter.name]: parameter.value
            })
          }
        ];
      }
      return [
        parameter.name,
        {
          value: parameter.value
        }
      ];
    })
  );
  return entries.length > 0 ? Object.fromEntries(entries) : void 0;
}
function formatRequestTimestamp(value) {
  return value.replaceAll("-", "").replaceAll(":", "").replaceAll(".", "").replaceAll("T", "").replaceAll("Z", "").slice(0, 14);
}
function toRequestSlug(value, maxLength) {
  const slug = value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return slug.slice(0, maxLength) || "batch";
}
function validateBatchDefinition(definition) {
  const diagnostics = [];
  const record = requireRecord(definition, "$", diagnostics);
  if (!record) {
    return diagnostics;
  }
  requireCanonicalBatchId(record.batchId, diagnostics);
  requireString(record, "name", diagnostics);
  requireString(record, "owner", diagnostics);
  requireString(record, "domain", diagnostics);
  requireString(record, "environment", diagnostics);
  validateEnumField(
    record.criticality,
    "criticality",
    criticalityValues,
    diagnostics
  );
  validateEnumField(record.status, "status", batchStatusValues, diagnostics);
  validateWorkflowTarget(record.workflow, "workflow", diagnostics);
  validateGateRequired(record.gateRequired, diagnostics);
  validateOptionalExecution(record.execution, diagnostics);
  validateOptionalStringArray(record.labels, "labels", diagnostics);
  validateOptionalBatchSchedules(record.schedules, "schedules", diagnostics);
  return diagnostics;
}
function validateBatchDefinitionFile(file) {
  const diagnostics = [];
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
      schedules: Array.isArray(spec.schedules) ? spec.schedules.map((schedule) => {
        const item = schedule && typeof schedule === "object" && !Array.isArray(schedule) ? schedule : {};
        return {
          cron: item.cron,
          enabled: item.enabled,
          name: item.name,
          scheduleId: item.id,
          timezone: item.timezone
        };
      }) : void 0,
      status: spec.status,
      workflow: spec.workflow
    };
    diagnostics.push(
      ...validateBatchDefinition(batchDefinition).map(
        mapBatchDefinitionDiagnosticToFile
      )
    );
  }
  if (diagnostics.length > 0) {
    return { diagnostics, ok: false };
  }
  return { diagnostics: [], ok: true, value: file };
}
function validateWorkspacePolicy(policy) {
  const diagnostics = [];
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
      diagnostics
    );
  }
  return diagnostics;
}
function validateWorkspacePolicyFile(file) {
  const diagnostics = [];
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
        field: `spec.${diagnostic.field}`
      }))
    );
  }
  if (diagnostics.length > 0) {
    return { diagnostics, ok: false };
  }
  return { diagnostics: [], ok: true, value: file };
}
function validateRoleMapping(roleMapping) {
  const diagnostics = [];
  const record = requireRecord(roleMapping, "$", diagnostics);
  if (!record) {
    return diagnostics;
  }
  const roles = requireRecord(record.roles, "roles", diagnostics);
  if (!roles) {
    return diagnostics;
  }
  Object.keys(roles).filter((role) => !roleMappingRoles.includes(role)).forEach((role) => {
    diagnostics.push({
      code: "unexpected_role",
      field: `roles.${role}`,
      message: `Role '${role}' is not a supported BatchPlane role.`,
      severity: "error"
    });
  });
  roleMappingRoles.forEach((role) => {
    validateApproverSelector(roles[role], `roles.${role}`, diagnostics);
  });
  return diagnostics;
}
function validateRoleMappingFile(file) {
  const diagnostics = [];
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
        field: `spec.${diagnostic.field}`
      }))
    );
  }
  if (diagnostics.length > 0) {
    return { diagnostics, ok: false };
  }
  return { diagnostics: [], ok: true, value: file };
}
function parseYamlDocument(input) {
  const diagnostics = [];
  const root = {};
  const stack = [{ indent: -2, value: root }];
  const lines = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  lines.forEach((rawLine, index) => {
    const lineNumber = index + 1;
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) {
      return;
    }
    if (rawLine.includes("	")) {
      diagnostics.push({
        column: rawLine.indexOf("	") + 1,
        line: lineNumber,
        message: "Tabs are not supported in BatchPlane YAML indentation."
      });
      return;
    }
    const indent = countLeadingSpaces(rawLine);
    if (indent % 2 !== 0) {
      diagnostics.push({
        column: indent + 1,
        line: lineNumber,
        message: "Indentation must use two-space levels."
      });
      return;
    }
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    if (indent > parent.indent + 2) {
      diagnostics.push({
        column: indent + 1,
        line: lineNumber,
        message: "Indentation jumps more than one level."
      });
      return;
    }
    const trimmed = rawLine.trim();
    const separatorIndex = trimmed.indexOf(":");
    if (separatorIndex <= 0) {
      diagnostics.push({
        column: indent + 1,
        line: lineNumber,
        message: "Expected a YAML key followed by ':'."
      });
      return;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    if (!key) {
      diagnostics.push({
        column: indent + 1,
        line: lineNumber,
        message: "YAML keys must not be empty."
      });
      return;
    }
    if (Object.hasOwn(parent.value, key)) {
      diagnostics.push({
        column: indent + 1,
        line: lineNumber,
        message: `Duplicate YAML key '${key}'.`
      });
      return;
    }
    if (!rawValue) {
      const child = {};
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
function formatYamlDiagnostics(diagnostics) {
  return diagnostics.map(
    (diagnostic) => `line ${diagnostic.line}, column ${diagnostic.column}: ${diagnostic.message}`
  ).join("; ");
}
function parseYamlScalar(value, line, column) {
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
      return { ok: true, value: JSON.parse(value) };
    } catch {
      return {
        diagnostics: [
          {
            column,
            line,
            message: "Invalid quoted or inline JSON YAML value."
          }
        ],
        ok: false
      };
    }
  }
  return { ok: true, value };
}
function countLeadingSpaces(value) {
  return value.length - value.trimStart().length;
}
var batchStatusValues = ["ACTIVE", "INACTIVE"];
var criticalityValues = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
var repositoryRoleValues = ["admin", "maintain", "write", "triage"];
var workspaceApprovalModeValues = [
  "SELF_APPROVAL_BLOCKED",
  "SELF_APPROVAL_ALLOWED",
  "AUTO_APPROVE"
];
var roleMappingRoles = [
  "requester",
  "approver",
  "maintainer",
  "auditor"
];
function requireRecord(value, field, diagnostics) {
  if (isRecord(value)) {
    return value;
  }
  diagnostics.push({
    code: value === void 0 ? "required" : "invalid_type",
    field,
    message: value === void 0 ? `${field} is required.` : `${field} must be an object.`,
    severity: "error"
  });
  return void 0;
}
function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function requireString(record, key, diagnostics, field = key) {
  const value = record[key];
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  diagnostics.push({
    code: value === void 0 || value === "" ? "required" : "invalid_type",
    field,
    message: value === void 0 || value === "" ? `${field} is required.` : `${field} must be a non-empty string.`,
    severity: "error"
  });
  return void 0;
}
function requireCanonicalBatchId(value, diagnostics) {
  if (isCanonicalBatchId(value)) {
    return;
  }
  diagnostics.push({
    code: value === void 0 || value === "" ? "required" : "invalid_batch_id",
    field: "batchId",
    message: value === void 0 || value === "" ? "batchId is required." : "batchId must be a canonical repository-safe Batch ID.",
    severity: "error"
  });
}
function requireBoolean(record, key, diagnostics, field = key) {
  const value = record[key];
  if (typeof value === "boolean") {
    return value;
  }
  diagnostics.push({
    code: value === void 0 ? "required" : "invalid_type",
    field,
    message: value === void 0 ? `${field} is required.` : `${field} must be a boolean.`,
    severity: "error"
  });
  return void 0;
}
function validateExactValue(value, field, expected, diagnostics) {
  if (value === expected) {
    return;
  }
  diagnostics.push({
    code: value === void 0 ? "required" : "invalid_value",
    field,
    message: `${field} must be '${expected}'.`,
    severity: "error"
  });
}
function validateBatchPlaneApiVersion(value, diagnostics) {
  if (isBatchPlaneApiVersion(value)) {
    return;
  }
  diagnostics.push({
    code: value === void 0 ? "required" : "invalid_value",
    field: "apiVersion",
    message: `apiVersion must be one of: ${supportedBatchPlaneApiVersions.join(", ")}.`,
    severity: "error"
  });
}
function validateEnumField(value, field, allowedValues, diagnostics) {
  if (typeof value === "string" && allowedValues.includes(value)) {
    return;
  }
  diagnostics.push({
    code: value === void 0 || value === "" ? "required" : "invalid_value",
    field,
    message: `${field} must be one of: ${allowedValues.join(", ")}.`,
    severity: "error"
  });
}
function validateEnumArrayField(value, field, allowedValues, diagnostics) {
  if (!Array.isArray(value)) {
    diagnostics.push({
      code: value === void 0 ? "required" : "invalid_type",
      field,
      message: `${field} must be a non-empty array.`,
      severity: "error"
    });
    return;
  }
  if (value.length === 0) {
    diagnostics.push({
      code: "required",
      field,
      message: `${field} must include at least one value.`,
      severity: "error"
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
      severity: "error"
    });
  });
}
function validateWorkflowTarget(value, field, diagnostics) {
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
      severity: "error"
    });
  }
}
function validateGateRequired(value, diagnostics) {
  if (value === true) {
    return;
  }
  diagnostics.push({
    code: value === void 0 ? "required" : "gate_required",
    field: "gateRequired",
    message: "gateRequired must be true for Lite batches.",
    severity: "error"
  });
}
function validateOptionalExecution(value, diagnostics) {
  if (value === void 0) {
    return;
  }
  const execution = requireRecord(value, "execution", diagnostics);
  if (!execution) {
    return;
  }
  validateRunnerLabel(execution.runsOn, "execution.runsOn", diagnostics);
  requireString(execution, "command", diagnostics, "execution.command");
  if (execution.artifactPath !== void 0 && typeof execution.artifactPath !== "string") {
    diagnostics.push({
      code: "invalid_type",
      field: "execution.artifactPath",
      message: "execution.artifactPath must be a string when provided.",
      severity: "error"
    });
  }
}
function validateOptionalBatchSchedules(value, field, diagnostics) {
  if (value === void 0) {
    return;
  }
  if (!Array.isArray(value)) {
    diagnostics.push({
      code: "invalid_type",
      field,
      message: `${field} must be an array when provided.`,
      severity: "error"
    });
    return;
  }
  value.forEach((schedule, index) => {
    const item = requireRecord(schedule, `${field}.${index}`, diagnostics);
    if (!item) {
      return;
    }
    requireString(
      item,
      "scheduleId",
      diagnostics,
      `${field}.${index}.scheduleId`
    );
    requireString(item, "name", diagnostics, `${field}.${index}.name`);
    requireString(item, "cron", diagnostics, `${field}.${index}.cron`);
    requireString(item, "timezone", diagnostics, `${field}.${index}.timezone`);
    requireBoolean(item, "enabled", diagnostics, `${field}.${index}.enabled`);
  });
}
function validateRunnerLabel(value, field, diagnostics) {
  if (typeof value === "string" && value.trim()) {
    return;
  }
  if (Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string" && item.trim())) {
    return;
  }
  diagnostics.push({
    code: value === void 0 ? "required" : "invalid_type",
    field,
    message: `${field} must be a non-empty string or string array.`,
    severity: "error"
  });
}
function validateOptionalStringArray(value, field, diagnostics) {
  if (value === void 0) {
    return;
  }
  validateStringArray(value, field, diagnostics, false);
}
function validateStringArray(value, field, diagnostics, requireNonEmpty) {
  if (!Array.isArray(value)) {
    diagnostics.push({
      code: value === void 0 ? "required" : "invalid_type",
      field,
      message: `${field} must be an array of non-empty strings.`,
      severity: "error"
    });
    return;
  }
  if (requireNonEmpty && value.length === 0) {
    diagnostics.push({
      code: "required",
      field,
      message: `${field} must include at least one value.`,
      severity: "error"
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
      severity: "error"
    });
  });
}
function validateApproverSelector(value, field, diagnostics) {
  const selector = requireRecord(value, field, diagnostics);
  if (!selector) {
    return;
  }
  const hasGithubUsers = Array.isArray(selector.githubUsers) && selector.githubUsers.length > 0;
  const hasGithubTeams = Array.isArray(selector.githubTeams) && selector.githubTeams.length > 0;
  const hasRepositoryRoles = Array.isArray(selector.repositoryRoles) && selector.repositoryRoles.length > 0;
  if (!hasGithubUsers && !hasGithubTeams && !hasRepositoryRoles) {
    diagnostics.push({
      code: "selector_required",
      field,
      message: `${field} must define at least one of githubUsers, githubTeams, or repositoryRoles.`,
      severity: "error"
    });
  }
  if (selector.githubUsers !== void 0) {
    validateStringArray(
      selector.githubUsers,
      `${field}.githubUsers`,
      diagnostics,
      true
    );
  }
  if (selector.githubTeams !== void 0) {
    validateStringArray(
      selector.githubTeams,
      `${field}.githubTeams`,
      diagnostics,
      true
    );
  }
  if (selector.repositoryRoles !== void 0) {
    validateEnumArrayField(
      selector.repositoryRoles,
      `${field}.repositoryRoles`,
      repositoryRoleValues,
      diagnostics
    );
  }
}
function mapBatchDefinitionDiagnosticToFile(diagnostic) {
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
      field: `metadata.${diagnostic.field}`
    };
  }
  if (diagnostic.field.startsWith("schedules.")) {
    return {
      ...diagnostic,
      field: `spec.${diagnostic.field.replace(
        /^(schedules\.\d+)\.scheduleId$/u,
        "$1.id"
      )}`
    };
  }
  return { ...diagnostic, field: `spec.${diagnostic.field}` };
}

// ../../packages/github-lite/src/governed-change-evidence.ts
var requestMarker = "batchplane:governed-change-request";
var decisionMarker = "batchplane:governed-change-decision";
var withdrawalMarker = "batchplane:governed-change-withdrawal";
function parseGovernedChangeRequestEvidence(body) {
  const evidence = parseEvidence(body, requestMarker);
  if (!isGovernedChangeRequestEvidence(evidence)) {
    return null;
  }
  return evidence;
}
function parseGovernedChangeDecisionEvidence(body) {
  const evidence = parseEvidence(body, decisionMarker);
  if (!isGovernedChangeDecisionEvidence(evidence)) {
    return null;
  }
  return evidence;
}
function parseGovernedChangeWithdrawalEvidence(body) {
  const evidence = parseEvidence(body, withdrawalMarker);
  return isGovernedChangeWithdrawalEvidence(evidence) ? evidence : null;
}
function parseEvidence(body, marker) {
  const start = body.indexOf(`${marker}
`);
  if (start < 0) {
    return null;
  }
  const jsonStart = start + marker.length + 1;
  const end = body.indexOf("\n-->", jsonStart);
  if (end < 0) {
    return null;
  }
  try {
    const parsed = JSON.parse(body.slice(jsonStart, end));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
function isGovernedChangeRequestEvidence(evidence) {
  return Boolean(
    evidence && evidence.version === governedChangeEvidenceVersion && isNonBlankString(evidence.baseRevisionSha) && isNonBlankString(evidence.batchId) && isNonBlankString(evidence.governedChangeId) && isNonBlankString(evidence.headRevisionSha) && isNonBlankString(evidence.repository) && isNonBlankString(evidence.requester) && isNonBlankString(evidence.requestedAt) && (evidence.remediation === void 0 || evidence.remediation === "REVIEW_CURRENT" || evidence.remediation === "RESTORE_LAST_APPROVED") && isNonBlankString(evidence.targetRevisionDigest) && isChangeType(evidence.type) && isNonBlankString(evidence.workspace) && Array.isArray(evidence.artifacts) && evidence.artifacts.every(isGovernedChangeArtifact)
  );
}
function isGovernedChangeDecisionEvidence(evidence) {
  return Boolean(
    evidence && evidence.version === governedChangeEvidenceVersion && isNonBlankString(evidence.authorizationRevisionSha) && isNonBlankString(evidence.headRevisionSha) && (evidence.decision === "APPROVED" || evidence.decision === "REJECTED") && (evidence.decisionSource === "USER" || evidence.decisionSource === "WORKSPACE_POLICY") && isNonBlankString(evidence.governedChangeId) && isNonBlankString(evidence.requestDigest) && isNonBlankString(evidence.targetRevisionDigest) && (evidence.decision !== "REJECTED" || isNonBlankString(evidence.rejectionReason))
  );
}
function isGovernedChangeWithdrawalEvidence(evidence) {
  return Boolean(
    evidence && evidence.version === governedChangeEvidenceVersion && evidence.decision === "WITHDRAWN" && isNonBlankString(evidence.headRevisionSha) && isNonBlankString(evidence.governedChangeId) && isNonBlankString(evidence.requestDigest) && isNonBlankString(evidence.targetRevisionDigest)
  );
}
function isGovernedChangeArtifact(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const artifact = value;
  return isNonBlankString(artifact.path) && (artifact.kind === "ARTIFACT" || artifact.kind === "BATCH_DEFINITION" || artifact.kind === "WORKFLOW") && isDigestOrNull(artifact.beforeDigest) && isDigestOrNull(artifact.afterDigest);
}
function isChangeType(value) {
  return value === "REGISTER" || value === "CHANGE" || value === "DELETE";
}
function isDigestOrNull(value) {
  return value === null || isNonBlankString(value);
}
function isNonBlankString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

// ../../packages/github-lite/src/batch-definition-codec.ts
function getBatchDefinitionPath(batchId) {
  return `.batch-governance/batches/${assertCanonicalBatchId(batchId)}.yml`;
}
function getBatchWorkflowPath(batchId) {
  return `.github/workflows/${assertCanonicalBatchId(batchId)}.yml`;
}
function getBatchArtifactPath(batchId, fileName) {
  const batchSlug = assertCanonicalBatchId(batchId);
  const fileSlug = toFileNameSlug(fileName);
  return `.batch-governance/batches/${batchSlug}/artifacts/${fileSlug || "artifact.bin"}`;
}
function assertCanonicalBatchId(batchId) {
  if (isCanonicalBatchId(batchId)) {
    return batchId;
  }
  throw new Error(
    "Batch ID must be a canonical repository-safe identifier containing only letters, digits, dots, and hyphens."
  );
}
function parseBatchDefinitionYaml(yaml) {
  const result = parseYamlDocument(yaml);
  if (!result.ok) {
    throw new Error(
      `Invalid BatchPlane YAML: ${formatYamlDiagnostics(result.diagnostics)}`
    );
  }
  const document = asYamlRecord(result.value);
  const validation = validateBatchDefinitionFile(document);
  if (!validation.ok) {
    throw new Error(
      `Invalid BatchPlane BatchDefinition: ${validation.diagnostics.map((diagnostic) => `${diagnostic.field}: ${diagnostic.message}`).join("; ")}`
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
    governedChangeId: readYamlString(metadata, "governedChangeId") || void 0,
    name: readYamlString(metadata, "name"),
    owner: readYamlString(spec, "owner"),
    domain: readYamlString(spec, "domain"),
    environment: readYamlString(spec, "environment"),
    criticality,
    status,
    workflow: {
      path: readYamlString(workflow, "path"),
      ref: readYamlString(workflow, "ref")
    },
    gateRequired: readYamlBoolean(spec, "gateRequired"),
    execution: command || runsOn ? {
      ...artifactPath ? { artifactPath } : {},
      command,
      runsOn: runsOn || ""
    } : void 0,
    schedules: schedules.length > 0 ? schedules : void 0
  };
}
function asYamlRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function readYamlString(record, key) {
  const value = record[key];
  if (value === void 0 || value === null || Array.isArray(value)) {
    return "";
  }
  return typeof value === "object" ? "" : String(value);
}
function readYamlRunnerLabel(record, key) {
  const value = record[key];
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value;
  }
  return "";
}
function readYamlBoolean(record, key) {
  return record[key] === true;
}
function readYamlSchedules(record, key) {
  const value = record[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => asYamlRecord(item)).map((item) => ({
    cron: readYamlString(item, "cron"),
    enabled: readYamlBoolean(item, "enabled"),
    name: readYamlString(item, "name"),
    scheduleId: readYamlString(item, "id"),
    timezone: readYamlString(item, "timezone")
  })).filter(
    (schedule) => Boolean(schedule.scheduleId) || Boolean(schedule.name) || Boolean(schedule.cron) || Boolean(schedule.timezone)
  );
}
function parseCriticality(value) {
  if (value === "LOW" || value === "MEDIUM" || value === "HIGH" || value === "CRITICAL") {
    return value;
  }
  return "MEDIUM";
}
function parseBatchStatus(value) {
  if (value === "ACTIVE" || value === "INACTIVE") {
    return value;
  }
  return "INACTIVE";
}
function toFileNameSlug(value) {
  return value.trim().replace(/[\\/]+/g, "-").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/[._-]+$/g, "").replace(/^[._-]+/g, "").slice(0, 120);
}

// ../../packages/github-lite/src/github-workflow.ts
var batchPlaneGateActionRef = "always0ne/batchplane/actions/gate@main";
var batchPlaneScheduleRequestActionRef = "always0ne/batchplane/actions/schedule-request@main";
var batchPlaneScheduleResultActionRef = "always0ne/batchplane/actions/schedule-result@main";
function buildBatchWorkflowYaml(definition) {
  const workflowName = definition.name || definition.batchId || "New batch";
  const batchId = definition.batchId || "batch-id";
  const runCommandLines = indentRunCommand(definition.execution?.command ?? "");
  const runner = formatRunnerLabel(
    definition.execution?.runsOn ?? "ubuntu-latest"
  );
  const batchPath = getBatchDefinitionPath(batchId);
  const enabledSchedules = (definition.schedules ?? []).filter(
    (schedule) => schedule.enabled
  );
  assertUnambiguousScheduleTimezones(enabledSchedules);
  const scheduleEntries = Array.from(
    new Map(
      enabledSchedules.map((schedule) => ({
        cron: schedule.cron.trim(),
        timezone: schedule.timezone.trim()
      })).filter((schedule) => schedule.cron && schedule.timezone).map((schedule) => [
        `${schedule.cron}\0${schedule.timezone}`,
        schedule
      ])
    ).values()
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
    ...scheduleEntries.length > 0 ? [
      "  schedule:",
      ...scheduleEntries.map(
        (schedule) => `    - cron: ${yamlString(schedule.cron)}
      timezone: ${yamlString(schedule.timezone)}`
      )
    ] : [],
    "",
    "jobs:",
    ...enabledSchedules.flatMap(
      (schedule) => buildScheduledRequestJobLines({
        batchId,
        batchPath,
        runCommand: definition.execution?.command ?? "",
        runner,
        schedule
      })
    ),
    "  batchplane-gate:",
    "    name: BatchPlane Gate",
    "    if: github.event_name == 'workflow_dispatch'",
    "    runs-on: ubuntu-latest",
    "    env:",
    "      GITHUB_WORKFLOW_SHA: ${{ github.workflow_sha }}",
    "    outputs:",
    "      verified_sha: ${{ steps.verify.outputs.verified_sha }}",
    "    permissions:",
    "      contents: read",
    "      issues: read",
    "      pull-requests: read",
    "    steps:",
    "      - name: Verify approved execution evidence",
    "        id: verify",
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
    "          gate-job-name: BatchPlane Gate",
    "          gate-step-name: Verify approved execution evidence",
    "          github-token: ${{ secrets.GITHUB_TOKEN }}",
    "",
    "  run-batch:",
    "    name: Run governed batch",
    "    if: github.event_name == 'workflow_dispatch' && needs.batchplane-gate.outputs.verified_sha != ''",
    `    runs-on: ${runner}`,
    "    needs: batchplane-gate",
    "    permissions:",
    "      contents: read",
    "    steps:",
    "      - name: Checkout registered assets",
    "        uses: actions/checkout@v4",
    "        with:",
    "          ref: ${{ needs.batchplane-gate.outputs.verified_sha }}",
    "",
    "      - name: Run batch",
    "        run: |",
    '          echo "::group::BatchPlane batch command"',
    `          trap 'status=$?; echo "::endgroup::"; exit $status' EXIT`,
    `          echo ${yamlString(`BatchPlane approved execution for ${batchId}`)}`,
    ...runCommandLines,
    ""
  ].join("\n");
}
function yamlString(value) {
  return JSON.stringify(value);
}
function githubExpressionString(value) {
  return `'${value.replace(/'/g, "''")}'`;
}
function indentRunCommand(runCommand) {
  const lines = runCommand.trimEnd().split("\n");
  if (lines.length === 0 || lines.every((line) => !line.trim())) {
    return [
      "          # Define the governed batch command during registration."
    ];
  }
  return lines.map((line) => `          ${line}`);
}
function formatRunnerLabel(runnerLabel) {
  if (Array.isArray(runnerLabel)) {
    return `[${runnerLabel.map(yamlString).join(", ")}]`;
  }
  return yamlString(runnerLabel || "ubuntu-latest");
}
function buildScheduledRequestJobLines({
  batchId,
  batchPath,
  runCommand,
  runner,
  schedule
}) {
  const identity = getNativeScheduleWorkflowJobIdentity(schedule);
  const {
    businessJobId,
    businessJobName,
    controlJobId: jobId,
    controlJobName
  } = identity;
  return [
    `  ${jobId}:`,
    `    name: ${yamlString(controlJobName)}`,
    `    if: github.event_name == 'schedule' && github.event.schedule == ${githubExpressionString(schedule.cron)}`,
    "    outputs:",
    "      request-id: ${{ steps.schedule_request.outputs.request-id }}",
    "      request-digest: ${{ steps.schedule_request.outputs.request-digest }}",
    "      issue-number: ${{ steps.schedule_request.outputs.issue-number }}",
    "    concurrency:",
    `      group: ${yamlString(`batchplane-schedule-${toWorkflowJobId(batchId)}-${toScheduleWorkflowJobId(schedule.scheduleId)}`)}`,
    "      cancel-in-progress: false",
    "    runs-on: ubuntu-latest",
    "    env:",
    "      GITHUB_WORKFLOW_SHA: ${{ github.workflow_sha }}",
    "    permissions:",
    "      contents: read",
    "      issues: write",
    "      pull-requests: read",
    "    steps:",
    "      - name: Record native scheduled execution request",
    "        id: schedule_request",
    "        continue-on-error: true",
    `        uses: ${batchPlaneScheduleRequestActionRef}`,
    "        with:",
    `          batch-id: ${yamlString(batchId)}`,
    `          schedule-id: ${yamlString(schedule.scheduleId)}`,
    `          cron: ${yamlString(schedule.cron)}`,
    `          timezone: ${yamlString(schedule.timezone)}`,
    `          definition-path: ${yamlString(batchPath)}`,
    "          config-path: .batch-governance",
    "          github-token: ${{ secrets.GITHUB_TOKEN }}",
    "      - name: Verify approved native schedule evidence",
    "        id: verify",
    "        if: always()",
    `        uses: ${batchPlaneGateActionRef}`,
    "        with:",
    "          mode: lite",
    `          batch-id: ${yamlString(batchId)}`,
    "          config-path: .batch-governance",
    "          request-id: ${{ steps.schedule_request.outputs.request-id }}",
    "          request-digest: ${{ steps.schedule_request.outputs.request-digest }}",
    "          issue-number: ${{ steps.schedule_request.outputs.issue-number }}",
    "          controller-reason: ${{ steps.schedule_request.outputs.failure-reason }}",
    "          record-evidence: true",
    `          schedule-id: ${yamlString(schedule.scheduleId)}`,
    `          gate-job-name: ${yamlString(controlJobName)}`,
    "          gate-step-name: Verify approved native schedule evidence",
    "          github-token: ${{ secrets.GITHUB_TOKEN }}",
    "",
    `  ${businessJobId}:`,
    `    name: ${yamlString(businessJobName)}`,
    `    needs: ${jobId}`,
    `    if: github.event_name == 'schedule' && needs.${jobId}.result == 'success'`,
    `    runs-on: ${runner}`,
    "    env:",
    "      GITHUB_WORKFLOW_SHA: ${{ github.workflow_sha }}",
    "    permissions:",
    "      contents: read",
    "      issues: read",
    "      pull-requests: read",
    "    steps:",
    "      - name: Reverify approved native schedule evidence",
    "        id: verify",
    `        uses: ${batchPlaneGateActionRef}`,
    "        with:",
    "          mode: lite",
    `          batch-id: ${yamlString(batchId)}`,
    "          config-path: .batch-governance",
    `          request-id: \${{ needs.${jobId}.outputs.request-id }}`,
    `          request-digest: \${{ needs.${jobId}.outputs.request-digest }}`,
    `          issue-number: \${{ needs.${jobId}.outputs.issue-number }}`,
    `          schedule-id: ${yamlString(schedule.scheduleId)}`,
    `          gate-job-name: ${yamlString(businessJobName)}`,
    "          gate-step-name: Reverify approved native schedule evidence",
    "          github-token: ${{ secrets.GITHUB_TOKEN }}",
    "      - name: Checkout registered assets",
    "        if: steps.verify.outputs.verified_sha != ''",
    "        uses: actions/checkout@v4",
    "        with:",
    "          ref: ${{ steps.verify.outputs.verified_sha }}",
    "      - name: Run batch",
    "        if: steps.verify.outputs.verified_sha != ''",
    "        run: |",
    '          echo "::group::BatchPlane batch command"',
    `          trap 'status=$?; echo "::endgroup::"; exit $status' EXIT`,
    `          echo ${yamlString(`BatchPlane approved execution for ${batchId}`)}`,
    ...indentRunCommand(runCommand),
    "",
    `  result-${jobId}:`,
    `    name: ${yamlString(`Record ${schedule.name || schedule.scheduleId} result`)}`,
    `    needs: [${jobId}, ${businessJobId}]`,
    `    if: github.event_name == 'schedule' && github.event.schedule == ${githubExpressionString(schedule.cron)} && always() && needs.${jobId}.outputs.issue-number != ''`,
    "    runs-on: ubuntu-latest",
    "    env:",
    "      GITHUB_WORKFLOW_SHA: ${{ github.workflow_sha }}",
    "    permissions:",
    "      actions: read",
    "      contents: read",
    "      issues: write",
    "      pull-requests: read",
    "    steps:",
    "      - name: Record native schedule result",
    `        uses: ${batchPlaneScheduleResultActionRef}`,
    "        with:",
    `          batch-id: ${yamlString(batchId)}`,
    `          schedule-id: ${yamlString(schedule.scheduleId)}`,
    `          issue-number: \${{ needs.${jobId}.outputs.issue-number }}`,
    `          request-id: \${{ needs.${jobId}.outputs.request-id }}`,
    `          request-digest: \${{ needs.${jobId}.outputs.request-digest }}`,
    `          control-result: \${{ needs.${jobId}.result }}`,
    `          business-result: \${{ needs.${businessJobId}.result }}`,
    `          business-job-id: ${yamlString(businessJobId)}`,
    `          business-job-name: ${yamlString(businessJobName)}`,
    `          control-job-id: ${yamlString(jobId)}`,
    `          control-job-name: ${yamlString(controlJobName)}`,
    `          definition-path: ${yamlString(batchPath)}`,
    "          github-token: ${{ secrets.GITHUB_TOKEN }}",
    ""
  ];
}
function getNativeScheduleWorkflowJobIdentity(schedule) {
  const controlJobId = toScheduleWorkflowJobId(schedule.scheduleId);
  return {
    businessJobId: `run-${controlJobId}`,
    businessJobName: `Run [${schedule.scheduleId}]`,
    controlJobId,
    controlJobName: `Schedule [${schedule.scheduleId}]`
  };
}
function assertUnambiguousScheduleTimezones(schedules) {
  const timezoneByCron = /* @__PURE__ */ new Map();
  for (const schedule of schedules) {
    const cron = schedule.cron.trim();
    const timezone = schedule.timezone.trim();
    const existing = timezoneByCron.get(cron);
    if (existing && existing !== timezone) {
      throw new Error(
        `SCHEDULE_TIMEZONE_AMBIGUOUS: schedules with cron ${cron} must use one timezone per workflow.`
      );
    }
    timezoneByCron.set(cron, timezone);
  }
}
function toWorkflowJobId(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) || "schedule_request";
}
function toScheduleWorkflowJobId(scheduleId) {
  const encoded = Array.from(scheduleId).map((character) => character.codePointAt(0).toString(16)).join("_");
  return `schedule_${encoded}`;
}

// ../../packages/github-lite/src/governed-change-policy.ts
var roleMappingPath = ".batch-governance/policies/role-mapping.yml";
var workspacePolicyPath = ".batch-governance/workspace.yml";
async function loadGovernedChangePolicy(client, repository, ref) {
  const file = await client.getFile({
    ...repository,
    path: workspacePolicyPath,
    ref
  });
  if (!file) return defaultWorkspacePolicy;
  const parsed = parseYamlDocument(file.content);
  const validated = parsed.ok ? validateWorkspacePolicyFile(parsed.value) : null;
  return validated?.ok ? validated.value.spec : defaultWorkspacePolicy;
}
async function loadGovernedChangeRoles(client, repository, ref) {
  const file = await client.getFile({
    ...repository,
    path: roleMappingPath,
    ref
  });
  if (!file) throw new Error("Workspace role mapping is required.");
  const parsed = parseYamlDocument(file.content);
  const validated = parsed.ok ? validateRoleMappingFile(parsed.value) : null;
  if (!validated?.ok) throw new Error("Workspace role mapping is invalid.");
  return validated.value.spec;
}
async function hasGovernedChangeRole(client, repository, login, selector) {
  if (selector.githubUsers?.includes(login)) return true;
  if (selector.repositoryRoles?.length) {
    const permission = await client.getRepositoryPermissionForUser({
      ...repository,
      username: login
    });
    if (selector.repositoryRoles.includes(
      permission.permission
    )) {
      return true;
    }
  }
  if (!selector.githubTeams?.length) return false;
  const memberships = await Promise.all(
    selector.githubTeams.map(
      (teamSlug) => client.getTeamMembershipForUser({
        org: repository.owner,
        teamSlug,
        username: login
      })
    )
  );
  return memberships.some((membership) => membership?.state === "active");
}

// ../../packages/github-lite/src/governed-change-verifier.ts
async function hasAuthoritativeGovernedChangeRequest(client, repository, pullRequest, evidence, options = {}) {
  const workspace = await client.getRepository(repository);
  if (!hasMatchingRequestMetadata(
    repository,
    workspace.defaultBranch,
    pullRequest,
    evidence
  )) {
    return false;
  }
  const request = evidence;
  if (!isValidVerifiedBatchId(request.batchId)) {
    return false;
  }
  try {
    const roleMapping = await loadGovernedChangeRoles(
      client,
      repository,
      request.baseRevisionSha
    );
    const authorHasRequesterRole = await hasGovernedChangeRole(
      client,
      repository,
      pullRequest.author,
      roleMapping.roles.requester
    );
    if (!authorHasRequesterRole) return false;
  } catch (error) {
    if (options.propagateRequesterRoleReadFailure) throw error;
    return false;
  }
  const [pullRequestFiles, actualArtifacts, definitionMatches] = await Promise.all([
    client.listPullRequestFiles({
      ...repository,
      pullNumber: pullRequest.number
    }),
    loadActualArtifacts(client, repository, pullRequest, request),
    hasMatchingDefinitionMeaning(client, repository, pullRequest, request)
  ]);
  const actualTargetDigest = await createTargetRevisionDigest(actualArtifacts);
  return actualTargetDigest === request.targetRevisionDigest && hasMatchingArtifactDigests(request.artifacts, actualArtifacts) && hasExactChangedFileSet(request.artifacts, pullRequestFiles) && hasMatchingBatchMeaning(request, actualArtifacts) && definitionMatches;
}
function isValidVerifiedBatchId(batchId) {
  try {
    assertCanonicalBatchId(batchId);
    return true;
  } catch {
    return false;
  }
}
function hasMatchingRequestMetadata(repository, defaultBranch, pullRequest, evidence) {
  return Boolean(
    evidence && pullRequest.headSha && pullRequest.baseSha && pullRequest.createdAt && evidence.repository === `${repository.owner}/${repository.repo}` && evidence.workspace === `${repository.owner}/${repository.repo}` && (pullRequest.state !== "open" || pullRequest.base === defaultBranch) && evidence.requester === pullRequest.author && evidence.requestedAt === pullRequest.createdAt && evidence.baseRevisionSha === pullRequest.baseSha && evidence.headRevisionSha === pullRequest.headSha
  );
}
async function loadActualArtifacts(client, repository, pullRequest, evidence) {
  return Promise.all(
    evidence.artifacts.map(async (artifact) => {
      const [baseFile, headFile] = await Promise.all([
        client.getFile({
          ...repository,
          path: artifact.path,
          ref: evidence.baseRevisionSha
        }),
        client.getFile({
          ...repository,
          path: artifact.path,
          ref: pullRequest.headSha
        })
      ]);
      return {
        afterDigest: headFile ? await digestFile(headFile) : null,
        beforeDigest: baseFile ? await digestFile(baseFile) : null,
        kind: artifact.kind,
        path: artifact.path
      };
    })
  );
}
async function hasMatchingDefinitionMeaning(client, repository, pullRequest, evidence) {
  const definitionPath = getBatchDefinitionPath(evidence.batchId);
  const workflowPath = getBatchWorkflowPath(evidence.batchId);
  const [baseFile, headFile] = await Promise.all([
    client.getFile({
      ...repository,
      path: definitionPath,
      ref: evidence.baseRevisionSha
    }),
    client.getFile({
      ...repository,
      path: definitionPath,
      ref: pullRequest.headSha
    })
  ]);
  try {
    const baseDefinition = baseFile ? parseBatchDefinitionYaml(baseFile.content) : null;
    const headDefinition = headFile ? parseBatchDefinitionYaml(headFile.content) : null;
    const [baseWorkflow, headWorkflow] = await Promise.all([
      client.getFile({
        ...repository,
        path: workflowPath,
        ref: evidence.baseRevisionSha
      }),
      client.getFile({
        ...repository,
        path: workflowPath,
        ref: pullRequest.headSha
      })
    ]);
    const definition = evidence.type === "DELETE" ? baseDefinition : headDefinition;
    const definitionArtifacts = evidence.artifacts.filter(
      (artifact) => artifact.kind === "BATCH_DEFINITION"
    );
    const workflowArtifacts = evidence.artifacts.filter(
      (artifact) => artifact.kind === "WORKFLOW"
    );
    const uniqueArtifactKeys = new Set(
      evidence.artifacts.map(
        (artifact) => `${artifact.kind}\0${artifact.path}`
      )
    );
    return definition !== null && definitionArtifacts.length === 1 && workflowArtifacts.length === 1 && uniqueArtifactKeys.size === evidence.artifacts.length && definition.batchId === evidence.batchId && definitionArtifacts[0]?.path === definitionPath && definition.workflow.path === workflowPath && workflowArtifacts[0]?.path === workflowPath && hasCanonicalArtifactEnvelope({
      artifacts: evidence.artifacts,
      baseDefinition,
      batchId: evidence.batchId,
      headDefinition,
      type: evidence.type
    }) && hasCanonicalWorkflow({
      headDefinition,
      headWorkflow,
      type: evidence.type
    }) && hasCanonicalWorkflowTransition({
      baseWorkflow,
      headWorkflow,
      type: evidence.type
    }) && (evidence.type === "DELETE" || definition.governedChangeId === evidence.governedChangeId);
  } catch {
    return false;
  }
}
function hasCanonicalWorkflow({
  headDefinition,
  headWorkflow,
  type
}) {
  if (type === "DELETE") return true;
  return Boolean(
    headDefinition?.gateRequired && headWorkflow && new TextDecoder().decode(fileBytes(headWorkflow)) === buildBatchWorkflowYaml(headDefinition)
  );
}
function hasCanonicalWorkflowTransition({
  baseWorkflow,
  headWorkflow,
  type
}) {
  if (type === "REGISTER") return !baseWorkflow && Boolean(headWorkflow);
  if (type === "CHANGE") return Boolean(baseWorkflow && headWorkflow);
  return Boolean(baseWorkflow && !headWorkflow);
}
function hasCanonicalArtifactEnvelope({
  artifacts,
  baseDefinition,
  batchId,
  headDefinition,
  type
}) {
  const artifactFiles = artifacts.filter(
    (artifact) => artifact.kind === "ARTIFACT"
  );
  const baseArtifactPath = baseDefinition?.execution?.artifactPath;
  const headArtifactPath = headDefinition?.execution?.artifactPath;
  const baseArtifact = findArtifact(artifactFiles, baseArtifactPath);
  const headArtifact = findArtifact(artifactFiles, headArtifactPath);
  if (type === "DELETE") {
    return !headArtifactPath && artifactFiles.length === (baseArtifactPath ? 1 : 0) && Boolean(
      !baseArtifactPath || baseArtifact?.beforeDigest !== null && baseArtifact?.afterDigest === null
    );
  }
  if (headArtifactPath && !isCanonicalOrRetainedArtifactPath({
    baseArtifactPath,
    batchId,
    headArtifactPath
  })) {
    return false;
  }
  if (!baseArtifactPath && !headArtifactPath) return artifactFiles.length === 0;
  if (!baseArtifactPath && headArtifactPath) {
    return artifactFiles.length === 1 && headArtifact?.beforeDigest === null && headArtifact?.afterDigest !== null;
  }
  if (baseArtifactPath && !headArtifactPath) {
    return artifactFiles.length === 1 && baseArtifact?.beforeDigest !== null && baseArtifact?.afterDigest === null;
  }
  if (baseArtifactPath === headArtifactPath) {
    return artifactFiles.length === 1 && baseArtifact?.beforeDigest !== null && baseArtifact?.afterDigest !== null;
  }
  return artifactFiles.length === 2 && baseArtifact?.beforeDigest !== null && baseArtifact?.afterDigest === null && headArtifact?.beforeDigest === null && headArtifact?.afterDigest !== null;
}
function findArtifact(artifacts, path) {
  return path ? artifacts.find((artifact) => artifact.path === path) : void 0;
}
function isCanonicalOrRetainedArtifactPath({
  baseArtifactPath,
  batchId,
  headArtifactPath
}) {
  return headArtifactPath === baseArtifactPath || isCanonicalBatchArtifactPath(batchId, headArtifactPath);
}
function isCanonicalBatchArtifactPath(batchId, path) {
  const prefix = `.batch-governance/batches/${batchId}/artifacts/`;
  if (!path.startsWith(prefix)) return false;
  const fileName = path.slice(prefix.length);
  return Boolean(fileName) && getBatchArtifactPath(batchId, fileName) === path;
}
function hasMatchingArtifactDigests(expected, actual) {
  return expected.length === actual.length && expected.every((artifact) => {
    const current = actual.find(
      (candidate) => candidate.kind === artifact.kind && candidate.path === artifact.path
    );
    return current?.beforeDigest === artifact.beforeDigest && current.afterDigest === artifact.afterDigest;
  });
}
function hasExactChangedFileSet(artifacts, files) {
  const expected = artifacts.filter((artifact) => artifact.beforeDigest !== artifact.afterDigest).map(toExpectedFileChange).sort(compareFileChanges);
  const actual = files.flatMap(
    (file) => file.status === "renamed" && file.previousPath ? [
      { path: file.previousPath, status: "removed" },
      { path: file.path, status: "added" }
    ] : [{ path: file.path, status: normalizeFileStatus(file.status) }]
  ).sort(compareFileChanges);
  return expected.every(
    (change, index) => change.path === actual[index]?.path && change.status === actual[index]?.status
  ) && expected.length === actual.length;
}
function toExpectedFileChange(artifact) {
  return {
    path: artifact.path,
    status: artifact.beforeDigest === null ? "added" : artifact.afterDigest === null ? "removed" : "modified"
  };
}
function normalizeFileStatus(status) {
  if (status === "added" || status === "removed" || status === "renamed") {
    return status;
  }
  return "modified";
}
function compareFileChanges(left, right) {
  return left.path === right.path ? left.status.localeCompare(right.status) : left.path.localeCompare(right.path);
}
function hasMatchingBatchMeaning(evidence, artifacts) {
  const definition = artifacts.find(
    (artifact) => artifact.kind === "BATCH_DEFINITION"
  );
  const workflow = artifacts.find((artifact) => artifact.kind === "WORKFLOW");
  if (!definition || !workflow) return false;
  if (definition.path !== getBatchDefinitionPath(evidence.batchId))
    return false;
  if (workflow.path !== getBatchWorkflowPath(evidence.batchId)) return false;
  return evidence.type === "REGISTER" ? definition.beforeDigest === null && definition.afterDigest !== null && workflow.beforeDigest === null && workflow.afterDigest !== null : evidence.type === "DELETE" ? definition.beforeDigest !== null && definition.afterDigest === null && workflow.beforeDigest !== null && workflow.afterDigest === null : definition.beforeDigest !== null && definition.afterDigest !== null && workflow.beforeDigest !== null && workflow.afterDigest !== null;
}
function digestFile(file) {
  return sha256BytesHex(fileBytes(file));
}
function fileBytes(file) {
  if (!file.contentBase64) return new TextEncoder().encode(file.content);
  return Uint8Array.from(
    atob(file.contentBase64),
    (character) => character.charCodeAt(0)
  );
}

// ../../packages/github-lite/src/approved-batch-revision.ts
async function verifyApprovedBatchRevision({
  batchId,
  client,
  executionWorkflowSha,
  expectedRevision,
  repository
}) {
  try {
    const current = await loadCurrentBatchSnapshot(client, repository, batchId);
    if (!current || !matchesExpectedCurrentRevision(current, expectedRevision)) {
      return bypassed();
    }
    const candidate = (await loadMergedBatchCandidates(client, repository, batchId))[0];
    if (!candidate || !matchesCurrentCandidate(candidate, current, expectedRevision)) {
      return bypassed();
    }
    if (!await hasAuthoritativeCandidateProof(client, repository, candidate)) {
      return bypassed();
    }
    if (!await hasMatchingRevisionDigests({
      candidate,
      client,
      currentSha: current.sha,
      executionWorkflowSha,
      repository
    })) {
      return bypassed();
    }
    return {
      approvedRevision: {
        governedChangeId: candidate.evidence.governedChangeId,
        targetRevisionDigest: candidate.evidence.targetRevisionDigest
      },
      controlStatus: "VERIFIED",
      verifiedSha: candidate.pullRequest.mergeSha
    };
  } catch {
    return {
      controlStatus: "UNKNOWN",
      reasonCode: "APPROVED_BATCH_REVISION_UNAVAILABLE"
    };
  }
}
async function loadCurrentBatchSnapshot(client, repository, batchId) {
  const workspace = await client.getRepository(repository);
  const sha = await client.getBranchHeadSha({
    ...repository,
    branch: workspace.defaultBranch
  });
  const definitionFile = await client.getFile({
    ...repository,
    path: getBatchDefinitionPath(batchId),
    ref: sha
  });
  if (!definitionFile) return null;
  const definition = parseBatchDefinitionYaml(definitionFile.content);
  return definition.batchId === batchId && definition.governedChangeId ? { governedChangeId: definition.governedChangeId, sha } : null;
}
function matchesExpectedCurrentRevision(current, expected) {
  return !expected || expected.governedChangeId === current.governedChangeId && expected.targetRevisionDigest.startsWith("sha256:");
}
function matchesCurrentCandidate(candidate, current, expected) {
  return candidate.evidence.governedChangeId === current.governedChangeId && (!expected || expected.targetRevisionDigest === candidate.evidence.targetRevisionDigest);
}
async function hasAuthoritativeCandidateProof(client, repository, candidate) {
  return await hasAuthoritativeGovernedChangeRequest(
    client,
    repository,
    candidate.pullRequest,
    candidate.evidence,
    { propagateRequesterRoleReadFailure: true }
  ) && await hasAuthorizedMergedDecision(
    client,
    repository,
    candidate.pullRequest,
    candidate.evidence
  );
}
async function hasMatchingRevisionDigests({
  candidate,
  client,
  currentSha,
  executionWorkflowSha,
  repository
}) {
  const refs = [candidate.pullRequest.mergeSha, currentSha];
  if (executionWorkflowSha) refs.push(executionWorkflowSha);
  const digests = await Promise.all(
    refs.map(
      async (ref) => createTargetRevisionDigest(
        await loadArtifacts(
          client,
          repository,
          candidate.evidence.artifacts,
          ref
        )
      )
    )
  );
  return digests.every(
    (digest) => digest === candidate.evidence.targetRevisionDigest
  );
}
async function loadMergedBatchCandidates(client, repository, batchId) {
  const changes = await client.listPullRequests({
    ...repository,
    state: "closed"
  });
  const candidateNumbers = changes.filter((pullRequest) => pullRequest.merged).map((pullRequest) => pullRequest.number);
  const candidates = await Promise.all(
    candidateNumbers.map(async (pullNumber) => {
      const pullRequest = await client.getPullRequest({
        ...repository,
        pullNumber
      });
      const evidence = pullRequest ? parseGovernedChangeRequestEvidence(pullRequest.body) : null;
      return pullRequest?.merged && evidence?.batchId === batchId ? { evidence, pullRequest } : null;
    })
  );
  return candidates.filter(
    (candidate) => Boolean(
      candidate?.pullRequest.mergeSha && candidate.pullRequest.mergedAt
    )
  ).sort(
    (left, right) => right.pullRequest.mergedAt.localeCompare(left.pullRequest.mergedAt)
  );
}
async function hasAuthorizedMergedDecision(client, repository, pullRequest, request) {
  const requestDigest = await createGovernedChangeRequestDigest(request);
  const comments = await client.listIssueComments({
    ...repository,
    issueNumber: pullRequest.number
  });
  const decisions = await Promise.all(
    comments.map(async (comment) => {
      const decision = parseGovernedChangeDecisionEvidence(comment.body);
      if (decision && hasMatchingDecisionRequest(decision, request, requestDigest) && isUneditedPreMergeComment(comment, pullRequest.mergedAt) && await isAuthorizedDecision({
        client,
        commentAuthor: comment.author,
        decision,
        pullRequest,
        repository,
        request
      })) {
        return { comment, decision: decision.decision };
      }
      const withdrawal = parseGovernedChangeWithdrawalEvidence(comment.body);
      if (withdrawal && withdrawal.governedChangeId === request.governedChangeId && withdrawal.headRevisionSha === request.headRevisionSha && withdrawal.requestDigest === requestDigest && withdrawal.targetRevisionDigest === request.targetRevisionDigest && comment.author === request.requester && isUneditedPreMergeComment(comment, pullRequest.mergedAt)) {
        return { comment, decision: "WITHDRAWN" };
      }
      return null;
    })
  );
  const latest = decisions.filter(
    (decision) => Boolean(decision)
  ).sort(
    (left, right) => compareCommentChronology(right.comment, left.comment)
  )[0];
  return latest?.decision === "APPROVED";
}
function hasMatchingDecisionRequest(decision, request, requestDigest) {
  return decision.governedChangeId === request.governedChangeId && decision.headRevisionSha === request.headRevisionSha && decision.requestDigest === requestDigest && decision.targetRevisionDigest === request.targetRevisionDigest;
}
async function isAuthorizedDecision({
  client,
  commentAuthor,
  decision,
  pullRequest,
  repository,
  request
}) {
  const [policy, roles, mergedPolicy, mergedRoles] = await Promise.all([
    loadGovernedChangePolicy(
      client,
      repository,
      decision.authorizationRevisionSha
    ),
    loadGovernedChangeRoles(
      client,
      repository,
      decision.authorizationRevisionSha
    ),
    loadGovernedChangePolicy(client, repository, pullRequest.mergeSha ?? ""),
    loadGovernedChangeRoles(client, repository, pullRequest.mergeSha ?? "")
  ]);
  if (!hasEquivalentAuthorization(
    { policy, roles },
    { policy: mergedPolicy, roles: mergedRoles }
  )) {
    return false;
  }
  if (decision.decisionSource === "WORKSPACE_POLICY") {
    return commentAuthor === request.requester && policy.approval.mode === "AUTO_APPROVE";
  }
  const requesterIsApprover = commentAuthor === request.requester;
  const approverHasRole = await hasGovernedChangeRole(
    client,
    repository,
    commentAuthor,
    roles.roles.approver
  );
  if (!approverHasRole) return false;
  if (requesterIsApprover && policy.approval.mode === "SELF_APPROVAL_BLOCKED") {
    return false;
  }
  return true;
}
function isUneditedPreMergeComment(comment, mergedAt) {
  return Boolean(comment.updatedAt) && comment.createdAt === comment.updatedAt && isApprovalBeforeMerge(comment.createdAt, mergedAt);
}
function compareCommentChronology(left, right) {
  const timestampDifference = Date.parse(left.createdAt) - Date.parse(right.createdAt);
  return timestampDifference || left.id - right.id;
}
function hasEquivalentAuthorization(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
function isApprovalBeforeMerge(approvalCreatedAt, mergedAt) {
  if (!mergedAt) return false;
  const approvalTime = Date.parse(approvalCreatedAt);
  const mergeTime = Date.parse(mergedAt);
  return Number.isFinite(approvalTime) && Number.isFinite(mergeTime) && approvalTime <= mergeTime;
}
async function loadArtifacts(client, repository, expectedArtifacts, ref) {
  return Promise.all(
    expectedArtifacts.map(async (artifact) => {
      const file = await client.getFile({
        ...repository,
        path: artifact.path,
        ref
      });
      return {
        afterDigest: file ? await digestFile2(file) : null,
        beforeDigest: artifact.beforeDigest,
        kind: artifact.kind,
        path: artifact.path
      };
    })
  );
}
async function digestFile2(file) {
  return sha256BytesHex(fileBytes2(file));
}
function fileBytes2(file) {
  return file.contentBase64 ? Uint8Array.from(atob(file.contentBase64), (value) => value.charCodeAt(0)) : new TextEncoder().encode(file.content);
}
function bypassed() {
  return { controlStatus: "BYPASSED", reasonCode: "UNAPPROVED_BATCH_REVISION" };
}

// ../../packages/github-lite/src/index.ts
var GitHubLiteApiError = class extends Error {
  code;
  status;
  constructor(message, code, status) {
    super(message);
    this.name = "GitHubLiteApiError";
    this.code = code;
    this.status = status;
  }
};
function createGitHubLiteClient({
  token,
  apiBaseUrl = "https://api.github.com",
  fetcher = fetch
}) {
  const trimmedToken = token.trim();
  const defaultLogMaxBytes = 2e5;
  if (!trimmedToken) {
    throw new GitHubLiteApiError(
      "GitHub token is required.",
      "bad-request",
      400
    );
  }
  async function request(path, init = {}, options = {}) {
    const response = await fetcher(`${apiBaseUrl}${path}`, {
      ...init,
      headers: buildHeaders(trimmedToken, init.headers)
    });
    if (response.status === 404 && options.allowNotFound) {
      return null;
    }
    if (!response.ok) {
      throw await buildGitHubApiError(response);
    }
    if (response.status === 204) {
      return null;
    }
    return await response.json();
  }
  async function requestText(path, init = {}) {
    const response = await fetcher(`${apiBaseUrl}${path}`, {
      ...init,
      headers: buildHeaders(trimmedToken, init.headers)
    });
    if (!response.ok) {
      throw await buildGitHubApiError(response);
    }
    return response.text();
  }
  async function readWorkflowContent({
    owner,
    path,
    repo
  }) {
    const content = await request(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo
      )}/contents/${encodePath(path)}`,
      {},
      { allowNotFound: true }
    );
    if (!content) {
      return null;
    }
    if (content.encoding !== "base64") {
      throw new GitHubLiteApiError(
        `Unsupported GitHub content encoding: ${content.encoding}`,
        "unknown",
        500
      );
    }
    return decodeBase64(content.content);
  }
  async function workflowSupportsDispatch({
    owner,
    path,
    repo
  }) {
    const content = await readWorkflowContent({
      owner,
      path,
      repo
    });
    return content ? hasWorkflowDispatchTrigger(content) : false;
  }
  return {
    async getCurrentUser() {
      const user = await request("/user");
      if (!user) {
        throw new GitHubLiteApiError("GitHub user was empty.", "unknown", 500);
      }
      return { login: user.login };
    },
    async getRepository({ owner, repo }) {
      const repository = await request(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
      );
      if (!repository) {
        throw new GitHubLiteApiError(
          "GitHub repository was empty.",
          "unknown",
          500
        );
      }
      return {
        owner: repository.owner.login,
        repo: repository.name,
        defaultBranch: repository.default_branch,
        private: repository.private,
        url: repository.html_url
      };
    },
    async getFile({ owner, repo, path, ref }) {
      const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
      const content = await request(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/contents/${encodePath(path)}${query}`,
        {},
        { allowNotFound: true }
      );
      if (!content) {
        return null;
      }
      if (content.encoding !== "base64") {
        throw new GitHubLiteApiError(
          `Unsupported GitHub content encoding: ${content.encoding}`,
          "unknown",
          500
        );
      }
      return {
        path: content.path,
        content: decodeBase64(content.content),
        contentBase64: content.content.replace(/\s/g, ""),
        sha: content.sha
      };
    },
    async getDirectory({ owner, repo, path, ref }) {
      const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
      const entries = await request(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/contents/${encodePath(path)}${query}`,
        {},
        { allowNotFound: true }
      );
      if (!entries) {
        return null;
      }
      if (!Array.isArray(entries)) {
        throw new GitHubLiteApiError(
          `GitHub path is not a directory: ${path}`,
          "bad-request",
          400
        );
      }
      return entries.map((entry) => ({
        name: entry.name,
        path: entry.path,
        sha: entry.sha,
        type: entry.type
      }));
    },
    async getBranchHeadSha({ owner, repo, branch }) {
      const ref = await request(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/git/ref/heads/${encodePath(branch)}`
      );
      if (!ref) {
        throw new GitHubLiteApiError(
          "GitHub branch ref was empty.",
          "unknown",
          500
        );
      }
      return ref.object.sha;
    },
    async createBranch({ owner, repo, branch, sha }) {
      await request(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/git/refs`,
        {
          method: "POST",
          body: JSON.stringify({ ref: `refs/heads/${branch}`, sha })
        }
      );
    },
    async putFile({
      owner,
      repo,
      path,
      branch,
      message,
      content,
      encoding = "utf-8",
      sha
    }) {
      const response = await request(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/contents/${encodePath(path)}`,
        {
          method: "PUT",
          body: JSON.stringify({
            branch,
            content: encoding === "base64" ? content : encodeBase64(content),
            message,
            ...sha ? { sha } : {}
          })
        }
      );
      if (!response) {
        throw new GitHubLiteApiError(
          "GitHub file response was empty.",
          "unknown",
          500
        );
      }
      return {
        path: response.content.path,
        sha: response.content.sha
      };
    },
    async deleteFile({ owner, repo, path, branch, message, sha }) {
      const response = await request(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/contents/${encodePath(path)}`,
        {
          method: "DELETE",
          body: JSON.stringify({
            branch,
            message,
            sha
          })
        }
      );
      return {
        path: response?.content?.path ?? path
      };
    },
    async createPullRequest({ owner, repo, title, body, head, base }) {
      const pullRequest = await request(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`,
        {
          method: "POST",
          body: JSON.stringify({ base, body, head, title })
        }
      );
      if (!pullRequest) {
        throw new GitHubLiteApiError(
          "GitHub pull request was empty.",
          "unknown",
          500
        );
      }
      return mapPullRequestResponse(pullRequest);
    },
    async getPullRequest({ owner, repo, pullNumber }) {
      const pullRequest = await request(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/pulls/${pullNumber}`,
        {},
        { allowNotFound: true }
      );
      return pullRequest ? mapPullRequestResponse(pullRequest) : null;
    },
    async updatePullRequest({ owner, repo, pullNumber, body, title }) {
      const pullRequest = await request(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/pulls/${pullNumber}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            ...body !== void 0 ? { body } : {},
            ...title !== void 0 ? { title } : {}
          })
        }
      );
      if (!pullRequest) {
        throw new GitHubLiteApiError(
          "GitHub pull request was empty.",
          "unknown",
          500
        );
      }
      return mapPullRequestResponse(pullRequest);
    },
    async listPullRequests({ owner, repo, state = "open", base, head }) {
      const query = buildQuery({ base, head, per_page: "100", state });
      const pullRequests = await request(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/pulls${query}`
      );
      return (pullRequests ?? []).map(mapPullRequestResponse);
    },
    async listPullRequestFiles({ owner, repo, pullNumber }) {
      const files = await request(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/pulls/${pullNumber}/files?per_page=100`
      );
      return (files ?? []).map(mapPullRequestFileResponse);
    },
    async mergePullRequest({
      owner,
      repo,
      pullNumber,
      commitTitle,
      commitMessage,
      mergeMethod = "squash",
      expectedHeadSha
    }) {
      const result = await request(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/pulls/${pullNumber}/merge`,
        {
          method: "PUT",
          body: JSON.stringify({
            ...commitMessage ? { commit_message: commitMessage } : {},
            ...commitTitle ? { commit_title: commitTitle } : {},
            merge_method: mergeMethod,
            ...expectedHeadSha ? { sha: expectedHeadSha } : {}
          })
        }
      );
      if (!result) {
        throw new GitHubLiteApiError(
          "GitHub merge response was empty.",
          "unknown",
          500
        );
      }
      return {
        merged: result.merged,
        message: result.message,
        sha: result.sha
      };
    },
    async createIssue({ owner, repo, title, body, labels }) {
      const issue = await request(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/issues`,
        {
          method: "POST",
          body: JSON.stringify({ body, labels, title })
        }
      );
      return mapIssueResponse(issue);
    },
    async getIssue({ owner, repo, issueNumber }) {
      const issue = await request(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/issues/${issueNumber}`,
        {},
        { allowNotFound: true }
      );
      return issue ? mapIssueResponse(issue) : null;
    },
    async updateIssue({
      owner,
      repo,
      issueNumber,
      title,
      body,
      state,
      labels
    }) {
      const issue = await request(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/issues/${issueNumber}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            ...body !== void 0 ? { body } : {},
            ...labels !== void 0 ? { labels } : {},
            ...state !== void 0 ? { state } : {},
            ...title !== void 0 ? { title } : {}
          })
        }
      );
      return mapIssueResponse(issue);
    },
    async listIssues({ owner, repo, state = "open" }) {
      const query = buildQuery({ per_page: "100", state });
      const issues = await request(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/issues${query}`
      );
      return (issues ?? []).map(mapIssueResponse);
    },
    async searchIssues({
      owner,
      repo,
      query = "",
      state = "open",
      labels = []
    }) {
      const qualifierTerms = [`repo:${owner}/${repo}`, "is:issue"];
      const trimmedQuery = query.trim();
      if (state !== "all") {
        qualifierTerms.push(`state:${state}`);
      }
      for (const label of labels.map((value) => value.trim()).filter(Boolean)) {
        qualifierTerms.push(buildLabelSearchQualifier(label));
      }
      if (trimmedQuery) {
        qualifierTerms.push(trimmedQuery);
      }
      const searchResponse = await request(
        `/search/issues${buildQuery({ q: qualifierTerms.join(" ") })}`
      );
      return (searchResponse?.items ?? []).map(mapIssueResponse);
    },
    async listIssueEvents({ owner, repo, issueNumber }) {
      const events = await request(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/issues/${issueNumber}/events`
      );
      return (events ?? []).map(mapIssueEventResponse);
    },
    async listIssueComments({ owner, repo, issueNumber }) {
      const query = buildQuery({ per_page: "100" });
      const comments = await request(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/issues/${issueNumber}/comments${query}`
      );
      return (comments ?? []).map(
        (comment) => mapIssueCommentResponse(comment, issueNumber)
      );
    },
    async listWorkflows({ dispatchableOnly = false, owner, repo }) {
      const workflows = await request(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/actions/workflows`
      );
      const mappedWorkflows = (workflows?.workflows ?? []).map(
        mapWorkflowResponse
      );
      if (!dispatchableOnly) {
        return mappedWorkflows;
      }
      const dispatchable = await Promise.all(
        mappedWorkflows.map(async (workflow) => ({
          supported: await workflowSupportsDispatch({
            owner,
            path: workflow.path,
            repo
          }),
          workflow
        }))
      );
      return dispatchable.filter((candidate) => candidate.supported).map((candidate) => candidate.workflow);
    },
    async getWorkflow({ owner, repo, workflowId }) {
      const workflow = await request(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/actions/workflows/${encodePath(String(workflowId))}`,
        {},
        { allowNotFound: true }
      );
      return workflow ? mapWorkflowResponse(workflow) : null;
    },
    async listWorkflowRuns({
      owner,
      repo,
      event,
      perPage = 30,
      status,
      workflowId
    }) {
      const query = buildQuery({
        ...event ? { event } : {},
        per_page: String(perPage),
        ...status ? { status } : {}
      });
      const path = workflowId === void 0 ? `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo
      )}/actions/runs${query}` : `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo
      )}/actions/workflows/${encodePath(String(workflowId))}/runs${query}`;
      const runs = await request(path);
      return (runs?.workflow_runs ?? []).map(mapWorkflowRunResponse);
    },
    async getWorkflowRun({ owner, repo, runAttempt, runId }) {
      const run2 = await request(
        runAttempt ? `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/actions/runs/${runId}/attempts/${runAttempt}` : `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/actions/runs/${runId}`,
        {},
        { allowNotFound: true }
      );
      return run2 ? mapWorkflowRunResponse(run2) : null;
    },
    async listWorkflowRunJobs({ owner, repo, runAttempt, runId }) {
      const jobsPath = runAttempt ? `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo
      )}/actions/runs/${runId}/attempts/${runAttempt}/jobs` : `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo
      )}/actions/runs/${runId}/jobs`;
      const jobs = await request(jobsPath);
      return (jobs?.jobs ?? []).map(mapWorkflowJobResponse);
    },
    async getWorkflowJobLog({ owner, repo, jobId, maxBytes }) {
      const content = await requestText(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/actions/jobs/${jobId}/logs`
      );
      const limit = maxBytes ?? defaultLogMaxBytes;
      const truncatedContent = truncateTextByBytes(content, limit);
      return {
        content: truncatedContent.content,
        jobId,
        sizeBytes: getByteLength(content),
        truncated: truncatedContent.truncated
      };
    },
    async listLabels({ owner, repo }) {
      const labels = await request(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/labels`
      );
      return (labels ?? []).map(mapLabelResponse);
    },
    async createLabel({ owner, repo, name, color, description }) {
      const label = await request(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/labels`,
        {
          method: "POST",
          body: JSON.stringify({
            color,
            description,
            name
          })
        }
      );
      if (!label) {
        throw new GitHubLiteApiError(
          "GitHub label response was empty.",
          "unknown",
          500
        );
      }
      return mapLabelResponse(label);
    },
    async createIssueComment({ owner, repo, issueNumber, body }) {
      const comment = await request(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/issues/${issueNumber}/comments`,
        {
          method: "POST",
          body: JSON.stringify({ body })
        }
      );
      if (!comment) {
        throw new GitHubLiteApiError(
          "GitHub issue comment was empty.",
          "unknown",
          500
        );
      }
      return mapIssueCommentResponse(comment, issueNumber);
    },
    async addIssueLabels({ owner, repo, issueNumber, labels }) {
      await request(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/issues/${issueNumber}/labels`,
        {
          method: "POST",
          body: JSON.stringify({ labels })
        }
      );
    },
    async removeIssueLabel({ owner, repo, issueNumber, label }) {
      await request(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/issues/${issueNumber}/labels/${encodeURIComponent(label)}`,
        {
          method: "DELETE"
        }
      );
    },
    async getRepositoryPermissionForUser({ owner, repo, username }) {
      const permissionResponse = await request(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/collaborators/${encodeURIComponent(username)}/permission`,
        {},
        { allowNotFound: true }
      );
      if (!permissionResponse) {
        return {
          permission: "none",
          roleName: "none",
          username
        };
      }
      return {
        permission: mapRepositoryPermissionValue(
          permissionResponse.permission,
          permissionResponse.role_name
        ),
        roleName: normalizeRepositoryPermissionName(permissionResponse.role_name) ?? normalizeRepositoryPermissionName(permissionResponse.permission) ?? "none",
        username: permissionResponse.user?.login?.trim() || username
      };
    },
    async getTeamMembershipForUser({ org, teamSlug, username }) {
      const membership = await request(
        `/orgs/${encodeURIComponent(org)}/teams/${encodeURIComponent(
          teamSlug
        )}/memberships/${encodeURIComponent(username)}`,
        {},
        { allowNotFound: true }
      );
      if (!membership) {
        return null;
      }
      return {
        org,
        role: mapTeamMembershipRole(membership.role),
        state: mapTeamMembershipState(membership.state),
        teamSlug,
        username
      };
    },
    async closeIssue({ owner, repo, issueNumber }) {
      await request(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/issues/${issueNumber}`,
        {
          method: "PATCH",
          body: JSON.stringify({ state: "closed" })
        }
      );
    }
  };
}
function buildHeaders(token, initHeaders) {
  const headers = new Headers(initHeaders);
  headers.set("Accept", "application/vnd.github+json");
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Content-Type", "application/json");
  headers.set("X-GitHub-Api-Version", "2022-11-28");
  return headers;
}
function mapIssueResponse(issue) {
  if (!issue) {
    throw new GitHubLiteApiError("GitHub issue was empty.", "unknown", 500);
  }
  return {
    number: issue.number,
    title: issue.title,
    body: issue.body ?? "",
    labels: issue.labels.map((label) => typeof label === "string" ? label : label.name).filter((label) => Boolean(label)),
    url: issue.html_url,
    state: issue.state ?? "open",
    author: issue.user?.login ?? "",
    ...issue.created_at ? { createdAt: issue.created_at } : {},
    ...issue.updated_at ? { updatedAt: issue.updated_at } : {},
    isPullRequest: Boolean(issue.pull_request)
  };
}
function mapIssueCommentResponse(comment, issueNumber) {
  return {
    author: comment.user?.login ?? "",
    body: comment.body,
    createdAt: comment.created_at ?? "",
    updatedAt: comment.updated_at ?? comment.created_at ?? "",
    id: comment.id,
    issueNumber
  };
}
function mapIssueEventResponse(event) {
  return {
    actor: event.actor?.login ?? "",
    createdAt: event.created_at ?? "",
    event: event.event,
    id: event.id,
    ...event.label ? { label: mapLabelResponse(event.label) } : {}
  };
}
function mapLabelResponse(label) {
  return {
    color: label.color,
    ...label.description ? { description: label.description } : {},
    name: label.name
  };
}
function mapPullRequestResponse(pullRequest) {
  return {
    number: pullRequest.number,
    title: pullRequest.title,
    url: pullRequest.html_url,
    head: pullRequest.head.ref,
    headSha: pullRequest.head.sha,
    base: pullRequest.base.ref,
    ...pullRequest.base.sha ? { baseSha: pullRequest.base.sha } : {},
    state: pullRequest.state,
    author: pullRequest.user?.login ?? "",
    body: pullRequest.body ?? "",
    ...pullRequest.created_at ? { createdAt: pullRequest.created_at } : {},
    ...pullRequest.updated_at ? { updatedAt: pullRequest.updated_at } : {},
    merged: pullRequest.merged ?? Boolean(pullRequest.merged_at),
    ...pullRequest.merge_commit_sha ? { mergeSha: pullRequest.merge_commit_sha } : {},
    ...pullRequest.merged_at ? { mergedAt: pullRequest.merged_at } : {}
  };
}
function mapPullRequestFileResponse(file) {
  return {
    ...file.patch ? { patch: file.patch } : {},
    path: file.filename,
    ...file.previous_filename ? { previousPath: file.previous_filename } : {},
    status: file.status
  };
}
function mapWorkflowResponse(workflow) {
  return {
    id: workflow.id,
    name: workflow.name,
    path: workflow.path,
    state: workflow.state === "disabled" ? "disabled" : "active",
    url: workflow.html_url
  };
}
function mapWorkflowRunResponse(run2) {
  return {
    actor: run2.actor?.login ?? "",
    conclusion: mapWorkflowRunConclusion(run2.conclusion),
    ...run2.created_at ? { createdAt: run2.created_at } : {},
    ...run2.display_title ? { displayTitle: run2.display_title } : {},
    event: mapWorkflowRunEvent(run2.event),
    id: run2.id,
    name: run2.name?.trim() || run2.display_title?.trim() || `Run ${run2.id}`,
    runAttempt: run2.run_attempt ?? 1,
    ...run2.run_started_at ? { startedAt: run2.run_started_at } : {},
    status: mapWorkflowRunStatus(run2.status),
    ...run2.updated_at ? { updatedAt: run2.updated_at } : {},
    url: run2.html_url,
    workflowId: run2.workflow_id,
    ...run2.repository?.id !== void 0 && run2.repository.id !== null ? { repositoryId: String(run2.repository.id) } : {},
    ...run2.path ? { workflowPath: run2.path } : {}
  };
}
function mapWorkflowJobResponse(job) {
  return {
    conclusion: mapWorkflowRunConclusion(job.conclusion),
    ...job.completed_at ? { completedAt: job.completed_at } : {},
    id: job.id,
    name: job.name,
    ...job.started_at ? { startedAt: job.started_at } : {},
    status: mapWorkflowRunStatus(job.status),
    ...job.steps ? {
      steps: job.steps.map((step, index) => ({
        conclusion: mapWorkflowRunConclusion(step.conclusion),
        ...step.completed_at ? { completedAt: step.completed_at } : {},
        name: step.name?.trim() || `Step ${index + 1}`,
        number: step.number ?? index + 1,
        ...step.started_at ? { startedAt: step.started_at } : {},
        status: mapWorkflowRunStatus(step.status)
      }))
    } : {},
    ...job.html_url ? { url: job.html_url } : {}
  };
}
function mapWorkflowRunStatus(value) {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "queued" || normalized === "in_progress" || normalized === "completed") {
    return normalized;
  }
  return "queued";
}
function mapWorkflowRunConclusion(value) {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "success" || normalized === "failure" || normalized === "cancelled" || normalized === "skipped" || normalized === "timed_out" || normalized === "action_required") {
    return normalized;
  }
  return null;
}
function mapWorkflowRunEvent(value) {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "workflow_dispatch" || normalized === "issue_comment" || normalized === "schedule") {
    return normalized;
  }
  return "workflow_dispatch";
}
function mapRepositoryPermissionValue(permission, roleName) {
  const explicitRole = normalizeRepositoryPermissionName(roleName);
  if (explicitRole) {
    return explicitRole;
  }
  const basePermission = normalizeRepositoryPermissionName(permission);
  if (basePermission) {
    return basePermission;
  }
  return "none";
}
function normalizeRepositoryPermissionName(value) {
  const normalized = value?.trim().toLowerCase();
  switch (normalized) {
    case "admin":
    case "maintain":
    case "write":
    case "triage":
    case "read":
    case "none":
      return normalized;
    default:
      return null;
  }
}
function mapTeamMembershipState(value) {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "active" || normalized === "pending") {
    return normalized;
  }
  throw new GitHubLiteApiError(
    `Unsupported GitHub team membership state: ${value ?? "unknown"}`,
    "unknown",
    500
  );
}
function mapTeamMembershipRole(value) {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "member" || normalized === "maintainer") {
    return normalized;
  }
  throw new GitHubLiteApiError(
    `Unsupported GitHub team membership role: ${value ?? "unknown"}`,
    "unknown",
    500
  );
}
function buildQuery(params) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      query.set(key, value);
    }
  }
  const serializedQuery = query.toString();
  return serializedQuery ? `?${serializedQuery}` : "";
}
function buildLabelSearchQualifier(label) {
  return /\s/u.test(label) ? `label:"${label.replace(/"/g, '\\"')}"` : `label:${label}`;
}
function encodePath(path) {
  return path.split("/").map((part) => encodeURIComponent(part)).join("/");
}
function decodeBase64(value) {
  const bytes = Uint8Array.from(
    atob(value.replace(/\s/g, "")),
    (character) => character.charCodeAt(0)
  );
  return new TextDecoder().decode(bytes);
}
function encodeBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
function truncateTextByBytes(content, maxBytes) {
  if (maxBytes <= 0) {
    return {
      content: "",
      truncated: getByteLength(content) > 0
    };
  }
  const bytes = new TextEncoder().encode(content);
  if (bytes.byteLength <= maxBytes) {
    return {
      content,
      truncated: false
    };
  }
  return {
    content: new TextDecoder().decode(bytes.slice(0, maxBytes)),
    truncated: true
  };
}
function getByteLength(content) {
  return new TextEncoder().encode(content).byteLength;
}
function hasWorkflowDispatchTrigger(content) {
  return /(^|\n)\s*workflow_dispatch\s*:/m.test(content);
}
async function readErrorMessage(response) {
  try {
    const payload = await response.json();
    return payload.message ?? `GitHub API request failed with ${response.status}`;
  } catch {
    return `GitHub API request failed with ${response.status}`;
  }
}
function mapStatusToErrorCode(status) {
  if (status === 400) {
    return "bad-request";
  }
  if (status === 409) {
    return "conflict";
  }
  if (status === 401) {
    return "unauthorized";
  }
  if (status === 403) {
    return "forbidden";
  }
  if (status === 404) {
    return "not-found";
  }
  if (status === 422) {
    return "validation";
  }
  if (status === 429) {
    return "rate-limited";
  }
  return "unknown";
}
async function buildGitHubApiError(response) {
  const message = await readErrorMessage(response);
  return new GitHubLiteApiError(
    message,
    isRateLimitedResponse(response, message) ? "rate-limited" : mapStatusToErrorCode(response.status),
    response.status
  );
}
function isRateLimitedResponse(response, message) {
  if (response.status === 429) {
    return true;
  }
  if (response.status !== 403) {
    return false;
  }
  if (response.headers.get("x-ratelimit-remaining") === "0") {
    return true;
  }
  if (response.headers.has("retry-after")) {
    return true;
  }
  return message.toLowerCase().includes("rate limit");
}

// src/index.ts
var requestLabels = [
  {
    color: "1D4ED8",
    description: "BatchPlane execution request issue",
    name: "batchplane:execution-request"
  },
  {
    color: "0F766E",
    description: "BatchPlane native scheduled execution request",
    name: "batchplane:scheduled-execution"
  }
];
async function createNativeScheduledExecutionRequest(input) {
  assertNativeScheduleOccurrence(input);
  if (input.sourceRunAttempt !== 1) {
    throw new Error(
      "RERUN_NOT_AUTHORIZED: native schedule reruns cannot create a new occurrence."
    );
  }
  const client = createScheduleRequestGitHubClient({
    apiBaseUrl: input.apiBaseUrl ?? "https://api.github.com",
    fetcher: input.fetcher ?? fetch,
    repository: input.repository,
    token: input.githubToken
  });
  const definitionPath = input.definitionPath.trim() || `${input.configPath.replace(/\/+$/u, "")}/batches/${input.batchId}.yml`;
  const batchFile = await client.getFile(definitionPath, input.sha);
  if (!batchFile) {
    throw new Error(
      `Batch definition was not found: ${definitionPath} (${input.sha}).`
    );
  }
  const batch = parseBatchDefinition(batchFile.content, definitionPath);
  const revision = await resolveApprovedBatchRevision(input, batch.batchId);
  if (revision.controlStatus !== "VERIFIED") {
    throw new Error(
      revision.controlStatus === "UNKNOWN" ? "APPROVED_BATCH_REVISION_UNAVAILABLE: approved Batch revision could not be verified." : "UNAPPROVED_BATCH_REVISION: Batch revision does not match the latest approved governed change."
    );
  }
  const schedule = (batch.schedules ?? []).find(
    (candidate) => candidate.scheduleId === input.scheduleId
  );
  if (!schedule) {
    throw new Error(
      `Schedule ${input.scheduleId} was not found in ${definitionPath}.`
    );
  }
  if (!schedule.enabled) {
    throw new Error(`Schedule ${input.scheduleId} is disabled.`);
  }
  if (schedule.cron.trim() !== input.cron.trim()) {
    throw new Error(
      `Schedule ${input.scheduleId} cron does not match workflow configuration.`
    );
  }
  if (schedule.timezone.trim() !== input.timezone.trim()) {
    throw new Error(
      `Schedule ${input.scheduleId} timezone does not match workflow configuration.`
    );
  }
  if (batch.workflow.path !== input.workflowPath) {
    throw new Error(
      "NATIVE_SCHEDULE_WORKFLOW_MISMATCH: the running workflow is not the registered Batch workflow."
    );
  }
  if (batch.workflow.ref !== input.workflowRef) {
    throw new Error(
      "NATIVE_SCHEDULE_WORKFLOW_MISMATCH: the running workflow ref is not the registered Batch workflow ref."
    );
  }
  const requestId = await createScheduledExecutionRequestId(
    batch.batchId,
    input.scheduleId,
    input.repositoryId,
    input.sourceRunId
  );
  const existingIssue = await client.findIssueByRequestId(requestId);
  if (existingIssue) {
    throw new Error(
      `NATIVE_SCHEDULE_OCCURRENCE_ALREADY_RECORDED: ${requestId} already has Issue #${existingIssue.number}; no existing request can be reused as a fresh permit.`
    );
  }
  await client.ensureLabels(requestLabels);
  const issue = await buildExecutionRequestIssue({
    approvedBatchRevision: revision.approvedRevision,
    batch,
    reason: "Native GitHub Actions schedule occurrence from an approved BatchPlane schedule.",
    requestId,
    requestedAt: input.now ?? /* @__PURE__ */ new Date(),
    requestedBy: "github-actions[bot]",
    schedule: {
      definitionCommitSha: input.sha,
      definitionPath,
      repositoryId: input.repositoryId,
      scheduleId: input.scheduleId,
      sourceRunAttempt: input.sourceRunAttempt,
      sourceRunId: input.sourceRunId
    },
    triggerType: "SCHEDULE",
    workflowRef: batch.workflow.ref
  });
  const createdIssue = await client.createIssue(issue);
  return {
    issueNumber: createdIssue.number,
    requestDigest: issue.request.requestDigest,
    requestId,
    status: "created"
  };
}
function readScheduleRequestInputFromEnv(env = process.env) {
  return {
    apiBaseUrl: env.GITHUB_API_URL,
    batchId: readActionInput(env, "batch-id"),
    configPath: readActionInput(env, "config-path") || ".batch-governance",
    cron: readActionInput(env, "cron"),
    definitionPath: readActionInput(env, "definition-path"),
    eventName: env.GITHUB_EVENT_NAME ?? "",
    eventSchedule: readNativeScheduleEvent(env),
    githubToken: readActionInput(env, "github-token") || env.GITHUB_TOKEN || "",
    repository: env.GITHUB_REPOSITORY || "",
    repositoryId: env.GITHUB_REPOSITORY_ID ?? "",
    scheduleId: readActionInput(env, "schedule-id"),
    sha: env.GITHUB_WORKFLOW_SHA ?? "",
    sourceRunAttempt: Number.parseInt(env.GITHUB_RUN_ATTEMPT ?? "", 10),
    sourceRunId: env.GITHUB_RUN_ID ?? "",
    workflowPath: readWorkflowPath(env.GITHUB_WORKFLOW_REF ?? ""),
    workflowRef: readWorkflowRef(env.GITHUB_WORKFLOW_REF ?? ""),
    timezone: readActionInput(env, "timezone")
  };
}
async function run(env = process.env) {
  const input = readScheduleRequestInputFromEnv(env);
  let result;
  try {
    result = await createNativeScheduledExecutionRequest(input);
  } catch (error) {
    const reason = toReasonCode(error);
    setActionOutput("request-id", "");
    setActionOutput("request-digest", "");
    setActionOutput("issue-number", "");
    setActionOutput("failure-reason", reason);
    throw error;
  }
  setActionOutput("status", result.status);
  setActionOutput("request-id", result.requestId);
  setActionOutput("request-digest", result.requestDigest);
  setActionOutput("issue-number", String(result.issueNumber ?? ""));
  setActionOutput("failure-reason", "");
  console.log(
    `BatchPlane native schedule occurrence resolved: ${input.sourceRunId} (${input.timezone}, ${input.cron})`
  );
  return result;
}
function toReasonCode(error) {
  const message = error instanceof Error ? error.message : String(error);
  const match = /^([A-Z][A-Z0-9_]+):/u.exec(message);
  return match?.[1] ?? "SCHEDULE_REQUEST_FAILED";
}
function createScheduleRequestGitHubClient({
  apiBaseUrl,
  fetcher,
  repository,
  token
}) {
  const { owner, repo } = parseRepository(repository);
  async function request(path, init = {}, options = {}) {
    const response = await fetcher(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...init.headers
      }
    });
    if (response.status === 404 && options.allowNotFound) {
      return null;
    }
    if (!response.ok) {
      const error = new Error(
        `GitHub API request failed: ${response.status} ${await response.text()}`
      );
      error.status = response.status;
      throw error;
    }
    if (response.status === 204) {
      return null;
    }
    return await response.json();
  }
  const repoPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  return {
    async createIssue(issue) {
      const response = await request(`${repoPath}/issues`, {
        body: JSON.stringify({
          body: issue.body,
          labels: issue.labels,
          title: issue.title
        }),
        method: "POST"
      });
      if (!response) {
        throw new Error("GitHub issue response was empty.");
      }
      return {
        body: response.body ?? "",
        number: response.number,
        state: response.state ?? "open",
        title: response.title
      };
    },
    async ensureLabels(labels) {
      for (const label of labels) {
        try {
          await request(`${repoPath}/labels`, {
            body: JSON.stringify(label),
            method: "POST"
          });
        } catch (error) {
          if (!isGitHubApiStatus(error, 422)) {
            throw error;
          }
        }
      }
    },
    async findIssueByRequestId(requestId) {
      for (let page = 1; page <= 10; page += 1) {
        const response = await request(`${repoPath}/issues?state=all&per_page=100&page=${page}`);
        if (!response?.length) {
          break;
        }
        const matches = response.filter((issue) => {
          if (issue.pull_request) {
            return false;
          }
          return readRequestIdMarker(issue.body ?? "") === requestId;
        });
        if (matches.length > 0) {
          const match = matches[0];
          if (!match) {
            continue;
          }
          return {
            body: match.body ?? "",
            number: match.number,
            state: match.state ?? "open",
            title: match.title
          };
        }
      }
      return null;
    },
    async getFile(path, ref) {
      const response = await request(
        `${repoPath}/contents/${encodePath2(path)}?ref=${encodeURIComponent(
          ref
        )}`,
        {},
        { allowNotFound: true }
      );
      if (!response?.content) {
        return null;
      }
      if (response.encoding !== "base64") {
        throw new Error(
          `Unsupported GitHub content encoding: ${response.encoding}.`
        );
      }
      return {
        content: Buffer.from(response.content, "base64").toString("utf-8"),
        path: response.path
      };
    }
  };
}
function readRequestIdMarker(body) {
  const marker = body.match(
    /<!--\s*(?:batchplane|batchtrail):execution-request\s*([\s\S]*?)-->/u
  );
  if (!marker?.[1]) return void 0;
  const line = marker[1].split("\n").find((candidate) => candidate.trimStart().startsWith("requestId="));
  return line?.slice(line.indexOf("=") + 1).trim() || void 0;
}
function parseBatchDefinition(content, path) {
  const parsed = parseYamlDocument(content);
  if (!parsed.ok) {
    throw new Error(`Batch definition YAML is invalid: ${path}.`);
  }
  const validated = validateBatchDefinitionFile(parsed.value);
  if (!validated.ok) {
    throw new Error(`Batch definition is invalid: ${path}.`);
  }
  return fromBatchDefinitionFile(validated.value);
}
function fromBatchDefinitionFile(file) {
  return {
    batchId: file.metadata.id,
    criticality: file.spec.criticality,
    domain: file.spec.domain,
    environment: file.spec.environment,
    execution: file.spec.execution,
    gateRequired: file.spec.gateRequired,
    name: file.metadata.name,
    owner: file.spec.owner,
    schedules: file.spec.schedules?.map((schedule) => ({
      cron: schedule.cron,
      enabled: schedule.enabled,
      name: schedule.name,
      scheduleId: schedule.id,
      timezone: schedule.timezone
    })),
    status: file.spec.status,
    workflow: file.spec.workflow
  };
}
function assertNativeScheduleOccurrence(input) {
  if (input.eventName !== "schedule") {
    throw new Error(
      "NATIVE_SCHEDULE_EVENT_REQUIRED: schedule requests only run from GitHub's schedule event."
    );
  }
  if (!input.eventSchedule?.trim() || input.eventSchedule.trim() !== input.cron.trim()) {
    throw new Error(
      "NATIVE_SCHEDULE_CRON_MISMATCH: GitHub event schedule does not match the registered cron."
    );
  }
  if (!input.repositoryId.trim() || !isPositiveIntegerString(input.sourceRunId) || !input.workflowPath.trim() || !input.workflowRef.trim() || !input.sha.trim() || !Number.isInteger(input.sourceRunAttempt) || input.sourceRunAttempt < 1) {
    throw new Error(
      "NATIVE_SCHEDULE_RUN_REQUIRED: repository and source Run identifiers are required."
    );
  }
}
function isPositiveIntegerString(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0;
}
function readNativeScheduleEvent(env) {
  const path = env.GITHUB_EVENT_PATH;
  if (!path) return "";
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    return typeof value.schedule === "string" ? value.schedule : "";
  } catch {
    return "";
  }
}
function readWorkflowPath(workflowRef) {
  const marker = "/.github/workflows/";
  const start = workflowRef.indexOf(marker);
  const end = workflowRef.lastIndexOf("@");
  return start >= 0 && end > start ? workflowRef.slice(start + 1, end) : "";
}
function readWorkflowRef(workflowRef) {
  const separator = workflowRef.lastIndexOf("@");
  const value = separator >= 0 ? workflowRef.slice(separator + 1) : "";
  return value.replace(/^refs\/heads\//u, "").trim();
}
async function resolveApprovedBatchRevision(input, batchId) {
  if (input.verifyBatchRevision) {
    return input.verifyBatchRevision({
      batchId,
      executionWorkflowSha: input.sha
    });
  }
  const { owner, repo } = parseRepository(input.repository);
  return verifyApprovedBatchRevision({
    batchId,
    client: createGitHubLiteClient({
      apiBaseUrl: input.apiBaseUrl ?? "https://api.github.com",
      fetcher: input.fetcher ?? fetch,
      token: input.githubToken
    }),
    executionWorkflowSha: input.sha,
    repository: { owner, repo }
  });
}
function encodePath2(path) {
  return path.split("/").map((part) => encodeURIComponent(part)).join("/");
}
function parseRepository(value) {
  const [owner = "", repo = ""] = value.split("/", 2);
  if (!owner || !repo) {
    throw new Error("GITHUB_REPOSITORY must be in owner/repo format.");
  }
  return { owner, repo };
}
function isGitHubApiStatus(error, status) {
  return error instanceof Error && "status" in error && typeof error.status === "number" && error.status === status;
}
function readActionInput(env, name) {
  return env[`INPUT_${name.replace(/ /g, "_").toUpperCase()}`]?.trim() ?? "";
}
function setActionOutput(name, value) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    return;
  }
  appendFileSync(outputPath, `${name}=${value}
`);
}
var invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
export {
  createNativeScheduledExecutionRequest,
  readScheduleRequestInputFromEnv,
  run
};
