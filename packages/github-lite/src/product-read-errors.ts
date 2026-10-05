import type { BatchListError } from "@batchplane/ui-client";

export function toProductReadError(error: unknown): BatchListError {
  if (isGitHubLiteApiError(error)) {
    const errorType =
      getGitHubErrorTypeByCode(error.code) ??
      getGitHubErrorTypeByStatus(error.status) ??
      "provider-unknown";

    return { type: errorType };
  }

  if (error instanceof Error && error.message.trim()) {
    return { message: error.message, type: "message" };
  }

  return { type: "unknown" };
}

const githubErrorTypeByCode = {
  "bad-request": "request-rejected",
  conflict: "conflict",
  forbidden: "access-denied",
  "not-found": "resource-unavailable",
  "rate-limited": "temporarily-unavailable",
  unauthorized: "authentication-required",
  unknown: "provider-unknown",
  validation: "invalid-input",
} as const satisfies Record<string, Exclude<BatchListError["type"], "message">>;

function getGitHubErrorTypeByCode(
  code: unknown,
): Exclude<BatchListError["type"], "message"> | undefined {
  if (typeof code !== "string" || !(code in githubErrorTypeByCode)) {
    return undefined;
  }

  return githubErrorTypeByCode[code as keyof typeof githubErrorTypeByCode];
}

function getGitHubErrorTypeByStatus(
  status: unknown,
): Exclude<BatchListError["type"], "message"> | undefined {
  if (status === 401) return "authentication-required";
  if (status === 403) return "access-denied";
  if (status === 404) return "resource-unavailable";
  if (status === 409) return "conflict";
  if (status === 422) return "invalid-input";
  if (status === 429) return "temporarily-unavailable";
  return undefined;
}

function isGitHubLiteApiError(
  error: unknown,
): error is Error & { code?: unknown; status?: unknown } {
  return error instanceof Error && error.name === "GitHubLiteApiError";
}
