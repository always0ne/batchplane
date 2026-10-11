import {
  validateParameterNames,
  validateParameterString,
  type BatchParameterDefinition,
  type ParameterInputValue,
  type ParameterSelection,
  type BatchSchedule,
} from "@batchplane/domain";
import {
  encryptParameterValue,
  type WorkspaceEncryptionConfiguration,
} from "./parameter-encryption.js";
import type { GitHubBatchDefinition } from "./github-batch-definition.js";
import {
  assertStoredParameterDefinitions,
  assertStoredParameterValue,
  assertStoredScheduleParameters,
  copyStoredParameterValue,
  hasOnlyParameterKeys,
  isParameterRecord,
  savedParameterReference,
  type GitHubBatchParameterDefinition,
  type GitHubBatchSchedule,
  type GitHubCanonicalParameters,
  type GitHubScheduleParameterSelection,
  type GitHubStoredParameterValue,
  type ParameterValueOrigin,
  type SavedParameterScope,
} from "./parameter-storage.js";
import { resolveDefaultOrOmission } from "./parameter-validation.js";
import type { WorkspaceEncryptionReadiness } from "./workspace-encryption-readiness.js";

export {
  resolveScheduledParameters,
  validateApprovedParameters,
} from "./parameter-validation.js";

export type ParameterMaterializationContext = SavedParameterScope & {
  configuration?: WorkspaceEncryptionConfiguration | null;
  approvedSource?: GitHubBatchDefinition;
};

export function requireParameterEncryptionConfiguration(
  readiness: WorkspaceEncryptionReadiness,
): WorkspaceEncryptionConfiguration {
  if (!readiness.available || !readiness.configuration)
    throw new Error(
      `PARAMETER_ENCRYPTION_${readiness.unavailableReason ?? "STATUS_UNAVAILABLE"}`,
    );
  return readiness.configuration;
}

export function hasSavedParameterInputs(
  definitions: BatchParameterDefinition[] | undefined,
  schedules: BatchSchedule[],
): boolean {
  return Boolean(
    definitions?.some(
      (definition) => definition.defaultValue?.kind === "SAVED",
    ) ||
    schedules.some((schedule) =>
      schedule.parameters?.some(
        (selection) =>
          selection.source === "VALUE" && selection.value.kind === "SAVED",
      ),
    ),
  );
}

export function hasNewSensitiveParameterInputs(
  definitions: BatchParameterDefinition[] | undefined,
  schedules: BatchSchedule[],
): boolean {
  const sensitiveNames = new Set(
    definitions
      ?.filter((definition) => definition.sensitive)
      .map((definition) => definition.name),
  );
  return Boolean(
    definitions?.some(
      (definition) =>
        definition.sensitive && definition.defaultValue?.kind === "VALUE",
    ) ||
    schedules.some((schedule) =>
      schedule.parameters?.some(
        (selection) =>
          selection.source === "VALUE" &&
          selection.value.kind === "VALUE" &&
          sensitiveNames.has(selection.name),
      ),
    ),
  );
}

async function materializeInput(
  input: ParameterInputValue,
  definition: Pick<BatchParameterDefinition, "name" | "sensitive">,
  origin: ParameterValueOrigin,
  context: ParameterMaterializationContext,
  saved?: GitHubStoredParameterValue,
): Promise<GitHubStoredParameterValue> {
  if (!isParameterRecord(input)) throw new Error("PARAMETER_INPUT_INVALID");
  if (input.kind === "SAVED")
    return resolveSavedInput(input, definition, origin, context, saved);
  if (input.kind !== "VALUE" || !hasOnlyParameterKeys(input, ["kind", "value"]))
    throw new Error("PARAMETER_INPUT_INVALID");
  validateParameterString(input.value);
  if (!definition.sensitive) return { value: input.value };
  if (!context.configuration)
    throw new Error("PARAMETER_ENCRYPTION_SETUP_REQUIRED");
  return encryptParameterValue(input.value, context.configuration, {
    repositoryId: context.repositoryId,
    batchId: context.batchId,
    parameterName: definition.name,
    origin,
  });
}

function resolveSavedInput(
  input: Extract<ParameterInputValue, { kind: "SAVED" }>,
  definition: Pick<BatchParameterDefinition, "name" | "sensitive">,
  origin: ParameterValueOrigin,
  context: ParameterMaterializationContext,
  saved: GitHubStoredParameterValue | undefined,
): GitHubStoredParameterValue {
  if (
    !hasOnlyParameterKeys(input, ["kind", "reference"]) ||
    !saved ||
    !context.repositoryId ||
    !context.sourceRevision ||
    context.approvedSource?.batchId !== context.batchId ||
    input.reference !==
      savedParameterReference(context, definition.name, origin)
  )
    throw new Error("PARAMETER_SAVED_REFERENCE_INVALID");
  assertStoredParameterValue(saved, definition.sensitive);
  return copyStoredParameterValue(saved);
}

/** SAVED inputs are resolved only from a verified immutable snapshot supplied by the adapter. */
export async function materializeBatchParameters(
  definitions: BatchParameterDefinition[] | undefined,
  schedules: BatchSchedule[],
  context: ParameterMaterializationContext,
): Promise<Pick<GitHubBatchDefinition, "parameters" | "schedules">> {
  if (definitions !== undefined && !Array.isArray(definitions))
    throw new Error("PARAMETER_DEFINITIONS_INVALID");
  validateParameterNames(
    (definitions ?? []).map((definition) => definition.name),
  );
  const parameters =
    definitions === undefined
      ? undefined
      : await Promise.all(
          definitions.map((definition) =>
            materializeDefinition(definition, context),
          ),
        );
  const storedSchedules = await Promise.all(
    schedules.map((schedule) =>
      materializeSchedule(schedule, parameters ?? [], context),
    ),
  );
  const result = {
    ...(parameters !== undefined ? { parameters } : {}),
    schedules: storedSchedules,
  };
  assertStoredScheduleParameters(result);
  return result;
}

