import type { ScheduleDefinition } from "@batchplane/domain";
import type {
  GitHubDirectoryEntry,
  GitHubLiteClient,
  RepoRef,
} from "@batchplane/github-lite";

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

export function isScheduleDefinitionFile(entry: GitHubDirectoryEntry): boolean {
  return (
    entry.type === "file" &&
    (entry.name.endsWith(".yml") || entry.name.endsWith(".yaml"))
  );
}
