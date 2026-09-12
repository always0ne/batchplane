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

// ../../packages/github-lite/src/native-schedule-evidence.ts
async function verifyNativeScheduleRequestIssue(body, expected) {
  const marker = parseMarker(body, "execution-request");
  const payload = parseExecutionRequestPayload(body);
  if (!payload || !matchesMarker(marker, expected) || !matchesPayload(payload, expected)) {
    return null;
  }
  let digest;
  try {
    digest = await createRequestDigest(payload);
  } catch {
    return null;
  }
  if (digest !== expected.requestDigest || marker.get("requestDigest") !== digest) {
    return null;
  }
  return {
    payload,
    requestDigest: digest,
    requestId: expected.requestId
  };
}
function matchesMarker(marker, expected) {
  return marker.get("requestId") === expected.requestId && marker.get("batchId") === expected.batch.batchId && marker.get("requestDigest") === expected.requestDigest && marker.get("status") === "REQUESTED";
}
function matchesPayload(payload, expected) {
  const spec = payload.spec;
  const occurrence = spec.schedule;
  const batch = expected.batch;
  return payload.metadata.requestId === expected.requestId && payload.metadata.batchId === batch.batchId && spec.contractVersion === "NATIVE_SCHEDULE_V2" && spec.triggerType === "SCHEDULE" && spec.expiresAt === void 0 && sameRevision(spec.approvedBatchRevision, expected.approvedBatchRevision) && sameWorkflow(spec.workflow, batch.workflow) && sameBatchSnapshot(spec.batch, batch) && sameExecutionSnapshot(spec.execution, batch) && occurrence !== void 0 && sameOccurrence(occurrence, expected.occurrence);
}
function sameRevision(left, right) {
  return left.governedChangeId === right.governedChangeId && left.targetRevisionDigest === right.targetRevisionDigest;
}
function sameWorkflow(left, right) {
  return left.path === right.path && left.ref === right.ref;
}
function sameBatchSnapshot(left, right) {
  return left.name === right.name && left.owner === right.owner && left.domain === right.domain && left.environment === right.environment && left.criticality === right.criticality;
}
function sameExecutionSnapshot(execution, batch) {
  if (!batch.execution) return execution === void 0;
  if (!execution) return false;
  return execution.command === batch.execution.command && execution.gateRequired === batch.gateRequired && JSON.stringify(execution.runsOn) === JSON.stringify(batch.execution.runsOn) && execution.artifactPath === batch.execution.artifactPath;
}
function sameOccurrence(left, right) {
  return left.definitionCommitSha === right.definitionCommitSha && left.definitionPath === right.definitionPath && left.repositoryId === right.repositoryId && left.scheduleId === right.scheduleId && left.sourceRunAttempt === right.sourceRunAttempt && left.sourceRunId === right.sourceRunId;
}
function parseExecutionRequestPayload(body) {
  const match = body.match(
    /### Canonical payload\s*```json\s*([\s\S]*?)\s*```/u
  );
  if (!match?.[1]) return null;
  try {
    const value = JSON.parse(match[1]);
    return isExecutionRequestPayload(value) ? value : null;
  } catch {
    return null;
  }
}
function isExecutionRequestPayload(value) {
  if (!value || typeof value !== "object") return false;
  const record = value;
  const metadata = asRecord(record.metadata);
  const spec = asRecord(record.spec);
  const workflow = asRecord(spec?.workflow);
  const batch = asRecord(spec?.batch);
  const revision = asRecord(spec?.approvedBatchRevision);
  const schedule = asRecord(spec?.schedule);
  return isBatchPlaneApiVersion(record.apiVersion) && record.kind === "ExecutionRequest" && isString(metadata?.requestId) && isString(metadata?.batchId) && spec?.contractVersion === "NATIVE_SCHEDULE_V2" && spec.triggerType === "SCHEDULE" && spec.expiresAt === void 0 && isString(workflow?.path) && isString(workflow?.ref) && isString(batch?.name) && isString(batch?.owner) && isString(batch?.domain) && isString(batch?.environment) && isString(batch?.criticality) && isString(revision?.governedChangeId) && isString(revision?.targetRevisionDigest) && isString(schedule?.definitionCommitSha) && isString(schedule?.definitionPath) && isString(schedule?.repositoryId) && isString(schedule?.scheduleId) && isString(schedule?.sourceRunId) && Number.isInteger(schedule?.sourceRunAttempt);
}
function parseMarker(body, name) {
  const marker = /* @__PURE__ */ new Map();
  const match = body.match(
    new RegExp(
      `<!--\\s*(?:batchplane|batchtrail):${name}\\s*([\\s\\S]*?)-->`,
      "u"
    )
  );
  if (!match?.[1]) return marker;
  for (const line of match[1].split("\n")) {
    const separator = line.indexOf("=");
    if (separator > 0) {
      marker.set(
        line.slice(0, separator).trim(),
        line.slice(separator + 1).trim()
      );
    }
  }
  return marker;
}
function asRecord(value) {
  return value && typeof value === "object" ? value : void 0;
}
function isString(value) {
  return typeof value === "string";
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
      const run = await request(
        runAttempt ? `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/actions/runs/${runId}/attempts/${runAttempt}` : `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/actions/runs/${runId}`,
        {},
        { allowNotFound: true }
      );
      return run ? mapWorkflowRunResponse(run) : null;
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
function mapWorkflowRunResponse(run) {
  return {
    actor: run.actor?.login ?? "",
    conclusion: mapWorkflowRunConclusion(run.conclusion),
    ...run.created_at ? { createdAt: run.created_at } : {},
    ...run.display_title ? { displayTitle: run.display_title } : {},
    event: mapWorkflowRunEvent(run.event),
    id: run.id,
    name: run.name?.trim() || run.display_title?.trim() || `Run ${run.id}`,
    runAttempt: run.run_attempt ?? 1,
    ...run.run_started_at ? { startedAt: run.run_started_at } : {},
    status: mapWorkflowRunStatus(run.status),
    ...run.updated_at ? { updatedAt: run.updated_at } : {},
    url: run.html_url,
    workflowId: run.workflow_id,
    ...run.repository?.id !== void 0 && run.repository.id !== null ? { repositoryId: String(run.repository.id) } : {},
    ...run.path ? { workflowPath: run.path } : {}
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

// src/gate-schema.ts
var batchPlaneApiVersion2 = "batchplane.io/v1";
var legacyBatchPlaneApiVersion2 = "batchtrail.io/v1";
var supportedBatchPlaneApiVersions2 = [
  batchPlaneApiVersion2,
  legacyBatchPlaneApiVersion2
];
var repositoryRoleValues2 = ["admin", "maintain", "write", "triage"];
var workspaceApprovalModeValues2 = [
  "SELF_APPROVAL_BLOCKED",
  "SELF_APPROVAL_ALLOWED",
  "AUTO_APPROVE"
];
function parseYamlDocument2(input) {
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
    const indent = countLeadingSpaces2(rawLine);
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
    const parsedValue = parseYamlScalar2(rawValue, lineNumber, indent + 1);
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
function validateBatchDefinitionFile2(file) {
  if (!isRecord2(file)) {
    return { ok: false };
  }
  if (!isBatchPlaneApiVersion2(file.apiVersion) || file.kind !== "BatchDefinition") {
    return { ok: false };
  }
  const metadata = asRecord2(file.metadata);
  const spec = asRecord2(file.spec);
  if (!metadata || !spec) {
    return { ok: false };
  }
  if (!isString2(metadata.id) || !isString2(metadata.name)) {
    return { ok: false };
  }
  const workflow = asRecord2(spec.workflow);
  if (!workflow) {
    return { ok: false };
  }
  if (!isBoolean(spec.gateRequired) || !isAllowedBatchStatus(spec.status) || !isString2(workflow.path) || !isString2(workflow.ref)) {
    return { ok: false };
  }
  return {
    ok: true,
    value: {
      apiVersion: batchPlaneApiVersion2,
      kind: "BatchDefinition",
      metadata: {
        id: metadata.id,
        name: metadata.name
      },
      spec: {
        gateRequired: spec.gateRequired,
        schedules: Array.isArray(spec.schedules) ? spec.schedules.map(asRecord2).filter(
          (schedule) => schedule !== null && isString2(schedule.cron) && isString2(schedule.id) && isBoolean(schedule.enabled)
        ).map((schedule) => ({
          cron: schedule.cron,
          enabled: schedule.enabled,
          id: schedule.id
        })) : void 0,
        status: spec.status,
        workflow: {
          path: workflow.path,
          ref: workflow.ref
        }
      }
    }
  };
}
function validateRoleMappingFile2(file) {
  if (!isRecord2(file)) {
    return { ok: false };
  }
  if (!isBatchPlaneApiVersion2(file.apiVersion) || file.kind !== "RoleMapping") {
    return { ok: false };
  }
  const metadata = asRecord2(file.metadata);
  const spec = asRecord2(file.spec);
  const roles = asRecord2(spec?.roles);
  const approver = asRecord2(roles?.approver);
  if (!metadata || !spec || !roles || !approver || !isString2(metadata.id)) {
    return { ok: false };
  }
  const githubUsers = readOptionalStringArray(approver.githubUsers);
  const githubTeams = readOptionalStringArray(approver.githubTeams);
  const repositoryRoles = readOptionalRepositoryRolesArray(
    approver.repositoryRoles
  );
  if (!githubUsers.ok || !githubTeams.ok || !repositoryRoles.ok) {
    return { ok: false };
  }
  return {
    ok: true,
    value: {
      apiVersion: batchPlaneApiVersion2,
      kind: "RoleMapping",
      metadata: { id: metadata.id },
      spec: {
        roles: {
          approver: {
            ...githubUsers.value ? { githubUsers: githubUsers.value } : {},
            ...githubTeams.value ? { githubTeams: githubTeams.value } : {},
            ...repositoryRoles.value ? { repositoryRoles: repositoryRoles.value } : {}
          }
        }
      }
    }
  };
}
function validateWorkspacePolicyFile2(file) {
  if (!isRecord2(file)) {
    return { ok: false };
  }
  if (!isBatchPlaneApiVersion2(file.apiVersion) || file.kind !== "WorkspacePolicy") {
    return { ok: false };
  }
  const metadata = asRecord2(file.metadata);
  const spec = asRecord2(file.spec);
  const approval = asRecord2(spec?.approval);
  if (!metadata || !spec || !approval || !isString2(metadata.id) || !isWorkspaceApprovalMode(approval.mode)) {
    return { ok: false };
  }
  return {
    ok: true,
    value: {
      apiVersion: batchPlaneApiVersion2,
      kind: "WorkspacePolicy",
      metadata: { id: metadata.id },
      spec: {
        approval: {
          mode: approval.mode
        }
      }
    }
  };
}
function parseYamlScalar2(value, line, column) {
  if (value === "true") {
    return { ok: true, value: true };
  }
  if (value === "false") {
    return { ok: true, value: false };
  }
  if (value === "null") {
    return { ok: true, value: null };
  }
  if (/^-?\d+(\.\d+)?$/u.test(value)) {
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
function countLeadingSpaces2(value) {
  return value.length - value.trimStart().length;
}
function isRecord2(value) {
  return typeof value === "object" && value !== null;
}
function asRecord2(value) {
  return isRecord2(value) ? value : null;
}
function isString2(value) {
  return typeof value === "string";
}
function isBatchPlaneApiVersion2(value) {
  return typeof value === "string" && supportedBatchPlaneApiVersions2.includes(value);
}
function isBoolean(value) {
  return typeof value === "boolean";
}
function isAllowedBatchStatus(value) {
  return value === "ACTIVE" || value === "INACTIVE";
}
function isWorkspaceApprovalMode(value) {
  return workspaceApprovalModeValues2.includes(value);
}
function readOptionalStringArray(value) {
  if (value === void 0) {
    return { ok: true, value: void 0 };
  }
  if (!Array.isArray(value) || value.some((item) => !isString2(item))) {
    return { ok: false };
  }
  return { ok: true, value };
}
function readOptionalRepositoryRolesArray(value) {
  if (value === void 0) {
    return { ok: true, value: void 0 };
  }
  if (!Array.isArray(value) || value.some((item) => !repositoryRoleValues2.includes(item))) {
    return { ok: false };
  }
  return { ok: true, value };
}

// src/index.ts
function verifyLiteInput(input) {
  if (input.mode !== "lite") {
    return {
      result: "DENY",
      reasonCode: "UNSUPPORTED_MODE",
      message: "Only lite mode is scaffolded."
    };
  }
  if (!input.batchId) {
    return {
      result: "DENY",
      reasonCode: "BATCH_ID_REQUIRED",
      message: "Batch ID is required."
    };
  }
  if ((input.runAttempt ?? 1) > 1) {
    return {
      result: "DENY",
      reasonCode: "RERUN_NOT_AUTHORIZED",
      message: "GitHub Actions reruns are not authorized by BatchPlane. Create a new execution request or approved retry instead."
    };
  }
  if (!input.requestId) {
    return {
      result: "DENY",
      reasonCode: input.controllerReason || "EXECUTION_REQUEST_REQUIRED",
      message: input.controllerReason ? `Native schedule controller denied this occurrence: ${input.controllerReason}.` : "Execution request evidence is required."
    };
  }
  if (!input.requestDigest?.startsWith("sha256:")) {
    return {
      result: "DENY",
      reasonCode: "REQUEST_DIGEST_REQUIRED",
      message: "Approved request digest is required."
    };
  }
  return input.eventName === "schedule" ? verifyNativeScheduleInput(input) : verifyManualGateInput(input);
}
function verifyManualGateInput(input) {
  if (!input.approvalSource || !input.approvalRef) {
    return deny(
      "APPROVAL_EVIDENCE_REQUIRED",
      "Approval evidence source and reference are required."
    );
  }
  return {
    result: "ALLOW",
    message: "Manual execution request evidence is present."
  };
}
function verifyNativeScheduleInput(input) {
  if (!input.eventSchedule?.trim() || !input.repositoryId?.trim() || !isPositiveIntegerString(input.sourceRunId) || !Number.isInteger(input.runAttempt) || (input.runAttempt ?? 0) < 1 || !input.workflowPath?.trim() || !input.workflowRef?.trim() || !input.workflowSha?.trim()) {
    return deny(
      "NATIVE_SCHEDULE_CONTEXT_REQUIRED",
      "GitHub schedule event, repository, Run, workflow path, ref, and SHA context are required."
    );
  }
  return {
    result: "ALLOW",
    message: "Native schedule occurrence context is present."
  };
}
async function verifyLiteAuthorization(input, verifyBatchRevision = verifyApprovedBatchRevision) {
  const inputResult = verifyLiteInput(input);
  if (inputResult.result === "DENY") {
    return inputResult;
  }
  const expectedActor = input.expectedDispatcherActor ?? "github-actions[bot]";
  if (input.eventName !== "schedule" && input.actor && input.actor !== expectedActor) {
    return {
      result: "DENY",
      reasonCode: "DIRECT_DISPATCH_NOT_AUTHORIZED",
      message: `Workflow actor ${input.actor} is not the BatchPlane dispatcher actor ${expectedActor}.`
    };
  }
  if (!input.githubToken || !input.repository) {
    return {
      result: "DENY",
      reasonCode: "GITHUB_EVIDENCE_LOOKUP_REQUIRED",
      message: "GitHub token and repository are required to verify evidence."
    };
  }
  const repository = parseRepository(input.repository);
  const client = createGateGitHubClient({
    apiBaseUrl: input.apiBaseUrl ?? "https://api.github.com",
    fetcher: input.fetcher ?? fetch,
    owner: repository.owner,
    repo: repository.repo,
    token: input.githubToken
  });
  let evidence;
  try {
    evidence = await findGitHubApprovalEvidence({
      client,
      issueNumber: input.eventName === "schedule" ? parseNativeIssueNumber(input.issueNumber) : void 0,
      loadApproval: input.eventName !== "schedule",
      requestId: input.requestId ?? ""
    });
  } catch (error) {
    return deny(
      "GITHUB_EVIDENCE_LOOKUP_FAILED",
      `GitHub evidence lookup failed: ${toErrorMessage(error)}`
    );
  }
  if (!evidence.request) {
    return deny(
      "REQUEST_EVIDENCE_NOT_FOUND",
      "Execution request Issue evidence was not found."
    );
  }
  if (input.eventName === "schedule") {
    const suppliedIssueNumber = Number(input.issueNumber);
    if (!Number.isInteger(suppliedIssueNumber) || suppliedIssueNumber < 1 || evidence.issueNumber !== suppliedIssueNumber) {
      return deny(
        "NATIVE_SCHEDULE_ISSUE_MISMATCH",
        "The schedule control Issue number does not identify the exact canonical request evidence."
      );
    }
  }
  if (evidence.request.requestId !== input.requestId || evidence.request.batchId !== input.batchId || evidence.request.requestDigest !== input.requestDigest) {
    return deny(
      "REQUEST_EVIDENCE_MISMATCH",
      "Execution request evidence does not match workflow inputs."
    );
  }
  if (evidence.request.status !== "REQUESTED") {
    return deny(
      "REQUEST_NOT_REQUESTED",
      `Execution request status is ${evidence.request.status}.`
    );
  }
  if (input.eventName !== "schedule" && input.approvalSource !== "issue") {
    return deny(
      "APPROVAL_SOURCE_NOT_SUPPORTED",
      `Approval source ${input.approvalSource} is not supported.`
    );
  }
  if (input.eventName !== "schedule" && input.approvalRef !== evidence.request.requestId) {
    return deny(
      "APPROVAL_REFERENCE_MISMATCH",
      "Approval reference does not match the execution request."
    );
  }
  const batchValidation = await validateBatchPolicyEvidence({
    batchId: input.batchId,
    client,
    configPath: input.configPath,
    inputRef: input.eventName === "schedule" ? input.workflowRef : input.ref,
    eventSchedule: input.eventName === "schedule" ? input.eventSchedule : void 0,
    actualWorkflowPath: input.eventName === "schedule" ? input.workflowPath : void 0,
    actualWorkflowRef: input.eventName === "schedule" ? input.workflowRef : void 0,
    repository,
    request: evidence.request
  });
  if (batchValidation.result === "DENY") {
    return batchValidation;
  }
  const authorization = input.eventName === "schedule" ? await verifyNativeScheduleAuthorization({
    batch: await loadNativeScheduleBatch({ client, input }),
    evidence,
    input
  }) : await verifyManualAuthorization({
    client,
    evidence,
    input,
    repository
  });
  if (authorization.result === "DENY") {
    return authorization;
  }
  if (!input.workflowSha) {
    return deny(
      "WORKFLOW_SOURCE_SHA_REQUIRED",
      "The immutable workflow source SHA is required to verify registered Batch artifacts."
    );
  }
  const revisionValidation = await verifyBatchRevision({
    batchId: input.batchId,
    client: createGitHubLiteClient({
      apiBaseUrl: input.apiBaseUrl ?? "https://api.github.com",
      fetcher: input.fetcher ?? fetch,
      token: input.githubToken
    }),
    executionWorkflowSha: input.workflowSha,
    expectedRevision: evidence.request.approvedBatchRevision,
    repository
  });
  if (revisionValidation.controlStatus !== "VERIFIED") {
    return deny(
      revisionValidation.reasonCode,
      revisionValidation.controlStatus === "UNKNOWN" ? "Approved Batch revision could not be verified." : "Batch revision does not match the latest approved governed change."
    );
  }
  if (!isCommitSha(revisionValidation.verifiedSha)) {
    return deny(
      "VERIFIED_SHA_INVALID",
      "Approved Batch revision did not resolve to an immutable commit SHA."
    );
  }
  return {
    result: "ALLOW",
    verifiedSha: revisionValidation.verifiedSha,
    message: authorization.message
  };
}
async function verifyNativeScheduleAuthorization({
  batch,
  evidence,
  input
}) {
  const request = evidence.request;
  if (!request || !evidence.issueBody || !batch) {
    return deny(
      "NATIVE_SCHEDULE_REQUEST_UNVERIFIED",
      "Native schedule request or its current Batch snapshot could not be verified."
    );
  }
  const scheduleMapping = validateScheduleMapping({
    request,
    scheduleId: input.scheduleId
  });
  if (scheduleMapping.result === "DENY") {
    return scheduleMapping;
  }
  const occurrence = request.schedule;
  if (request.triggerType !== "SCHEDULE" || !occurrence || input.runAttempt !== 1 || occurrence.repositoryId !== input.repositoryId || occurrence.sourceRunId !== input.sourceRunId || occurrence.sourceRunAttempt !== input.runAttempt) {
    return deny(
      "NATIVE_SCHEDULE_OCCURRENCE_MISMATCH",
      "Native schedule Run, attempt, repository, or occurrence evidence does not match the request."
    );
  }
  const verifiedRequest = await verifyNativeScheduleRequestIssue(
    evidence.issueBody,
    {
      approvedBatchRevision: request.approvedBatchRevision,
      batch,
      occurrence: {
        definitionCommitSha: input.workflowSha ?? "",
        definitionPath: `${input.configPath.replace(/\/+$/u, "")}/batches/${input.batchId}.yml`,
        repositoryId: input.repositoryId ?? "",
        scheduleId: input.scheduleId ?? "",
        sourceRunAttempt: input.runAttempt ?? 0,
        sourceRunId: input.sourceRunId ?? ""
      },
      requestDigest: input.requestDigest ?? "",
      requestId: input.requestId ?? ""
    }
  );
  if (!verifiedRequest) {
    return deny(
      "NATIVE_SCHEDULE_REQUEST_UNVERIFIED",
      "Native schedule request marker, digest, source tuple, workflow, revision, or Batch snapshot does not match."
    );
  }
  return {
    message: "Native schedule occurrence and approved Batch revision evidence are verified.",
    result: "ALLOW"
  };
}
async function loadNativeScheduleBatch({
  client,
  input
}) {
  const ref = input.workflowSha?.trim();
  if (!ref) return null;
  const path = `${input.configPath.replace(/\/+$/u, "")}/batches/${input.batchId}.yml`;
  try {
    const file = await client.getFile(path, ref);
    if (!file) return null;
    return parseBatchDefinitionYaml(file.content);
  } catch {
    return null;
  }
}
async function verifyManualAuthorization({
  client,
  evidence,
  input,
  repository
}) {
  const request = evidence.request;
  const approval = evidence.approval;
  if (!request || !approval) {
    return deny(
      "EXECUTION_REQUEST_NOT_APPROVED",
      "Execution request does not have approved comment evidence."
    );
  }
  if (approval.edited) {
    return deny(
      "APPROVAL_COMMENT_EDITED",
      "Execution approval comment was edited after creation."
    );
  }
  if (approval.commandDigest && approval.commandDigest !== request.requestDigest) {
    return deny(
      "REQUEST_DIGEST_MISMATCH",
      "Approval command digest does not match execution request digest."
    );
  }
  if (approval.requestDigest !== input.requestDigest || approval.requestDigest !== request.requestDigest) {
    return deny(
      "REQUEST_DIGEST_MISMATCH",
      "Execution approval digest does not match execution request digest."
    );
  }
  if (approval.approvalType === "SCHEDULE_DELEGATED") {
    return deny(
      "SCHEDULE_DELEGATED_APPROVAL_NOT_SUPPORTED",
      "Delegated schedule approval evidence is historical and cannot authorize a new execution."
    );
  }
  let workspaceApprovalMode;
  try {
    workspaceApprovalMode = await readWorkspaceApprovalMode({
      client,
      configPath: input.configPath,
      ref: request.workflowRef || input.ref
    });
  } catch (error) {
    return deny(
      "WORKSPACE_POLICY_LOOKUP_FAILED",
      `Workspace policy lookup failed: ${toErrorMessage(error)}`
    );
  }
  if (approval.approvalType === "WORKSPACE_AUTO_APPROVED") {
    return workspaceApprovalMode === "AUTO_APPROVE" ? {
      message: "Execution request, Workspace auto-approval evidence, and batch policy are verified.",
      result: "ALLOW"
    } : deny(
      "WORKSPACE_AUTO_APPROVAL_NOT_ALLOWED",
      "Workspace auto-approval evidence requires AUTO_APPROVE policy mode."
    );
  }
  if (approval.approver === request.requestedBy && !allowsSelfApproval(workspaceApprovalMode)) {
    return deny(
      "SELF_APPROVAL_NOT_ALLOWED",
      "Requester and approver must be different users."
    );
  }
  const approverAuthorized = await verifyApproverAuthorization({
    allowMissingRoleMapping: approval.approver === request.requestedBy && allowsSelfApproval(workspaceApprovalMode),
    approver: approval.approver,
    client,
    configPath: input.configPath,
    ref: request.workflowRef || input.ref,
    repository
  });
  if (!approverAuthorized.allowed) {
    return deny(
      "APPROVER_NOT_AUTHORIZED",
      approverAuthorized.message || `Approver @${approval.approver} is not authorized.`
    );
  }
  return {
    message: "Execution request, approval evidence, and batch policy are verified.",
    result: "ALLOW"
  };
}
function readGateInputFromEnv(env = process.env) {
  const eventName = env.GITHUB_EVENT_NAME;
  const eventSchedule = readNativeScheduleEvent(env);
  const workflowPath = readWorkflowPath(env.GITHUB_WORKFLOW_REF ?? "");
  const workflowRef = readWorkflowRef(env.GITHUB_WORKFLOW_REF ?? "");
  const recordEvidence = readActionInput(env, "record-evidence") === "true";
  return {
    mode: readActionInput(env, "mode"),
    batchId: readActionInput(env, "batch-id"),
    configPath: readActionInput(env, "config-path") || ".batch-governance",
    ref: readOptionalActionInput(env, "ref"),
    ...eventName ? { eventName } : {},
    ...eventSchedule ? { eventSchedule } : {},
    ...env.GITHUB_REPOSITORY_ID ? { repositoryId: env.GITHUB_REPOSITORY_ID } : {},
    ...env.GITHUB_RUN_ID ? { sourceRunId: env.GITHUB_RUN_ID } : {},
    ...workflowPath ? { workflowPath } : {},
    ...workflowRef ? { workflowRef } : {},
    ...readOptionalActionInput(env, "issue-number") ? { issueNumber: readOptionalActionInput(env, "issue-number") } : {},
    ...recordEvidence ? { recordEvidence } : {},
    ...readOptionalActionInput(env, "controller-reason") ? { controllerReason: readOptionalActionInput(env, "controller-reason") } : {},
    ...readOptionalActionInput(env, "gate-job-name") ? { gateJobName: readOptionalActionInput(env, "gate-job-name") } : {},
    ...readOptionalActionInput(env, "gate-step-name") ? { gateStepName: readOptionalActionInput(env, "gate-step-name") } : {},
    scheduleId: readOptionalActionInput(env, "schedule-id"),
    requestId: readOptionalActionInput(env, "request-id"),
    approvalSource: readOptionalActionInput(env, "approval-source"),
    approvalRef: readOptionalActionInput(env, "approval-ref"),
    requestDigest: readOptionalActionInput(env, "request-digest"),
    runAttempt: readRunAttempt(env),
    githubToken: readOptionalActionInput(env, "github-token") ?? env.GITHUB_TOKEN,
    repository: env.GITHUB_REPOSITORY,
    actor: env.GITHUB_ACTOR,
    expectedDispatcherActor: readOptionalActionInput(env, "dispatcher-actor") ?? "github-actions[bot]",
    apiBaseUrl: env.GITHUB_API_URL,
    ...env.GITHUB_WORKFLOW_SHA ? { workflowSha: env.GITHUB_WORKFLOW_SHA } : {}
  };
}
async function runGateFromEnv(env = process.env) {
  const input = readGateInputFromEnv(env);
  let result = await verifyLiteAuthorization(input);
  if (input.recordEvidence) {
    try {
      await recordNativeScheduleGateDecision(input, result);
    } catch (error) {
      const message = `Gate decision evidence could not be recorded: ${toErrorMessage(error)}`;
      if (result.result === "ALLOW") {
        result = deny("GATE_EVIDENCE_RECORDING_FAILED", message);
      } else {
        console.error(message);
      }
    }
  }
  writeGateOutputs(result, env);
  writeGateSummary(result, input, env);
  writeGateLogRecord(result, input, env);
  if (result.result === "DENY") {
    console.error(`BatchPlane Gate denied execution: ${result.reasonCode}`);
    console.error(result.message);
    process.exitCode = 1;
    return result;
  }
  console.log(`BatchPlane Gate allowed execution: ${result.message}`);
  return result;
}
async function recordNativeScheduleGateDecision(input, result) {
  if (input.eventName !== "schedule" || !input.issueNumber || !input.githubToken || !input.repository) {
    throw new Error(
      "Native Gate evidence requires issue, repository, and token inputs."
    );
  }
  const issueNumber = Number(input.issueNumber);
  if (!Number.isInteger(issueNumber) || issueNumber < 1) {
    throw new Error("Native Gate evidence requires a positive Issue number.");
  }
  const { owner, repo } = parseRepository(input.repository);
  const body = [
    "## BatchPlane Native Schedule Gate",
    "",
    `- Decision: ${result.result}`,
    `- Source Run: \`${input.sourceRunId ?? ""}\``,
    `- Run attempt: ${input.runAttempt ?? "unavailable"}`,
    `- Schedule ID: \`${input.scheduleId ?? ""}\``,
    `- Reason: ${result.reasonCode ?? ""}`,
    "",
    "<!-- batchplane:gate-decision",
    `allowed=${result.result === "ALLOW"}`,
    `requestId=${input.requestId ?? ""}`,
    `batchId=${input.batchId}`,
    `requestDigest=${input.requestDigest ?? ""}`,
    `scheduleId=${input.scheduleId ?? ""}`,
    `repositoryId=${input.repositoryId ?? ""}`,
    `sourceRunId=${input.sourceRunId ?? ""}`,
    `sourceRunAttempt=${input.runAttempt ?? ""}`,
    ...result.reasonCode ? [`reasonCode=${result.reasonCode}`] : [],
    "-->"
  ].join("\n");
  const response = await (input.fetcher ?? fetch)(
    `${(input.apiBaseUrl ?? "https://api.github.com").replace(/\/+$/u, "")}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/comments`,
    {
      body: JSON.stringify({ body }),
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${input.githubToken}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28"
      },
      method: "POST"
    }
  );
  if (!response.ok) {
    throw new Error(
      `GitHub API request failed: ${response.status} ${await response.text()}`
    );
  }
  const acknowledgement = await response.json();
  if (!Number.isInteger(acknowledgement.id) || acknowledgement.id < 1) {
    throw new Error(
      "GitHub Gate decision write acknowledgement was missing a comment ID."
    );
  }
}
function readActionInput(env, name) {
  const envKey = `INPUT_${name.toUpperCase()}`;
  const fallbackKey = envKey.replaceAll("-", "_");
  return (env[envKey] ?? env[fallbackKey] ?? "").trim();
}
function readOptionalActionInput(env, name) {
  const value = readActionInput(env, name);
  return value || void 0;
}
function readRunAttempt(env) {
  const raw = env.GITHUB_RUN_ATTEMPT;
  const value = raw ? Number(raw) : Number.NaN;
  const valid = Number.isInteger(value) && value > 0;
  if (env.GITHUB_EVENT_NAME === "schedule") {
    return valid ? value : void 0;
  }
  return valid ? value : 1;
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
function isCommitSha(value) {
  return /^[0-9a-f]{40}$/iu.test(value);
}
function deny(reasonCode, message) {
  return {
    message,
    reasonCode,
    result: "DENY"
  };
}
function toErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
function allowsSelfApproval(mode) {
  return mode === "SELF_APPROVAL_ALLOWED" || mode === "AUTO_APPROVE";
}
async function findGitHubApprovalEvidence({
  client,
  issueNumber,
  loadApproval,
  requestId
}) {
  const issue = issueNumber === void 0 ? await client.findExecutionRequestIssue(requestId) : await client.getIssue(issueNumber);
  if (!issue) {
    return { approval: null, request: null };
  }
  const request = parseExecutionRequestEvidence(issue.body);
  if (!request) {
    return { approval: null, request: null };
  }
  const approval = loadApproval ? (await client.listIssueComments(issue.number)).map(parseExecutionApprovalEvidence).find(
    (evidence) => evidence ? evidence.requestId === request.requestId && evidence.batchId === request.batchId && evidence.requestDigest === request.requestDigest : false
  ) ?? null : null;
  return {
    approval,
    issueBody: issue.body,
    issueNumber: issue.number,
    request
  };
}
function parseNativeIssueNumber(value) {
  const issueNumber = Number(value);
  if (!Number.isInteger(issueNumber) || issueNumber < 1) {
    throw new Error("NATIVE_SCHEDULE_ISSUE_MISMATCH");
  }
  return issueNumber;
}
async function validateBatchPolicyEvidence({
  batchId,
  client,
  configPath,
  eventSchedule,
  actualWorkflowPath,
  actualWorkflowRef,
  inputRef,
  repository,
  request
}) {
  const effectiveConfigPath = configPath.replace(/\/+$/u, "");
  const effectiveRef = inputRef || request.workflowRef;
  const batchPath = `${effectiveConfigPath}/batches/${batchId}.yml`;
  const batchFile = await client.getFile(batchPath, effectiveRef);
  if (!batchFile) {
    return deny(
      "BATCH_NOT_FOUND",
      `Batch definition was not found: ${batchPath} (${effectiveRef || "default ref"}).`
    );
  }
  const snapshot = parseBatchDefinitionSnapshot(batchFile.content);
  if (!snapshot) {
    return deny(
      "BATCH_DEFINITION_INVALID",
      `Batch definition is invalid: ${batchPath}.`
    );
  }
  if (snapshot.status !== "ACTIVE") {
    return deny(
      "BATCH_NOT_ACTIVE",
      `Batch ${batchId} is ${snapshot.status} and cannot run.`
    );
  }
  if (!snapshot.gateRequired) {
    return deny(
      "GATE_REQUIRED",
      `Batch ${batchId} does not enforce BatchPlane Gate.`
    );
  }
  if (request.workflowRef && snapshot.workflowRef) {
    const requestRef = request.workflowRef.trim();
    const registeredRef = snapshot.workflowRef.trim();
    if (requestRef && registeredRef && requestRef !== registeredRef) {
      return deny(
        "REF_NOT_ALLOWED",
        `Workflow ref ${requestRef} is not allowed for batch ${batchId}; expected ${registeredRef}.`
      );
    }
  }
  if (request.workflowPath && snapshot.workflowPath) {
    const requestPath = request.workflowPath.trim();
    const registeredPath = snapshot.workflowPath.trim();
    if (requestPath && registeredPath && requestPath !== registeredPath) {
      return deny(
        "WORKFLOW_NOT_ALLOWED",
        `Workflow path ${requestPath} is not registered for batch ${batchId}.`
      );
    }
  }
  if (actualWorkflowPath && snapshot.workflowPath !== actualWorkflowPath) {
    return deny(
      "WORKFLOW_NOT_ALLOWED",
      `Running workflow ${actualWorkflowPath} is not registered for batch ${batchId}.`
    );
  }
  if (actualWorkflowRef && snapshot.workflowRef !== actualWorkflowRef) {
    return deny(
      "REF_NOT_ALLOWED",
      `Running workflow ref ${actualWorkflowRef} is not registered for batch ${batchId}.`
    );
  }
  if (request.triggerType === "SCHEDULE") {
    if (!request.scheduleId) {
      return deny(
        "SCHEDULE_NOT_MAPPED",
        "Scheduled execution request does not contain a schedule identifier."
      );
    }
    if (!snapshot.enabledScheduleIds.includes(request.scheduleId)) {
      return deny(
        "SCHEDULE_NOT_REGISTERED",
        `Schedule ${request.scheduleId} is not enabled in batch ${batchId}.`
      );
    }
    if (eventSchedule?.trim() && snapshot.enabledScheduleCronById.get(request.scheduleId) !== eventSchedule.trim()) {
      return deny(
        "NATIVE_SCHEDULE_CRON_MISMATCH",
        "Native GitHub schedule expression does not match the registered schedule."
      );
    }
  }
  if (!effectiveRef) {
    return deny(
      "REQUEST_EVIDENCE_MISMATCH",
      `Workflow ref information is missing for batch ${batchId} validation.`
    );
  }
  if (repository.owner.trim() === "") {
    return deny("UNKNOWN", "Repository owner is required for team validation.");
  }
  return { message: "Batch policy evidence is verified.", result: "ALLOW" };
}
async function readWorkspaceApprovalMode({
  client,
  configPath,
  ref
}) {
  const effectiveRef = ref?.trim();
  if (!effectiveRef) {
    return "SELF_APPROVAL_BLOCKED";
  }
  const workspacePolicyPath2 = `${configPath.replace(/\/+$/u, "")}/workspace.yml`;
  const workspacePolicyFile = await client.getFile(
    workspacePolicyPath2,
    effectiveRef
  );
  if (!workspacePolicyFile) {
    return "SELF_APPROVAL_BLOCKED";
  }
  const parsed = parseYamlDocument2(workspacePolicyFile.content);
  if (!parsed.ok) {
    throw new Error(
      `Workspace policy YAML is invalid: ${workspacePolicyPath2}.`
    );
  }
  const validated = validateWorkspacePolicyFile2(parsed.value);
  if (!validated.ok) {
    throw new Error(`Workspace policy is invalid: ${workspacePolicyPath2}.`);
  }
  return validated.value.spec.approval.mode;
}
function validateScheduleMapping({
  request,
  scheduleId
}) {
  if (!scheduleId) {
    return { message: "Schedule mapping is not required.", result: "ALLOW" };
  }
  if (!request.scheduleId || request.scheduleId !== scheduleId) {
    return deny(
      "SCHEDULE_NOT_MAPPED",
      `Schedule ${scheduleId} is not mapped to this execution request.`
    );
  }
  return { message: "Schedule mapping is verified.", result: "ALLOW" };
}
async function verifyApproverAuthorization({
  allowMissingRoleMapping,
  approver,
  client,
  configPath,
  ref,
  repository
}) {
  const effectiveRef = ref?.trim();
  if (!effectiveRef) {
    return {
      allowed: false,
      message: "Workflow ref is required for approver authorization."
    };
  }
  const roleMappingPath2 = `${configPath.replace(/\/+$/u, "")}/policies/role-mapping.yml`;
  const roleMappingFile = await client.getFile(roleMappingPath2, effectiveRef);
  if (!roleMappingFile) {
    if (allowMissingRoleMapping) {
      return { allowed: true };
    }
    return {
      allowed: false,
      message: `Role mapping file was not found: ${roleMappingPath2}.`
    };
  }
  const selector = parseApproverSelectorFromRoleMappingFile(
    roleMappingFile.content
  );
  if (!selector) {
    return {
      allowed: false,
      message: `Role mapping file is invalid: ${roleMappingPath2}.`
    };
  }
  const normalizedApprover = approver.trim().toLowerCase();
  if (selector.githubUsers.length > 0) {
    const hasUserMatch = selector.githubUsers.map((value) => value.toLowerCase()).includes(normalizedApprover);
    if (hasUserMatch) {
      return { allowed: true };
    }
  }
  if (selector.repositoryRoles.length > 0) {
    const permission = await client.getRepositoryPermissionForUser(approver);
    const normalizedRoles = selector.repositoryRoles.map(
      (value) => value.toLowerCase()
    );
    const actualRole = permission.roleName?.toLowerCase() ?? "";
    const fallbackRole = permission.permission.toLowerCase();
    if (normalizedRoles.includes(actualRole) || normalizedRoles.includes(fallbackRole)) {
      return { allowed: true };
    }
  }
  if (selector.githubTeams.length > 0) {
    for (const teamSlug of selector.githubTeams) {
      const membership = await client.getTeamMembershipForUser({
        org: repository.owner,
        teamSlug,
        username: approver
      });
      if (membership?.state === "active") {
        return { allowed: true };
      }
    }
  }
  return { allowed: false };
}
function createGateGitHubClient({
  apiBaseUrl,
  fetcher,
  owner,
  repo,
  token
}) {
  async function request(path, options = {}) {
    const response = await fetcher(`${apiBaseUrl.replace(/\/+$/, "")}${path}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28"
      }
    });
    if (response.status === 404 && options.allowNotFound) {
      return null;
    }
    if (!response.ok) {
      throw new Error(
        `GitHub API request failed: ${response.status} ${await response.text()}`
      );
    }
    if (response.status === 204) {
      return null;
    }
    return await response.json();
  }
  const repoPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  return {
    async getIssue(issueNumber) {
      const issue = await request(
        `${repoPath}/issues/${issueNumber}`,
        { allowNotFound: true }
      );
      if (!issue || issue.pull_request) return null;
      return { body: issue.body ?? "", number: issue.number };
    },
    async findExecutionRequestIssue(requestId) {
      for (let page = 1; page <= 5; page += 1) {
        const issues = await request(
          `${repoPath}/issues?state=all&per_page=100&page=${page}`
        );
        if (!issues?.length) {
          return null;
        }
        const issue = issues.find((candidate) => {
          if (candidate.pull_request) {
            return false;
          }
          const request2 = parseExecutionRequestEvidence(candidate.body ?? "");
          return request2?.requestId === requestId;
        });
        if (issue) {
          return {
            body: issue.body ?? "",
            number: issue.number
          };
        }
      }
      return null;
    },
    async listIssueComments(issueNumber) {
      const comments = [];
      for (let page = 1; page <= 5; page += 1) {
        const response = await request(
          `${repoPath}/issues/${issueNumber}/comments?per_page=100&page=${page}`
        );
        if (!response?.length) {
          break;
        }
        comments.push(
          ...response.map((comment) => ({
            author: comment.user?.login?.trim() ?? "",
            body: comment.body ?? "",
            createdAt: comment.created_at ?? "",
            updatedAt: comment.updated_at ?? ""
          }))
        );
      }
      return comments;
    },
    async getFile(path, ref) {
      const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
      const response = await request(
        `${repoPath}/contents/${encodePath2(path)}${query}`,
        { allowNotFound: true }
      );
      if (!response) {
        return null;
      }
      if (response.encoding !== "base64" || !response.content) {
        throw new Error(`Unsupported GitHub file encoding for ${path}.`);
      }
      return {
        content: decodeBase642(response.content),
        path: response.path ?? path
      };
    },
    async getRepositoryPermissionForUser(username) {
      const response = await request(
        `${repoPath}/collaborators/${encodeURIComponent(username)}/permission`,
        { allowNotFound: true }
      );
      if (!response) {
        return {
          permission: "none",
          roleName: "none",
          username
        };
      }
      return {
        permission: normalizePermissionValue(response.permission) ?? normalizePermissionValue(response.role_name) ?? "none",
        roleName: normalizePermissionValue(response.role_name) ?? normalizePermissionValue(response.permission) ?? "none",
        username: response.user?.login?.trim() || username
      };
    },
    async getTeamMembershipForUser({
      org,
      teamSlug,
      username
    }) {
      const response = await request(
        `/orgs/${encodeURIComponent(org)}/teams/${encodeURIComponent(
          teamSlug
        )}/memberships/${encodeURIComponent(username)}`,
        { allowNotFound: true }
      );
      if (!response) {
        return null;
      }
      return {
        role: response.role ?? "",
        state: response.state ?? ""
      };
    }
  };
}
function parseRepository(repository) {
  const [owner, repo] = repository.split("/");
  if (!owner || !repo) {
    throw new Error("GITHUB_REPOSITORY must be in owner/repo form.");
  }
  return { owner, repo };
}
function parseExecutionRequestEvidence(issueBody) {
  const marker = parseBatchPlaneMarker(issueBody, "execution-request");
  const requestId = marker.get("requestId") ?? readMarkdownField(issueBody, "Request ID");
  const batchId = marker.get("batchId") ?? readMarkdownField(issueBody, "Batch ID");
  const requestDigest = marker.get("requestDigest") ?? readMarkdownField(issueBody, "Request digest");
  const status = marker.get("status") ?? readMarkdownField(issueBody, "Status");
  const payload = parseCanonicalPayload(issueBody);
  const approvedBatchRevision = readApprovedBatchRevision(payload);
  const workflow = readWorkflowTarget(payload);
  const requestedBy = readMarkdownField(issueBody, "Requested by").replace(/^@/, "") || readRequestedBy(payload);
  const scheduleId = readScheduleId(payload);
  const schedule = readNativeScheduleOccurrence(payload);
  const triggerType = readTriggerType(payload);
  if (!requestId || !batchId || !requestDigest || !status || !approvedBatchRevision) {
    return null;
  }
  return {
    approvedBatchRevision,
    batchId,
    ...scheduleId ? { scheduleId } : {},
    ...schedule ? { schedule } : {},
    requestedBy,
    requestDigest,
    requestId,
    ...triggerType ? { triggerType } : {},
    status,
    workflowPath: workflow.path,
    workflowRef: workflow.ref
  };
}
function readApprovedBatchRevision(payload) {
  if (!payload || typeof payload !== "object") return null;
  const spec = payload.spec;
  if (!spec || typeof spec !== "object") return null;
  const revision = spec.approvedBatchRevision;
  if (!revision || typeof revision !== "object") return null;
  const governedChangeId = revision.governedChangeId;
  const targetRevisionDigest = revision.targetRevisionDigest;
  return typeof governedChangeId === "string" && typeof targetRevisionDigest === "string" && governedChangeId.trim() && targetRevisionDigest.startsWith("sha256:") ? { governedChangeId, targetRevisionDigest } : null;
}
function parseExecutionApprovalEvidence(comment) {
  const commentBody = comment.body;
  if (!commentBody.startsWith("/bgcp approve ")) {
    return null;
  }
  const command = parseApprovalCommand(commentBody);
  const marker = parseBatchPlaneMarker(commentBody, "execution-approval");
  const decision = marker.get("decision");
  const requestId = marker.get("requestId") ?? readMarkdownField(commentBody, "Request ID");
  const batchId = marker.get("batchId") ?? readMarkdownField(commentBody, "Batch ID");
  const requestDigest = marker.get("requestDigest") ?? readMarkdownField(commentBody, "Request digest");
  const approvalType = marker.get("approvalType") ?? readMarkdownField(commentBody, "Approval type");
  if (decision !== "APPROVED" || !requestId || !batchId || !requestDigest) {
    return null;
  }
  return {
    ...approvalType ? { approvalType } : {},
    approver: comment.author || readMarkdownField(commentBody, "Approver").replace(/^@/, ""),
    batchId,
    commandDigest: command?.digest ?? null,
    edited: isEditedComment(comment),
    requestDigest,
    requestId
  };
}
function parseBatchDefinitionSnapshot(content) {
  const parsed = parseYamlDocument2(content);
  if (!parsed.ok) {
    return null;
  }
  const validated = validateBatchDefinitionFile2(parsed.value);
  if (!validated.ok) {
    return null;
  }
  const value = validated.value;
  return {
    enabledScheduleIds: value.spec.schedules?.filter((schedule) => schedule.enabled).map((schedule) => schedule.id) ?? [],
    enabledScheduleCronById: new Map(
      (value.spec.schedules ?? []).filter((schedule) => schedule.enabled).map((schedule) => [schedule.id, schedule.cron])
    ),
    gateRequired: value.spec.gateRequired,
    status: value.spec.status,
    workflowPath: value.spec.workflow.path,
    workflowRef: value.spec.workflow.ref
  };
}
function parseApproverSelectorFromRoleMappingFile(content) {
  const parsed = parseYamlDocument2(content);
  if (!parsed.ok) {
    return null;
  }
  const validated = validateRoleMappingFile2(parsed.value);
  if (!validated.ok) {
    return null;
  }
  const approver = validated.value.spec.roles.approver;
  return {
    githubTeams: approver.githubTeams ?? [],
    githubUsers: approver.githubUsers ?? [],
    repositoryRoles: approver.repositoryRoles ?? []
  };
}
function parseCanonicalPayload(issueBody) {
  const match = issueBody.match(/```json\s*([\s\S]*?)```/);
  if (!match?.[1]) {
    return null;
  }
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}
function readWorkflowTarget(payload) {
  if (!payload || typeof payload !== "object") {
    return { path: "", ref: "" };
  }
  const spec = payload.spec;
  if (!spec || typeof spec !== "object") {
    return { path: "", ref: "" };
  }
  const workflow = spec.workflow;
  if (!workflow || typeof workflow !== "object") {
    return { path: "", ref: "" };
  }
  const path = workflow.path;
  const ref = workflow.ref;
  return {
    path: typeof path === "string" ? path : "",
    ref: typeof ref === "string" ? ref : ""
  };
}
function readRequestedBy(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  const spec = payload.spec;
  if (!spec || typeof spec !== "object") {
    return "";
  }
  const requestedBy = spec.requestedBy;
  return typeof requestedBy === "string" ? requestedBy : "";
}
function readScheduleId(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  const spec = payload.spec;
  if (!spec || typeof spec !== "object") {
    return "";
  }
  const schedule = spec.schedule;
  if (!schedule || typeof schedule !== "object") {
    return "";
  }
  const scheduleId = schedule.scheduleId;
  return typeof scheduleId === "string" ? scheduleId : "";
}
function readNativeScheduleOccurrence(payload) {
  if (!payload || typeof payload !== "object") return void 0;
  const spec = payload.spec;
  if (!spec || typeof spec !== "object") return void 0;
  const schedule = spec.schedule;
  if (!schedule || typeof schedule !== "object") return void 0;
  const value = schedule;
  return typeof value.repositoryId === "string" && typeof value.sourceRunId === "string" && Number.isInteger(value.sourceRunAttempt) ? {
    repositoryId: value.repositoryId,
    sourceRunAttempt: value.sourceRunAttempt,
    sourceRunId: value.sourceRunId
  } : void 0;
}
function readTriggerType(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  const spec = payload.spec;
  if (!spec || typeof spec !== "object") {
    return "";
  }
  const triggerType = spec.triggerType;
  return typeof triggerType === "string" ? triggerType : "";
}
function parseApprovalCommand(body) {
  const firstLine = body.split("\n", 1)[0]?.trim();
  const match = firstLine?.match(/^\/bgcp approve\s+requestDigest=(\S+)$/u);
  if (!match?.[1]) {
    return null;
  }
  return { digest: match[1] };
}
function isEditedComment(comment) {
  if (!comment.createdAt || !comment.updatedAt) {
    return false;
  }
  return comment.createdAt !== comment.updatedAt;
}
function encodePath2(path) {
  return path.split("/").map((part) => encodeURIComponent(part)).join("/");
}
function decodeBase642(value) {
  return Buffer.from(value.replace(/\s/g, ""), "base64").toString("utf-8");
}
function normalizePermissionValue(value) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return "";
  }
  return normalized;
}
function writeGateOutputs(result, env) {
  const outputPath = env.GITHUB_OUTPUT;
  if (!outputPath) {
    return;
  }
  appendFileSync(
    outputPath,
    [
      `result=${result.result}`,
      `reason_code=${result.reasonCode ?? ""}`,
      `message=${escapeOutputValue(result.message)}`,
      `verified_sha=${result.verifiedSha ?? ""}`
    ].join("\n") + "\n",
    "utf8"
  );
}
function writeGateSummary(result, input, env) {
  const summaryPath = env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) {
    return;
  }
  const lines = [
    "## BatchPlane Gate Result",
    "",
    `- Result: ${result.result}`,
    `- Reason code: ${result.reasonCode ?? "N/A"}`,
    `- Message: ${result.message}`,
    `- Batch ID: ${input.batchId}`,
    `- Request ID: ${input.requestId ?? ""}`,
    `- Approval source: ${input.approvalSource ?? ""}`,
    `- Approval ref: ${input.approvalRef ?? ""}`
  ];
  appendFileSync(summaryPath, `${lines.join("\n")}
`, "utf8");
}
function writeGateLogRecord(result, input, env) {
  const runId = env.GITHUB_RUN_ID?.trim();
  const repository = input.repository?.trim();
  const job = env.GITHUB_JOB?.trim();
  if (!runId || !repository || !job) {
    return;
  }
  console.log(
    `BATCHPLANE_GATE_RESULT ${JSON.stringify({
      gateJob: job,
      gateJobName: input.gateJobName ?? "BatchPlane Gate",
      gateStep: input.gateStepName ?? "Verify approved execution evidence",
      message: result.message,
      repository,
      result: result.result,
      runAttempt: input.runAttempt ?? 0,
      runId,
      version: 1,
      ...input.batchId ? { batchId: input.batchId } : {},
      ...input.requestDigest ? { requestDigest: input.requestDigest } : {},
      ...input.requestId ? { requestId: input.requestId } : {},
      ...input.scheduleId ? { scheduleId: input.scheduleId } : {},
      ...result.reasonCode ? { reasonCode: result.reasonCode } : {}
    })}`
  );
}
function escapeOutputValue(value) {
  return value.replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}
function parseBatchPlaneMarker(body, kind) {
  const marker = /* @__PURE__ */ new Map();
  const match = body.match(
    new RegExp(`<!--\\s*batch(?:plane|trail):${kind}\\s*([\\s\\S]*?)-->`)
  );
  if (!match?.[1]) {
    return marker;
  }
  for (const line of match[1].split("\n")) {
    const separatorIndex = line.indexOf("=");
    if (separatorIndex < 0) {
      continue;
    }
    marker.set(
      line.slice(0, separatorIndex).trim(),
      line.slice(separatorIndex + 1).trim()
    );
  }
  return marker;
}
function readMarkdownField(body, label) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = body.match(new RegExp(`- ${escapedLabel}:\\s*(.+)`));
  const value = match?.[1]?.trim() ?? "";
  return value.replace(/^`|`$/g, "").trim();
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runGateFromEnv();
}
export {
  readGateInputFromEnv,
  runGateFromEnv,
  verifyLiteAuthorization,
  verifyLiteInput
};
