import {
  WorkspaceNotConnectedError,
  WorkspaceSettingsError,
} from "@batchplane/ui-client";

export function formatWorkspaceError(
  error: unknown,
  translate: (key: string) => string,
): string {
  if (error instanceof WorkspaceNotConnectedError)
    return translate("settings:session.empty");
  if (error instanceof WorkspaceSettingsError) {
    return error.reason.type === "message"
      ? error.reason.message
      : translate(`settings:errors.${error.reason.type}`);
  }
  return error instanceof Error && error.message.trim()
    ? error.message
    : translate("settings:errors.unknown");
}
