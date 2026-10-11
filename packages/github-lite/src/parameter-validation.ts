import { canonicalizeExact, type CanonicalValue } from "@batchplane/digest";
import { validateParameterNames } from "@batchplane/domain";
import type { ExecutionRequestPayload } from "./execution-request-evidence.js";
import type { GitHubBatchDefinition } from "./github-batch-definition.js";
import {
  assertStoredParameterDefinitions,
  assertStoredParameterValue,
  assertStoredScheduleParameters,
  copyStoredParameterValue,
  hasOnlyParameterKeys,
  isParameterRecord,
  type GitHubBatchParameterDefinition,
  type GitHubCanonicalParameter,
  type GitHubCanonicalParameters,
  type GitHubParameterSource,
  type GitHubResolvedParameter,
  type GitHubStoredParameterValue,
} from "./parameter-storage.js";

export function resolveDefaultOrOmission(
  definition: GitHubBatchParameterDefinition,
  source: "DEFAULT" | "OMIT",
  revision: string,
): GitHubCanonicalParameter {
  if (source === "OMIT") {
    if (definition.required) throw new Error("PARAMETER_REQUIRED");
    return {
      sensitive: definition.sensitive,
      source: { origin: { type: "OMIT" } },
    };
  }
  if (definition.defaultValue === undefined)
    throw new Error("PARAMETER_DEFAULT_UNAVAILABLE");
  return {
    ...copyStoredParameterValue(definition.defaultValue),
    source: { origin: { type: "BATCH_DEFAULT" }, revision },
  };
}

/** Resolve fixed inputs from the verified definition, without decryption or mutable reads. */
export function resolveScheduledParameters(
  batch: GitHubBatchDefinition,
  scheduleId: string,
  sourceRevision: string,
): GitHubCanonicalParameters {
  assertStoredScheduleParameters(batch);
  const matches =
    batch.schedules?.filter((schedule) => schedule.scheduleId === scheduleId) ??
    [];
  if (matches.length !== 1) throw new Error("PARAMETER_SCHEDULE_UNKNOWN");
  if (batch.parameters?.length && !sourceRevision)
    throw new Error("PARAMETER_SOURCE_REVISION_INVALID");
  const schedule = matches[0]!;
  return Object.fromEntries(
    (batch.parameters ?? []).map((definition) => {
      const selection = schedule.parameters?.find(
        (candidate) => candidate.name === definition.name,
      );
      if (selection?.source === "VALUE")
        return [
          definition.name,
          {
            ...copyStoredParameterValue(selection.value),
            source: {
              origin: { type: "SCHEDULE_VALUE", scheduleId },
              revision: sourceRevision,
            },
          },
        ];
      const inherited =
        definition.defaultValue !== undefined ? "DEFAULT" : "OMIT";
      return [
        definition.name,
        resolveDefaultOrOmission(
          definition,
          selection?.source ?? inherited,
          sourceRevision,
        ),
      ];
    }),
  );
}

/** Input validation only: Gate remains the sole approval/authorization authority. */
export function validateApprovedParameters(
  payload: ExecutionRequestPayload,
  batch: GitHubBatchDefinition,
  sourceRevision: string,
): Record<string, GitHubResolvedParameter> {
  if (!isParameterRecord(payload.metadata) || !isParameterRecord(payload.spec))
    throw new Error("PARAMETER_CONTRACT_INVALID");
  assertStoredParameterDefinitions(batch.parameters);
  const definitions = batch.parameters ?? [];
  const records: unknown = payload.spec.parameters;
  if (
    !definitions.length &&
    records === undefined &&
    payload.spec.parameterContractVersion === undefined
  )
    return {};
  assertParameterContract(payload, batch, sourceRevision, records);
  if (payload.spec.triggerType === "SCHEDULE")
    assertScheduledEvidence(payload, batch, sourceRevision, records);
  const selected: [string, GitHubResolvedParameter][] = [];
  for (const definition of definitions) {
    const parameter = validateParameterRecord(
      records[definition.name],
      definition,
      payload,
      sourceRevision,
    );
    if (parameter) selected.push([definition.name, parameter]);
  }
  return Object.fromEntries(selected);
}