async function materializeDefinition(
  definition: BatchParameterDefinition,
  context: ParameterMaterializationContext,
): Promise<GitHubBatchParameterDefinition> {
  if (
    !isParameterRecord(definition) ||
    !hasOnlyParameterKeys(definition, [
      "name",
      "required",
      "sensitive",
      "defaultValue",
    ]) ||
    typeof definition.required !== "boolean" ||
    typeof definition.sensitive !== "boolean"
  )
    throw new Error("PARAMETER_DEFINITION_INVALID");
  const stored: GitHubBatchParameterDefinition = {
    name: definition.name,
    required: definition.required,
    sensitive: definition.sensitive,
  };
  if (definition.defaultValue === undefined) return stored;
  const saved = context.approvedSource?.parameters?.find(
    (candidate) => candidate.name === definition.name,
  )?.defaultValue;
  stored.defaultValue = await materializeInput(
    definition.defaultValue,
    definition,
    { type: "BATCH_DEFAULT" },
    context,
    saved,
  );
  return stored;
}

async function materializeSchedule(
  schedule: BatchSchedule,
  definitions: GitHubBatchParameterDefinition[],
  context: ParameterMaterializationContext,
): Promise<GitHubBatchSchedule> {
  const { parameters, ...stored } = schedule;
  if (parameters === undefined) return stored;
  if (!Array.isArray(parameters))
    throw new Error("PARAMETER_SELECTION_INVALID");
  validateParameterNames(parameters.map((selection) => selection.name));
  return {
    ...stored,
    parameters: await Promise.all(
      parameters.map((selection) =>
        materializeScheduleSelection(
          selection,
          schedule.scheduleId,
          definitions,
          context,
        ),
      ),
    ),
  };
}

async function materializeScheduleSelection(
  selection: ParameterSelection,
  scheduleId: string,
  definitions: GitHubBatchParameterDefinition[],
  context: ParameterMaterializationContext,
): Promise<GitHubScheduleParameterSelection> {
  assertInputSelection(selection);
  const definition = definitions.find(
    (candidate) => candidate.name === selection.name,
  );
  if (!definition) throw new Error("PARAMETER_NAME_UNKNOWN");
  if (selection.source !== "VALUE") return { ...selection };
  const original = context.approvedSource?.schedules
    ?.find((candidate) => candidate.scheduleId === scheduleId)
    ?.parameters?.find((candidate) => candidate.name === selection.name);
  const saved = original?.source === "VALUE" ? original.value : undefined;
  return {
    name: selection.name,
    source: "VALUE",
    value: await materializeInput(
      selection.value,
      definition,
      { type: "SCHEDULE_VALUE", scheduleId },
      context,
      saved,
    ),
  };
}

export async function materializeRequestParameters(
  batch: GitHubBatchDefinition,
  selections: ParameterSelection[],
  requestId: string,
  context: ParameterMaterializationContext,
): Promise<GitHubCanonicalParameters> {
  assertStoredParameterDefinitions(batch.parameters);
  validateRequestSelections(batch, selections);
  const entries = await Promise.all(
    (batch.parameters ?? []).map(async (definition) => {
      const selection = selections.find(
        (candidate) => candidate.name === definition.name,
      )!;
      if (selection.source !== "VALUE")
        return [
          definition.name,
          resolveDefaultOrOmission(
            definition,
            selection.source,
            context.sourceRevision,
          ),
        ];
      const origin = { type: "REQUEST_VALUE" as const, requestId };
      const value = await materializeInput(
        selection.value,
        definition,
        origin,
        context,
      );
      return [definition.name, { ...value, source: { origin } }];
    }),
  );
  return Object.fromEntries(entries);
}

function validateRequestSelections(
  batch: GitHubBatchDefinition,
  selections: ParameterSelection[],
): void {
  if (!Array.isArray(selections))
    throw new Error("PARAMETER_SELECTION_INVALID");
  const definitions = batch.parameters ?? [];
  for (const selection of selections) {
    assertInputSelection(selection);
    if (!definitions.some((definition) => definition.name === selection.name))
      throw new Error("PARAMETER_NAME_UNKNOWN");
  }
  validateParameterNames(selections.map((selection) => selection.name));
  if (selections.length !== definitions.length)
    throw new Error("PARAMETER_SELECTION_REQUIRED");
}

function assertInputSelection(
  selection: unknown,
): asserts selection is ParameterSelection {
  if (!isParameterRecord(selection) || typeof selection.name !== "string")
    throw new Error("PARAMETER_SELECTION_INVALID");
  if (
    selection.source !== "DEFAULT" &&
    selection.source !== "VALUE" &&
    selection.source !== "OMIT"
  )
    throw new Error("PARAMETER_SELECTION_INVALID");
  const keys =
    selection.source === "VALUE"
      ? ["name", "source", "value"]
      : ["name", "source"];
  if (!hasOnlyParameterKeys(selection, keys))
    throw new Error("PARAMETER_SELECTION_INVALID");
}
