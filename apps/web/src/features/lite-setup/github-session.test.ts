import { beforeEach, describe, expect, it } from "vitest";

import {
  clearGitHubSession,
  githubSessionStorageKey,
  hasGitHubSession,
  readGitHubSession,
  redactGitHubToken,
  writeGitHubSession,
} from "./github-session";

describe("GitHub session storage", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it("stores the GitHub token in sessionStorage only", () => {
    const session = writeGitHubSession({
      owner: " always0ne ",
      repo: " batchtrail ",
      token: " ghp_session_token ",
    });

    expect(session).toEqual({
      owner: "always0ne",
      repo: "batchtrail",
      token: "ghp_session_token",
    });
    expect(readGitHubSession()).toEqual(session);
    expect(localStorage.getItem(githubSessionStorageKey)).toBeNull();
  });

  it("clears the active GitHub session", () => {
    writeGitHubSession({
      owner: "always0ne",
      repo: "batchtrail",
      token: "ghp_session_token",
    });

    expect(hasGitHubSession()).toBe(true);

    clearGitHubSession();

    expect(hasGitHubSession()).toBe(false);
  });

  it("ignores malformed stored values", () => {
    sessionStorage.setItem(githubSessionStorageKey, "{");

    expect(readGitHubSession()).toBeNull();
  });

  it("redacts display tokens", () => {
    expect(redactGitHubToken("ghp_1234567890")).toBe("ghp_****7890");
  });
});