function assertParameterContract(
  payload: ExecutionRequestPayload,
  batch: GitHubBatchDefinition,
  sourceRevision: string,
  records: unknown,
): asserts records is Record<string, unknown> {
  if (
    payload.metadata.batchId !== batch.batchId ||
    payload.spec.parameterContractVersion !== "PARAMETER_DELIVERY_V1" ||
    payload.spec.parameterSourceRevision !== sourceRevision ||
    !sourceRevision ||
    !isParameterRecord(records)
  )
    throw new Error("PARAMETER_CONTRACT_INVALID");
  const names = Object.keys(records);
  validateParameterNames(names);
  const definitions = batch.parameters ?? [];
  if (
    names.length !== definitions.length ||
    names.some(
      (name) => !definitions.some((definition) => definition.name === name),
    )
  )
    throw new Error("PARAMETER_DEFINITIONS_MISMATCH");
}

function assertScheduledEvidence(
  payload: ExecutionRequestPayload,
  batch: GitHubBatchDefinition,
  revision: string,
  records: Record<string, unknown>,
): void {
  if (
    !payload.spec.schedule ||
    !sameParameterEvidence(
      records,
      resolveScheduledParameters(
        batch,
        payload.spec.schedule.scheduleId,
        revision,
      ),
    )
  )
    throw new Error("PARAMETER_SCHEDULE_SOURCE_MISMATCH");
}

function validateParameterRecord(
  record: unknown,
  definition: GitHubBatchParameterDefinition,
  payload: ExecutionRequestPayload,
  revision: string,
): GitHubResolvedParameter | undefined {
  if (
    !isParameterRecord(record) ||
    !isParameterRecord(record.source) ||
    !isParameterRecord(record.source.origin)
  )
    throw new Error("PARAMETER_SOURCE_INVALID");
  const source = record.source;
  const origin = record.source.origin;
  if (origin.type === "OMIT") {
    if (
      definition.required ||
      record.sensitive !== definition.sensitive ||
      !hasOnlyParameterKeys(record, ["sensitive", "source"]) ||
      !hasOnlyParameterKeys(source, ["origin"]) ||
      !hasOnlyParameterKeys(origin, ["type"])
    )
      throw new Error("PARAMETER_REQUIRED");
    return undefined;
  }
  const value = { ...record };
  delete value.source;
  assertStoredParameterValue(value, definition.sensitive);
  const verifiedSource = validateValueSource(
    source,
    origin,
    value,
    definition,
    payload,
    revision,
  );
  return { ...copyStoredParameterValue(value), source: verifiedSource };
}

function validateValueSource(
  source: Record<string, unknown>,
  origin: Record<string, unknown>,
  value: GitHubStoredParameterValue,
  definition: GitHubBatchParameterDefinition,
  payload: ExecutionRequestPayload,
  revision: string,
): GitHubParameterSource {
  switch (origin.type) {
    case "BATCH_DEFAULT":
      if (
        !hasOnlyParameterKeys(source, ["origin", "revision"]) ||
        !hasOnlyParameterKeys(origin, ["type"]) ||
        source.revision !== revision ||
        definition.defaultValue === undefined ||
        !sameParameterEvidence(
          value,
          copyStoredParameterValue(definition.defaultValue),
        )
      )
        throw new Error("PARAMETER_DEFAULT_SOURCE_MISMATCH");
      return { origin: { type: "BATCH_DEFAULT" }, revision };
    case "REQUEST_VALUE":
      if (
        payload.spec.triggerType === "SCHEDULE" ||
        !hasOnlyParameterKeys(source, ["origin"]) ||
        !hasOnlyParameterKeys(origin, ["type", "requestId"]) ||
        origin.requestId !== payload.metadata.requestId
      )
        throw new Error("PARAMETER_REQUEST_SOURCE_MISMATCH");
      return {
        origin: {
          type: "REQUEST_VALUE",
          requestId: payload.metadata.requestId,
        },
      };
    case "SCHEDULE_VALUE":
      if (
        payload.spec.triggerType !== "SCHEDULE" ||
        !hasOnlyParameterKeys(source, ["origin", "revision"]) ||
        !hasOnlyParameterKeys(origin, ["type", "scheduleId"]) ||
        source.revision !== revision ||
        typeof origin.scheduleId !== "string" ||
        origin.scheduleId !== payload.spec.schedule?.scheduleId
      )
        throw new Error("PARAMETER_SCHEDULE_SOURCE_MISMATCH");
      return {
        origin: { type: "SCHEDULE_VALUE", scheduleId: origin.scheduleId },
        revision,
      };
    default:
      throw new Error("PARAMETER_SOURCE_INVALID");
  }
}

function sameParameterEvidence(left: unknown, right: unknown): boolean {
  return (
    canonicalizeExact(left as CanonicalValue) ===
    canonicalizeExact(right as CanonicalValue)
  );
}
