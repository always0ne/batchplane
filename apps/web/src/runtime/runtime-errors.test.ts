import { beforeEach, describe, expect, it } from "vitest";

import "../i18n/i18n";
import { i18next } from "../i18n/i18n";
import { formatRuntimeError } from "./runtime-errors";

describe("formatRuntimeError", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
  });

  it.each([
    [
      "unauthorized",
      401,
      "GitHub authentication failed. Check the token value and sign in again.",
    ],
    [
      "forbidden",
      403,
      "GitHub denied this request. Check token permissions, repository access, and organization restrictions.",
    ],
    [
      "not-found",
      404,
      "The requested GitHub resource was not found. Check the repository, branch, workflow path, or request identifier.",
    ],
    [
      "conflict",
      409,
      "GitHub reported a repository conflict. Refresh the latest repository state and retry the operation.",
    ],
    [
      "validation",
      422,
      "GitHub rejected the request because one or more fields are invalid or already in use.",
    ],
    [
      "rate-limited",
      429,
      "GitHub API rate limit was reached. Wait for the limit to reset and retry.",
    ],
  ])(
    "maps GitHubLiteApiError %s to a localized message",
    (code, status, expected) => {
      const error = new Error("raw GitHub message");
      error.name = "GitHubLiteApiError";
      Object.assign(error, { code, status });

      expect(formatRuntimeError(error, "fallback")).toBe(expected);
    },
  );

  it("falls back to the original error message for non-GitHub errors", () => {
    expect(formatRuntimeError(new Error("boom"), "fallback")).toBe("boom");
  });

  it("maps GitHubLiteApiError messages through the active locale", async () => {
    await i18next.changeLanguage("ko");
    const error = new Error("raw GitHub message");
    error.name = "GitHubLiteApiError";
    Object.assign(error, { code: "forbidden", status: 403 });

    expect(formatRuntimeError(error, "fallback")).toBe(
      "GitHub가 요청을 거부했습니다. 토큰 권한, 저장소 접근 권한, 조직 제한을 확인하세요.",
    );
  });
});
