import type { GovernedChangePreviewFile } from "@batchplane/ui-client";

export function hasNoPreviewFileChanges(
  files: GovernedChangePreviewFile[],
): boolean {
  return files.length > 0 && files.every((file) => file.status === "UNCHANGED");
}
