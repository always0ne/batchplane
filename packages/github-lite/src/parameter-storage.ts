import {
  validateParameterNames,
  validateParameterString,
  type BatchParameterDefinition,
  type BatchSchedule,
  type ParameterInputValue,
} from "@batchplane/domain";
import type { ExecutionRequestParameterSummary } from "@batchplane/ui-client";
import type { GitHubBatchDefinition } from "./github-batch-definition.js";

export type GitHubStoredParameterValue =
  | { sensitive?: false; value: string }
  | { sensitive: true; encrypted: { version: 1; keyId: string; jwe: string } };

export type GitHubBatchParameterDefinition = Omit<
  BatchParameterDefinition,
  "defaultValue"
> & {
  defaultValue?: GitHubStoredParameterValue;
};

export type GitHubScheduleParameterSelection =
  | { name: string; source: "DEFAULT" | "OMIT" }
  | { name: string; source: "VALUE"; value: GitHubStoredParameterValue };

export type GitHubBatchSchedule = Omit<BatchSchedule, "parameters"> & {
  parameters?: GitHubScheduleParameterSelection[];
};

export type ParameterValueOrigin =
  | { type: "BATCH_DEFAULT" }
  | { type: "SCHEDULE_VALUE"; scheduleId: string }
  | { type: "REQUEST_VALUE"; requestId: string };

export type GitHubParameterSource =
  | {
      origin: Extract<
        ParameterValueOrigin,
        { type: "BATCH_DEFAULT" | "SCHEDULE_VALUE" }
      >;
      revision: string;
    }
  | { origin: Extract<ParameterValueOrigin, { type: "REQUEST_VALUE" }> };

export type GitHubResolvedParameter = GitHubStoredParameterValue & {
  source: GitHubParameterSource;
};
export type GitHubCanonicalParameter =
  | GitHubResolvedParameter
  | { sensitive: boolean; source: { origin: { type: "OMIT" } } };
export type GitHubCanonicalParameters = Record<
  string,
  GitHubCanonicalParameter
>;

export type SavedParameterScope = {
  repositoryId: string;
  batchId: string;
  sourceRevision: string;
};

export function savedParameterReference(
  scope: SavedParameterScope,
  name: string,
  origin: ParameterValueOrigin,
): string {
  const identity = [
    scope.repositoryId,
    scope.batchId,
    scope.sourceRevision,
    name,
    origin.type,
    parameterOriginIdentity(origin),
  ];
  return `batchplane:saved-parameter:v1:${encodeURIComponent(JSON.stringify(identity))}`;
}

function parameterOriginIdentity(origin: ParameterValueOrigin): string | null {
  if (origin.type === "SCHEDULE_VALUE") return origin.scheduleId;
  if (origin.type === "REQUEST_VALUE") return origin.requestId;
  return null;
}

export function toParameterInput(
  value: GitHubStoredParameterValue,
  scope: SavedParameterScope,
  name: string,
  origin: ParameterValueOrigin,
): ParameterInputValue {
  return value.sensitive
    ? { kind: "SAVED", reference: savedParameterReference(scope, name, origin) }
    : { kind: "VALUE", value: value.value };
}

export function toNeutralParameterDefinitions(
  batch: GitHubBatchDefinition,
  scope: SavedParameterScope,
): BatchParameterDefinition[] | undefined {
  return batch.parameters?.map(({ defaultValue, ...definition }) => ({
    ...definition,
    ...(defaultValue !== undefined
      ? {
          defaultValue: toParameterInput(defaultValue, scope, definition.name, {
            type: "BATCH_DEFAULT",
          }),
        }
      : {}),
  }));
}

export function toNeutralSchedules(
  batch: GitHubBatchDefinition,
  scope: SavedParameterScope,
): BatchSchedule[] | undefined {
  return batch.schedules?.map(({ parameters, ...schedule }) => {
    if (parameters === undefined) return schedule;
    return {
      ...schedule,
      parameters: parameters.map((selection) => {
        if (selection.source !== "VALUE") return { ...selection };
        return {
          name: selection.name,
          source: "VALUE" as const,
          value: toParameterInput(selection.value, scope, selection.name, {
            type: "SCHEDULE_VALUE",
            scheduleId: schedule.scheduleId,
          }),
        };
      }),
    };
  });
}

export function copyStoredParameterValue(
  value: GitHubStoredParameterValue,
): GitHubStoredParameterValue {
  return value.sensitive
    ? { sensitive: true, encrypted: { ...value.encrypted } }
    : { value: value.value };
}

