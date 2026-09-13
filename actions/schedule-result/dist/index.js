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

// ../../packages/github-lite/src/batch-definition-codec.ts
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

// ../../packages/github-lite/src/github-workflow.ts
function getNativeScheduleWorkflowJobIdentity(schedule) {
  const controlJobId = toScheduleWorkflowJobId(schedule.scheduleId);
  return {
    businessJobId: `run-${controlJobId}`,
    businessJobName: `Run [${schedule.scheduleId}]`,
    controlJobId,
    controlJobName: `Schedule [${schedule.scheduleId}]`
  };
}
function toScheduleWorkflowJobId(scheduleId) {
  const encoded = Array.from(scheduleId).map((character) => character.codePointAt(0).toString(16)).join("_");
  return `schedule_${encoded}`;
}

// ../../packages/github-lite/src/execution-gate-result.ts
function parseExecutionGateResult({
  content,
  expected
}) {
  const records = [];
  for (const line of content.split("\n")) {
    const timestamp = parseLogTimestamp(line);
    if (!timestamp || !isWithinGateStep(timestamp, expected.gateStep)) {
      continue;
    }
    const parsed = parseGateResultRecord(line);
    if (!parsed.found) {
      continue;
    }
    if (!parsed.record) {
      return void 0;
    }
    records.push(parsed.record);
  }
  if (records.length !== 1) {
    return void 0;
  }
  const record = records[0];
  if (record.repository.toLowerCase() !== expected.repository.toLowerCase() || record.runId !== String(expected.runId) || record.runAttempt !== expected.runAttempt || record.gateJobName !== expected.gateJobName || expected.gateJob !== void 0 && record.gateJob !== expected.gateJob || record.gateStep !== expected.gateStep.name || expected.occurrence !== void 0 && !matchesExpectedOccurrence(record, expected.occurrence)) {
    return void 0;
  }
  return {
    allowed: record.result === "ALLOW",
    ...record.batchId ? { batchId: record.batchId } : {},
    message: record.message,
    ...record.reasonCode ? { reasonCode: record.reasonCode } : {},
    ...record.requestDigest ? { requestDigest: record.requestDigest } : {},
    ...record.requestId ? { requestId: record.requestId } : {},
    ...record.scheduleId ? { scheduleId: record.scheduleId } : {}
  };
}
function matchesExpectedOccurrence(record, occurrence) {
  if (record.batchId !== occurrence.batchId || record.scheduleId !== occurrence.scheduleId) {
    return false;
  }
  if (record.requestDigest === occurrence.requestDigest && record.requestId === occurrence.requestId) {
    return true;
  }
  return record.result === "DENY" && record.requestDigest === void 0 && record.requestId === void 0;
}
function parseLogTimestamp(line) {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)(?:\s|$)/u.exec(line);
  if (!match) {
    return void 0;
  }
  const value = Date.parse(match[1]);
  return Number.isNaN(value) ? void 0 : value;
}
function isWithinGateStep(timestamp, step) {
  const startedAt = step.startedAt ? Date.parse(step.startedAt) : Number.NaN;
  const completedAt = step.completedAt ? Date.parse(step.completedAt) : Number.NaN;
  const nextStepStartedAt = step.nextStepStartedAt ? Date.parse(step.nextStepStartedAt) : Number.NaN;
  const completedAtInclusive = completedAt + 999;
  const observedEnd = Number.isNaN(nextStepStartedAt) ? completedAtInclusive : Math.min(completedAtInclusive, nextStepStartedAt - 1);
  return !Number.isNaN(startedAt) && !Number.isNaN(completedAt) && timestamp >= startedAt && timestamp <= observedEnd;
}
function parseGateResultRecord(line) {
  const marker = "BATCHPLANE_GATE_RESULT ";
  const markerIndex = line.indexOf(marker);
  if (markerIndex < 0) {
    return { found: false };
  }
  const serialized = line.slice(markerIndex + marker.length).trim();
  try {
    const value = JSON.parse(serialized);
    return isGateResultRecord(value) ? { found: true, record: value } : { found: true };
  } catch {
    return { found: true };
  }
}
function isGateResultRecord(value) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value;
  return record.version === 1 && typeof record.repository === "string" && typeof record.runId === "string" && Number.isInteger(record.runAttempt) && typeof record.gateJob === "string" && typeof record.gateJobName === "string" && typeof record.gateStep === "string" && (record.result === "ALLOW" || record.result === "DENY") && typeof record.message === "string" && (record.reasonCode === void 0 || typeof record.reasonCode === "string") && (record.batchId === void 0 || typeof record.batchId === "string") && (record.requestDigest === void 0 || typeof record.requestDigest === "string") && (record.requestId === void 0 || typeof record.requestId === "string") && (record.scheduleId === void 0 || typeof record.scheduleId === "string");
}

