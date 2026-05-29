import { i18next } from "../i18n/i18n";

type GitHubLiteErrorLike = Error & {
  code?: unknown;
  status?: unknown;
};

const githubApiTranslationKeyByCode = {
  "bad-request": "badRequest",
  conflict: "conflict",
  forbidden: "forbidden",
  "not-found": "notFound",
  "rate-limited": "rateLimited",
  unauthorized: "unauthorized",
  unknown: "unknown",
  validation: "validation",
} as const;

export function formatRuntimeError(error: unknown, fallback: string): string {
  const githubMessage = formatGitHubLiteError(error);

  if (githubMessage) {
    return githubMessage;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

function formatGitHubLiteError(error: unknown): string | null {
  if (!isGitHubLiteError(error)) {
    return null;
  }

  const translationKey = resolveGitHubApiTranslationKey(error);
  const key = `errors:githubApi.${translationKey}`;

  if (!i18next.exists(key)) {
    return null;
  }

  return i18next.t(key);
}

function isGitHubLiteError(error: unknown): error is GitHubLiteErrorLike {
  return error instanceof Error && error.name === "GitHubLiteApiError";
}

function resolveGitHubApiTranslationKey(
  error: GitHubLiteErrorLike,
): (typeof githubApiTranslationKeyByCode)[keyof typeof githubApiTranslationKeyByCode] {
  if (
    typeof error.code === "string" &&
    error.code in githubApiTranslationKeyByCode
  ) {
    return githubApiTranslationKeyByCode[
      error.code as keyof typeof githubApiTranslationKeyByCode
    ];
  }

  if (error.status === 401) {
    return "unauthorized";
  }

  if (error.status === 403) {
    return "forbidden";
  }

  if (error.status === 404) {
    return "notFound";
  }

  if (error.status === 409) {
    return "conflict";
  }

  if (error.status === 422) {
    return "validation";
  }

  if (error.status === 429) {
    return "rateLimited";
  }

  return "unknown";
}