export function assertStoredParameterValue(
  value: unknown,
  sensitive: boolean,
): asserts value is GitHubStoredParameterValue {
  if (!isParameterRecord(value)) throw new Error("PARAMETER_VALUE_INVALID");
  if (sensitive) {
    if (
      value.sensitive !== true ||
      !hasOnlyParameterKeys(value, ["sensitive", "encrypted"])
    )
      throw new Error("PARAMETER_SENSITIVITY_MISMATCH");
    const encrypted = value.encrypted;
    if (
      !isParameterRecord(encrypted) ||
      !hasOnlyParameterKeys(encrypted, ["version", "keyId", "jwe"]) ||
      encrypted.version !== 1 ||
      typeof encrypted.keyId !== "string" ||
      !encrypted.keyId ||
      typeof encrypted.jwe !== "string" ||
      !encrypted.jwe
    )
      throw new Error("PARAMETER_ENCRYPTED_VALUE_INVALID");
  } else {
    if (
      (value.sensitive !== undefined && value.sensitive !== false) ||
      !hasOnlyParameterKeys(value, ["sensitive", "value"])
    )
      throw new Error("PARAMETER_SENSITIVITY_MISMATCH");
    validateParameterString(value.value);
  }
}

export function assertStoredParameterDefinitions(
  parameters: unknown,
): asserts parameters is GitHubBatchParameterDefinition[] | undefined {
  if (parameters === undefined) return;
  if (!Array.isArray(parameters))
    throw new Error("PARAMETER_DEFINITIONS_INVALID");
  for (const item of parameters) {
    if (
      !isParameterRecord(item) ||
      !hasOnlyParameterKeys(item, [
        "name",
        "required",
        "sensitive",
        "defaultValue",
      ]) ||
      typeof item.name !== "string" ||
      typeof item.required !== "boolean" ||
      typeof item.sensitive !== "boolean"
    )
      throw new Error("PARAMETER_DEFINITION_INVALID");
    if (Object.hasOwn(item, "defaultValue"))
      assertStoredParameterValue(item.defaultValue, item.sensitive);
  }
  validateParameterNames(
    parameters.map((item: GitHubBatchParameterDefinition) => item.name),
  );
}

export function assertStoredScheduleParameters(
  batch: Pick<GitHubBatchDefinition, "parameters" | "schedules">,
): void {
  assertStoredParameterDefinitions(batch.parameters);
  if (
    !batch.parameters?.length &&
    !batch.schedules?.some((schedule) => schedule.parameters !== undefined)
  )
    return;
  const definitions = new Map(
    batch.parameters?.map((definition) => [definition.name, definition]),
  );
  const scheduleIds = new Set<string>();
  for (const schedule of batch.schedules ?? []) {
    if (scheduleIds.has(schedule.scheduleId))
      throw new Error("PARAMETER_SCHEDULE_DUPLICATED");
    scheduleIds.add(schedule.scheduleId);
    if (
      schedule.parameters !== undefined &&
      !Array.isArray(schedule.parameters)
    )
      throw new Error("PARAMETER_SELECTION_INVALID");
    const selections = schedule.parameters ?? [];
    validateParameterNames(selections.map((item) => item.name));
    for (const selection of selections) {
      if (!isParameterRecord(selection))
        throw new Error("PARAMETER_SELECTION_INVALID");
      const definition = definitions.get(selection.name);
      if (!definition) throw new Error("PARAMETER_NAME_UNKNOWN");
      if (selection.source === "VALUE") {
        if (!hasOnlyParameterKeys(selection, ["name", "source", "value"]))
          throw new Error("PARAMETER_SELECTION_INVALID");
        assertStoredParameterValue(selection.value, definition.sensitive);
      } else if (
        selection.source === "DEFAULT" ||
        selection.source === "OMIT"
      ) {
        if (!hasOnlyParameterKeys(selection, ["name", "source"]))
          throw new Error("PARAMETER_SELECTION_INVALID");
        if (selection.source === "OMIT" && definition.required)
          throw new Error("PARAMETER_REQUIRED");
        if (
          selection.source === "DEFAULT" &&
          definition.defaultValue === undefined
        )
          throw new Error("PARAMETER_DEFAULT_UNAVAILABLE");
      } else throw new Error("PARAMETER_SELECTION_INVALID");
    }
    for (const definition of definitions.values()) {
      if (
        definition.required &&
        definition.defaultValue === undefined &&
        !selections.some(
          (selection) =>
            selection.name === definition.name && selection.source === "VALUE",
        )
      )
        throw new Error("PARAMETER_REQUIRED");
    }
  }
}

export function projectParameterSummaries(
  parameters: unknown,
): ExecutionRequestParameterSummary[] | undefined {
  if (!isParameterRecord(parameters)) return undefined;
  return Object.entries(parameters).map(([name, stored]) => {
    const record = isParameterRecord(stored) ? stored : {};
    const storedSource = isParameterRecord(record.source) ? record.source : {};
    const origin = isParameterRecord(storedSource.origin)
      ? storedSource.origin
      : {};
    let source: "DEFAULT" | "VALUE" | "OMIT" = "VALUE";
    if (origin.type === "BATCH_DEFAULT") source = "DEFAULT";
    if (origin.type === "OMIT") source = "OMIT";
    const sensitive = record.sensitive === true;
    const summary = { name, sensitive, source };
    if (!sensitive && source !== "OMIT" && typeof record.value === "string")
      return { ...summary, value: record.value };
    return summary;
  });
}

export function isParameterRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function hasOnlyParameterKeys(
  value: Record<string, unknown>,
  keys: string[],
): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}