// ../../packages/github-lite/src/native-schedule-evidence.ts
async function inspectNativeScheduleExecution({
  client,
  expectedOccurrence,
  expectedRepositoryId,
  expectedWorkflowPath,
  repository,
  runAttempt,
  runId,
  schedule
}) {
  const evidence = await collectNativeScheduleEvidence({
    client,
    expectedOccurrence,
    expectedRepositoryId,
    expectedWorkflowPath,
    repository,
    runAttempt,
    runId,
    schedule
  });
  return {
    ...evidence.businessJob ? { businessJob: evidence.businessJob } : {},
    ...evidence.controlGate ? { controlGate: evidence.controlGate } : {},
    ...evidence.controlJob ? { controlJob: evidence.controlJob } : {},
    ...evidence.entryGate ? { entryGate: evidence.entryGate } : {},
    run: evidence.run,
    ...classifyNativeScheduleEvidence(evidence)
  };
}
async function collectNativeScheduleEvidence({
  client,
  expectedOccurrence,
  expectedRepositoryId,
  expectedWorkflowPath,
  repository,
  runAttempt,
  runId,
  schedule
}) {
  const { businessJobId, businessJobName, controlJobId, controlJobName } = getNativeScheduleWorkflowJobIdentity(schedule);
  const run2 = await client.getWorkflowRun({ ...repository, runAttempt, runId });
  if (!run2) {
    throw new Error("NATIVE_SCHEDULE_RUN_NOT_FOUND");
  }
  const runContextMatches = run2.event === "schedule" && run2.id === runId && run2.runAttempt === runAttempt && run2.repositoryId === expectedRepositoryId && run2.workflowPath === expectedWorkflowPath;
  if (!runContextMatches) {
    return { run: run2, runContextMatches: false };
  }
  const jobs = await client.listWorkflowRunJobs({
    ...repository,
    runAttempt,
    runId
  });
  const control = uniqueJob(jobs, controlJobName);
  const business = uniqueJob(jobs, businessJobName);
  const controlGate = control ? await readGateResult({
    client,
    expectedJobId: controlJobId,
    expectedJobName: controlJobName,
    expectedOccurrence,
    expectedStepName: "Verify approved native schedule evidence",
    job: control,
    repository,
    run: run2
  }) : void 0;
  const controlJob = control ? toJobObservation(control) : void 0;
  if (!business) {
    return { control, controlGate, controlJob, run: run2, runContextMatches: true };
  }
  const entryGate = await readGateResult({
    client,
    expectedJobId: businessJobId,
    expectedJobName: businessJobName,
    expectedOccurrence,
    expectedStepName: "Reverify approved native schedule evidence",
    job: business,
    repository,
    run: run2
  });
  return {
    business,
    businessJob: toJobObservation(business),
    control,
    controlGate,
    controlJob,
    entryGate,
    run: run2,
    runContextMatches: true
  };
}
function classifyNativeScheduleEvidence(evidence) {
  const { business, control, controlGate, entryGate, run: run2, runContextMatches } = evidence;
  if (!runContextMatches) {
    return { observation: "UNCONFIRMED", reason: "RUN_CONTEXT_MISMATCH" };
  }
  if (controlGate?.allowed === false || entryGate?.allowed === false) {
    return { observation: "BLOCKED" };
  }
  if (!business) {
    return {
      observation: "UNCONFIRMED",
      reason: "BUSINESS_JOB_IDENTITY_UNCONFIRMED"
    };
  }
  if (!control) {
    return {
      observation: "UNCONFIRMED",
      reason: "CONTROL_JOB_IDENTITY_UNCONFIRMED"
    };
  }
  const businessStep = business.steps?.find(
    (step) => step.name === "Run batch"
  );
  if (business.conclusion === "cancelled" || businessStep?.conclusion === "cancelled") {
    return { observation: "CANCELED" };
  }
  if (!controlGate?.allowed || !entryGate?.allowed) {
    return {
      observation: "UNCONFIRMED",
      reason: "GATE_EVIDENCE_UNCONFIRMED"
    };
  }
  if (businessStep?.conclusion === "success") {
    return { observation: "SUCCEEDED" };
  }
  if (businessStep?.conclusion === "failure" || businessStep?.conclusion === "timed_out" || businessStep?.conclusion === "action_required") {
    return { observation: "FAILED" };
  }
  if (run2.conclusion === "cancelled") {
    return { observation: "CANCELED" };
  }
  return {
    observation: "UNCONFIRMED",
    reason: "BUSINESS_TERMINAL_EVIDENCE_UNCONFIRMED"
  };
}
function toJobObservation(job) {
  const businessStep = job.steps?.find((step) => step.name === "Run batch");
  return {
    conclusion: job.conclusion,
    jobId: job.id,
    name: job.name,
    ...businessStep ? { runStepConclusion: businessStep.conclusion } : {},
    status: job.status
  };
}
function uniqueJob(jobs, name) {
  const matches = jobs.filter((job) => job.name === name);
  return matches.length === 1 ? matches[0] : void 0;
}
async function readGateResult({
  client,
  expectedJobId,
  expectedJobName,
  expectedOccurrence,
  expectedStepName,
  job,
  repository,
  run: run2
}) {
  const step = job.steps?.find(
    (candidate) => candidate.name === expectedStepName
  );
  if (!step) return void 0;
  try {
    const log = await client.getWorkflowJobLog({
      ...repository,
      jobId: job.id
    });
    return parseExecutionGateResult({
      content: log.content,
      expected: {
        gateJob: expectedJobId,
        gateJobName: expectedJobName,
        gateStep: {
          ...step,
          nextStepStartedAt: job.steps?.find(
            (candidate) => candidate.number > step.number && candidate.name !== "Complete job"
          )?.startedAt
        },
        occurrence: expectedOccurrence,
        repository: `${repository.owner}/${repository.repo}`,
        runAttempt: run2.runAttempt,
        runId: run2.id
      }
    });
  } catch {
    return void 0;
  }
}
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
import { pathToFileURL } from "node:url";
async function recordNativeScheduleResult(input) {
  assertContext(input);
  const repository = parseRepository(input.repository);
  const issueNumber = parseIssueNumber(input.issueNumber);
  const client = createGitHubLiteClient({
    apiBaseUrl: input.apiBaseUrl ?? "https://api.github.com",
    fetcher: input.fetcher ?? fetch,
    token: input.githubToken
  });
  const [issue, batchFile] = await Promise.all([
    client.getIssue({ ...repository, issueNumber }),
    client.getFile({
      ...repository,
      path: input.definitionPath,
      ref: input.workflowSha
    })
  ]);
  if (!issue || !batchFile)
    throw new Error("NATIVE_SCHEDULE_REQUEST_EVIDENCE_UNAVAILABLE");
  let batch;
  try {
    batch = parseBatchDefinitionYaml(batchFile.content);
  } catch {
    throw new Error("NATIVE_SCHEDULE_BATCH_SNAPSHOT_INVALID");
  }
  if (batch.batchId !== input.batchId || batch.workflow.path !== input.workflowPath) {
    throw new Error("NATIVE_SCHEDULE_WORKFLOW_MISMATCH");
  }
  const schedule = (batch.schedules ?? []).find(
    (candidate) => candidate.scheduleId === input.scheduleId
  );
  if (!schedule) throw new Error("NATIVE_SCHEDULE_SNAPSHOT_MISMATCH");
  const approvedRevision = readRequestApprovedBatchRevision(issue.body);
  const request = await verifyNativeScheduleRequestIssue(issue.body, {
    approvedBatchRevision: approvedRevision,
    batch,
    occurrence: {
      definitionCommitSha: input.workflowSha,
      definitionPath: input.definitionPath,
      repositoryId: input.repositoryId,
      scheduleId: input.scheduleId,
      // A native request represents its first occurrence. A later rerun is
      // evidence about that same occurrence, not a new authorized request.
      sourceRunAttempt: 1,
      sourceRunId: input.sourceRunId
    },
    requestDigest: input.requestDigest,
    requestId: input.requestId
  });
  if (!request) throw new Error("NATIVE_SCHEDULE_REQUEST_UNVERIFIED");
  let proof;
  try {
    proof = await inspectNativeScheduleExecution({
      client,
      expectedOccurrence: {
        batchId: input.batchId,
        requestDigest: request.requestDigest,
        requestId: request.requestId,
        scheduleId: input.scheduleId
      },
      expectedRepositoryId: input.repositoryId,
      expectedWorkflowPath: input.workflowPath,
      repository,
      runAttempt: input.sourceRunAttempt,
      runId: Number(input.sourceRunId),
      schedule
    });
  } catch (error) {
    proof = {
      observation: "UNCONFIRMED",
      reason: `ACTIONS_API_UNAVAILABLE:${toErrorMessage(error)}`
    };
  }
  const acknowledgement = await client.createIssueComment({
    ...repository,
    body: buildResultBody(input, proof),
    issueNumber
  });
  if (!Number.isInteger(acknowledgement.id) || acknowledgement.id < 1) {
    throw new Error("RESULT_EVIDENCE_WRITE_UNACKNOWLEDGED");
  }
  return proof.observation;
}
function readScheduleResultInputFromEnv(env = process.env) {
  return {
    apiBaseUrl: env.GITHUB_API_URL,
    batchId: readActionInput(env, "batch-id"),
    businessJobId: readActionInput(env, "business-job-id"),
    businessJobName: readActionInput(env, "business-job-name"),
    businessResultHint: readActionInput(env, "business-result"),
    controlJobId: readActionInput(env, "control-job-id"),
    controlJobName: readActionInput(env, "control-job-name"),
    controlResultHint: readActionInput(env, "control-result"),
    definitionPath: readActionInput(env, "definition-path"),
    eventName: env.GITHUB_EVENT_NAME ?? "",
    githubToken: readActionInput(env, "github-token") || env.GITHUB_TOKEN || "",
    issueNumber: readActionInput(env, "issue-number"),
    repository: env.GITHUB_REPOSITORY ?? "",
    repositoryId: env.GITHUB_REPOSITORY_ID ?? "",
    requestDigest: readActionInput(env, "request-digest"),
    requestId: readActionInput(env, "request-id"),
    scheduleId: readActionInput(env, "schedule-id"),
    sourceRunAttempt: Number.parseInt(env.GITHUB_RUN_ATTEMPT ?? "", 10),
    sourceRunId: env.GITHUB_RUN_ID ?? "",
    workflowPath: readWorkflowPath(env.GITHUB_WORKFLOW_REF ?? ""),
    workflowSha: env.GITHUB_WORKFLOW_SHA ?? ""
  };
}
async function run(env = process.env) {
  return recordNativeScheduleResult(readScheduleResultInputFromEnv(env));
}
function assertContext(input) {
  if (input.eventName !== "schedule" || !input.batchId || !input.scheduleId || !input.repositoryId || !isPositiveIntegerString(input.sourceRunId) || !Number.isInteger(input.sourceRunAttempt) || input.sourceRunAttempt < 1 || !input.requestId || !input.requestDigest.startsWith("sha256:") || !input.workflowPath || !input.workflowSha || !input.businessJobId || !input.businessJobName || !input.controlJobId || !input.controlJobName || !input.definitionPath) {
    throw new Error("NATIVE_SCHEDULE_RESULT_CONTEXT_REQUIRED");
  }
}
function isPositiveIntegerString(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0;
}
function readRequestApprovedBatchRevision(body) {
  const match = body.match(
    /### Canonical payload\s*```json\s*([\s\S]*?)\s*```/u
  );
  if (!match?.[1]) throw new Error("NATIVE_SCHEDULE_REQUEST_UNVERIFIED");
  try {
    const payload = JSON.parse(match[1]);
    const revision = payload.spec?.approvedBatchRevision;
    if (typeof revision?.governedChangeId !== "string" || typeof revision.targetRevisionDigest !== "string") {
      throw new Error("NATIVE_SCHEDULE_REQUEST_UNVERIFIED");
    }
    return revision;
  } catch (error) {
    throw error instanceof Error ? error : new Error("NATIVE_SCHEDULE_REQUEST_UNVERIFIED");
  }
}
function buildResultBody(input, proof) {
  return [
    "## BatchPlane Native Schedule Result",
    "",
    `- Observation: ${proof.observation}`,
    `- Source Run: \`${input.sourceRunId}\``,
    `- Run attempt: ${input.sourceRunAttempt}`,
    "",
    "<!-- batchplane:schedule-result",
    `requestId=${input.requestId}`,
    `requestDigest=${input.requestDigest}`,
    `batchId=${input.batchId}`,
    `scheduleId=${input.scheduleId}`,
    `repositoryId=${input.repositoryId}`,
    `sourceRunId=${input.sourceRunId}`,
    "requestSourceRunAttempt=1",
    `controlJobId=${input.controlJobId}`,
    `controlJobName=${input.controlJobName}`,
    `businessJobId=${input.businessJobId}`,
    `businessJobName=${input.businessJobName}`,
    `workflowRunId=${proof.run?.id ?? ""}`,
    `workflowRunAttempt=${proof.run?.runAttempt ?? ""}`,
    `controlApiJobId=${proof.controlJob?.jobId ?? ""}`,
    `controlJobConclusion=${proof.controlJob?.conclusion ?? ""}`,
    `businessApiJobId=${proof.businessJob?.jobId ?? ""}`,
    `controlGateAllowed=${proof.controlGate?.allowed ?? ""}`,
    `controlGateReason=${proof.controlGate?.reasonCode ?? ""}`,
    `entryGateAllowed=${proof.entryGate?.allowed ?? ""}`,
    `entryGateReason=${proof.entryGate?.reasonCode ?? ""}`,
    `businessStepConclusion=${proof.businessJob?.runStepConclusion ?? ""}`,
    `businessJobConclusion=${proof.businessJob?.conclusion ?? ""}`,
    `observation=${proof.observation}`,
    `unconfirmedReason=${proof.reason ?? ""}`,
    `controlResultHint=${input.controlResultHint}`,
    `businessResultHint=${input.businessResultHint}`,
    "-->"
  ].join("\n");
}
function parseIssueNumber(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1)
    throw new Error("NATIVE_SCHEDULE_ISSUE_MISMATCH");
  return number;
}
function readActionInput(env, name) {
  const key = `INPUT_${name.toUpperCase()}`;
  return (env[key] ?? env[key.replaceAll("-", "_")] ?? "").trim();
}
function readWorkflowPath(workflowRef) {
  const marker = "/.github/workflows/";
  const start = workflowRef.indexOf(marker);
  const end = workflowRef.lastIndexOf("@");
  return start >= 0 && end > start ? workflowRef.slice(start + 1, end) : "";
}
function parseRepository(repository) {
  const [owner = "", repo = "", ...rest] = repository.split("/");
  if (!owner || !repo || rest.length > 0)
    throw new Error("GITHUB_REPOSITORY_REQUIRED");
  return { owner, repo };
}
function toErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run();
}
export {
  readScheduleResultInputFromEnv,
  recordNativeScheduleResult,
  run
};
