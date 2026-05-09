import type { BatchDefinition } from "@batchtrail/domain";
import type {
  GitHubDirectoryEntry,
  GitHubLiteClient,
  RepoRef,
} from "@batchtrail/github-lite";

import { parseBatchDefinitionYaml } from "../registration/registration-model";

export const batchDefinitionDirectory = ".batch-governance/batches";

export async function loadBatchDefinitions({
  client,
  ref,
  repository,
}: {
  client: GitHubLiteClient;
  ref: string;
  repository: RepoRef;
}): Promise<BatchDefinition[]> {
  const entries = await client.getDirectory({
    ...repository,
    path: batchDefinitionDirectory,
    ref,
  });

  if (!entries) {
    return [];
  }

  const files = entries.filter(isBatchDefinitionFile);
  const definitions = await Promise.all(
    files.map(async (entry) => {
      const file = await client.getFile({
        ...repository,
        path: entry.path,
        ref,
      });

      return file ? parseBatchDefinitionYaml(file.content) : null;
    }),
  );

  return definitions
    .filter((definition): definition is BatchDefinition =>
      Boolean(definition?.batchId),
    )
    .sort((left, right) => left.batchId.localeCompare(right.batchId));
}

export function isBatchDefinitionFile(entry: GitHubDirectoryEntry): boolean {
  return (
    entry.type === "file" &&
    (entry.name.endsWith(".yml") || entry.name.endsWith(".yaml"))
  );
}
