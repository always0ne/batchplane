import type { GovernedChangeFilePreview } from "@batchplane/domain";

export type GovernedChangePreviewState =
  | { type: "idle" }
  | { type: "loading" }
  | { type: "ready"; files: GovernedChangeFilePreview[] }
  | { type: "no-session" }
  | { type: "error"; message: string };

export function hasNoGovernedFileChanges(
  state: GovernedChangePreviewState,
): boolean {
  return (
    state.type === "ready" &&
    state.files.length > 0 &&
    state.files.every((file) => file.status === "UNCHANGED")
  );
}
