import { ExecutionInspectionError } from "@batchplane/ui-client";

const errorTranslationKeys = {
  "access-denied": "errors:githubApi.forbidden",
  "authentication-required": "errors:githubApi.unauthorized",
  conflict: "errors:githubApi.conflict",
  "invalid-input": "errors:githubApi.validation",
  "request-rejected": "errors:githubApi.badRequest",
  "resource-unavailable": "errors:githubApi.notFound",
  "temporarily-unavailable": "errors:githubApi.rateLimited",
  "provider-unknown": "errors:githubApi.unknown",
} as const;

export function formatInspectionError(
  error: unknown,
  translate: (key: string) => string,
  fallback: string,
  accessDenied?: string,
): string {
  if (error instanceof ExecutionInspectionError) {
    const reason = error.reason;
    if (reason.type === "message") return reason.message;
    if (reason.type === "access-denied" && accessDenied)
      return translate(accessDenied);
    return reason.type === "unknown"
      ? translate(fallback)
      : translate(errorTranslationKeys[reason.type]);
  }
  return error instanceof Error && error.message.trim()
    ? error.message
    : translate(fallback);
}
