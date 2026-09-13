export type ExecutionGateResult = {
  allowed: boolean;
  batchId?: string;
  message: string;
  reasonCode?: string;
  requestDigest?: string;
  requestId?: string;
  scheduleId?: string;
};

export type NativeScheduleGateOccurrence = {
  batchId: string;
  requestDigest: string;
  requestId: string;
  scheduleId: string;
};

type GateResultRecord = {
  version: 1;
  repository: string;
  runId: string;
  runAttempt: number;
  gateJob: string;
  gateJobName: string;
  gateStep: string;
  result: "ALLOW" | "DENY";
  batchId?: string;
  reasonCode?: string;
  message: string;
  requestDigest?: string;
  requestId?: string;
  scheduleId?: string;
};

export function parseExecutionGateResult({
  content,
  expected,
}: {
  content: string;
  expected: {
    gateJobName: string;
    gateJob?: string;
    gateStep: {
      completedAt?: string;
      name: string;
      nextStepStartedAt?: string;
      startedAt?: string;
    };
    repository: string;
    runAttempt: number;
    runId: number;
    occurrence?: NativeScheduleGateOccurrence;
  };
}): ExecutionGateResult | undefined {
  const records: GateResultRecord[] = [];

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
      return undefined;
    }

    records.push(parsed.record);
  }

  if (records.length !== 1) {
    return undefined;
  }

  const record = records[0]!;

  if (
    record.repository.toLowerCase() !== expected.repository.toLowerCase() ||
    record.runId !== String(expected.runId) ||
    record.runAttempt !== expected.runAttempt ||
    record.gateJobName !== expected.gateJobName ||
    (expected.gateJob !== undefined && record.gateJob !== expected.gateJob) ||
    record.gateStep !== expected.gateStep.name ||
    (expected.occurrence !== undefined &&
      !matchesExpectedOccurrence(record, expected.occurrence))
  ) {
    return undefined;
  }

  return {
    allowed: record.result === "ALLOW",
    ...(record.batchId ? { batchId: record.batchId } : {}),
    message: record.message,
    ...(record.reasonCode ? { reasonCode: record.reasonCode } : {}),
    ...(record.requestDigest ? { requestDigest: record.requestDigest } : {}),
    ...(record.requestId ? { requestId: record.requestId } : {}),
    ...(record.scheduleId ? { scheduleId: record.scheduleId } : {}),
  };
}

function matchesExpectedOccurrence(
  record: GateResultRecord,
  occurrence: NativeScheduleGateOccurrence,
): boolean {
  if (
    record.batchId !== occurrence.batchId ||
    record.scheduleId !== occurrence.scheduleId
  ) {
    return false;
  }

  if (
    record.requestDigest === occurrence.requestDigest &&
    record.requestId === occurrence.requestId
  ) {
    return true;
  }

  // A rerun controller deliberately clears its request outputs rather than
  // reusing an earlier Issue as a permit. Its Gate DENY remains observable
  // through the actual schedule Run, canonical control job, batch, and
  // schedule identity, but it can never establish an ALLOW.
  return (
    record.result === "DENY" &&
    record.requestDigest === undefined &&
    record.requestId === undefined
  );
}

function parseLogTimestamp(line: string): number | undefined {
  const match =
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)(?:\s|$)/u.exec(line);

  if (!match) {
    return undefined;
  }

  const value = Date.parse(match[1]!);

  return Number.isNaN(value) ? undefined : value;
}

function isWithinGateStep(
  timestamp: number,
  step: {
    completedAt?: string;
    nextStepStartedAt?: string;
    startedAt?: string;
  },
): boolean {
  const startedAt = step.startedAt ? Date.parse(step.startedAt) : Number.NaN;
  const completedAt = step.completedAt
    ? Date.parse(step.completedAt)
    : Number.NaN;
  const nextStepStartedAt = step.nextStepStartedAt
    ? Date.parse(step.nextStepStartedAt)
    : Number.NaN;

  // GitHub reports step boundaries to whole seconds. A result logged during the
  // final reported completion second belongs to this step unless the next
  // observed step has already started.
  const completedAtInclusive = completedAt + 999;
  const observedEnd = Number.isNaN(nextStepStartedAt)
    ? completedAtInclusive
    : Math.min(completedAtInclusive, nextStepStartedAt - 1);

  return (
    !Number.isNaN(startedAt) &&
    !Number.isNaN(completedAt) &&
    timestamp >= startedAt &&
    timestamp <= observedEnd
  );
}

function parseGateResultRecord(line: string): {
  found: boolean;
  record?: GateResultRecord;
} {
  const marker = "BATCHPLANE_GATE_RESULT ";
  const markerIndex = line.indexOf(marker);

  if (markerIndex < 0) {
    return { found: false };
  }

  const serialized = line.slice(markerIndex + marker.length).trim();

  try {
    const value = JSON.parse(serialized) as unknown;

    return isGateResultRecord(value)
      ? { found: true, record: value }
      : { found: true };
  } catch {
    return { found: true };
  }
}

function isGateResultRecord(value: unknown): value is GateResultRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    record.version === 1 &&
    typeof record.repository === "string" &&
    typeof record.runId === "string" &&
    Number.isInteger(record.runAttempt) &&
    typeof record.gateJob === "string" &&
    typeof record.gateJobName === "string" &&
    typeof record.gateStep === "string" &&
    (record.result === "ALLOW" || record.result === "DENY") &&
    typeof record.message === "string" &&
    (record.reasonCode === undefined ||
      typeof record.reasonCode === "string") &&
    (record.batchId === undefined || typeof record.batchId === "string") &&
    (record.requestDigest === undefined ||
      typeof record.requestDigest === "string") &&
    (record.requestId === undefined || typeof record.requestId === "string") &&
    (record.scheduleId === undefined || typeof record.scheduleId === "string")
  );
}
