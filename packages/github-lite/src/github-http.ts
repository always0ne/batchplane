import {
  GitHubLiteApiError,
  type GitHubLiteApiErrorCode,
  type GitHubLiteClientOptions,
} from "./github-types.js";

export type GitHubRequester = {
  request<T>(
    path: string,
    init?: RequestInit,
    options?: { allowNotFound?: boolean },
  ): Promise<T | null>;
  requestText(path: string, init?: RequestInit): Promise<string>;
};

export function createGitHubRequester({
  apiBaseUrl = "https://api.github.com",
  fetcher = fetch,
  token,
}: GitHubLiteClientOptions): GitHubRequester {
  const trimmedToken = token.trim();

  if (!trimmedToken) {
    throw new GitHubLiteApiError(
      "GitHub token is required.",
      "bad-request",
      400,
    );
  }

  return {
    async request<T>(
      path: string,
      init: RequestInit = {},
      options: { allowNotFound?: boolean } = {},
    ): Promise<T | null> {
      const response = await fetcher(`${apiBaseUrl}${path}`, {
        ...init,
        headers: buildHeaders(trimmedToken, init.headers),
      });

      if (response.status === 404 && options.allowNotFound) {
        return null;
      }

      if (!response.ok) {
        throw await buildGitHubApiError(response);
      }

      if (response.status === 204) {
        return null;
      }

      return (await response.json()) as T;
    },

    async requestText(path: string, init: RequestInit = {}): Promise<string> {
      const response = await fetcher(`${apiBaseUrl}${path}`, {
        ...init,
        headers: buildHeaders(trimmedToken, init.headers),
      });

      if (!response.ok) {
        throw await buildGitHubApiError(response);
      }

      return response.text();
    },
  };
}

export function buildHeaders(
  token: string,
  initHeaders?: HeadersInit,
): Headers {
  const headers = new Headers(initHeaders);

  headers.set("Accept", "application/vnd.github+json");
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Content-Type", "application/json");
  headers.set("X-GitHub-Api-Version", "2022-11-28");

  return headers;
}

export function buildQuery(params: Record<string, string | undefined>): string {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      query.set(key, value);
    }
  }

  const serializedQuery = query.toString();

  return serializedQuery ? `?${serializedQuery}` : "";
}

export function buildLabelSearchQualifier(label: string): string {
  return /\s/u.test(label)
    ? `label:"${label.replace(/"/g, '\\"')}"`
    : `label:${label}`;
}

export function encodePath(path: string): string {
  return path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

export function decodeBase64(value: string): string {
  const bytes = Uint8Array.from(atob(value.replace(/\s/g, "")), (character) =>
    character.charCodeAt(0),
  );

  return new TextDecoder().decode(bytes);
}

export function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

export function truncateTextByBytes(
  content: string,
  maxBytes: number,
): { content: string; truncated: boolean } {
  if (maxBytes <= 0) {
    return {
      content: "",
      truncated: getByteLength(content) > 0,
    };
  }

  const bytes = new TextEncoder().encode(content);

  if (bytes.byteLength <= maxBytes) {
    return {
      content,
      truncated: false,
    };
  }

  return {
    content: new TextDecoder().decode(bytes.slice(0, maxBytes)),
    truncated: true,
  };
}

export function getByteLength(content: string): number {
  return new TextEncoder().encode(content).byteLength;
}

export function hasWorkflowDispatchTrigger(content: string): boolean {
  return /(^|\n)\s*workflow_dispatch\s*:/m.test(content);
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { message?: string };
    return (
      payload.message ?? `GitHub API request failed with ${response.status}`
    );
  } catch {
    return `GitHub API request failed with ${response.status}`;
  }
}

export function mapStatusToErrorCode(status: number): GitHubLiteApiErrorCode {
  if (status === 400) {
    return "bad-request";
  }

  if (status === 409) {
    return "conflict";
  }

  if (status === 401) {
    return "unauthorized";
  }

  if (status === 403) {
    return "forbidden";
  }

  if (status === 404) {
    return "not-found";
  }

  if (status === 422) {
    return "validation";
  }

  if (status === 429) {
    return "rate-limited";
  }

  return "unknown";
}

async function buildGitHubApiError(
  response: Response,
): Promise<GitHubLiteApiError> {
  const message = await readErrorMessage(response);

  return new GitHubLiteApiError(
    message,
    isRateLimitedResponse(response, message)
      ? "rate-limited"
      : mapStatusToErrorCode(response.status),
    response.status,
  );
}

export function isRateLimitedResponse(
  response: Response,
  message: string,
): boolean {
  if (response.status === 429) {
    return true;
  }

  if (response.status !== 403) {
    return false;
  }

  if (response.headers.get("x-ratelimit-remaining") === "0") {
    return true;
  }

  if (response.headers.has("retry-after")) {
    return true;
  }

  return message.toLowerCase().includes("rate limit");
}
