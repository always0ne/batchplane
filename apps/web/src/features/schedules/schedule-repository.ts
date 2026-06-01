import type { BatchDefinition, ScheduleDefinition } from "@batchplane/domain";
import type {
  GitHubDirectoryEntry,
  GitHubLiteClient,
  RepoRef,
} from "@batchplane/github-lite";

import {
  batchDefinitionDirectory,
  loadBatchDefinitions,
} from "../batches/batch-repository";
import { getBatchDefinitionPath } from "../registration/registration-model";
import { parseScheduleDefinitionYaml } from "./schedule-model";

export const scheduleDefinitionDirectory = ".batch-governance/schedules";

export async function loadScheduleDefinitions({
  batchId,
  client,
  ref,
  repository,
}: {
  client: GitHubLiteClient;
  ref: string;
  repository: RepoRef;
  batchId?: string;
}): Promise<ScheduleDefinition[]> {
  const batchDefinitions = await loadBatchDefinitions({
    client,
    ref,
    repository,
  });
  const embeddedSchedules = flattenEmbeddedSchedules(batchDefinitions, batchId);

  if (embeddedSchedules.length > 0) {
    return embeddedSchedules;
  }

  const entries = await client.getDirectory({
    ...repository,
    path: scheduleDefinitionDirectory,
    ref,
  });

  if (!entries) {
    return [];
  }

  const files = entries.filter(isScheduleDefinitionFile);
  const definitions = await Promise.all(
    files.map(async (entry) => {
      const file = await client.getFile({
        ...repository,
        path: entry.path,
        ref,
      });

      return file ? parseScheduleDefinitionYaml(file.content) : null;
    }),
  );

  return definitions
    .filter(
      (definition): definition is ScheduleDefinition =>
        definition !== null &&
        Boolean(definition.scheduleId) &&
        (!batchId || definition.batchId === batchId),
    )
    .sort((left, right) => left.scheduleId.localeCompare(right.scheduleId));
}

function flattenEmbeddedSchedules(
  batchDefinitions: BatchDefinition[],
  batchId?: string,
): ScheduleDefinition[] {
  return batchDefinitions
    .filter((definition) => !batchId || definition.batchId === batchId)
    .flatMap((definition) =>
      (definition.schedules ?? []).map((schedule) => ({
        batchId: definition.batchId,
        cron: schedule.cron,
        definitionPath: getBatchDefinitionPath(definition.batchId),
        enabled: schedule.enabled,
        name: schedule.name,
        scheduleId: schedule.scheduleId,
        timezone: schedule.timezone,
      })),
    )
    .sort((left, right) => left.scheduleId.localeCompare(right.scheduleId));
}

export function isScheduleDefinitionFile(entry: GitHubDirectoryEntry): boolean {
  if (entry.type !== "file") {
    return false;
  }

  return (
    !entry.path.startsWith(batchDefinitionDirectory) &&
    (entry.name.endsWith(".yml") || entry.name.endsWith(".yaml"))
  );
}
