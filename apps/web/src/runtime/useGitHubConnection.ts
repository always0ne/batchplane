import { WorkspaceSettingsError } from "@batchplane/ui-client";
import { useState } from "react";
import { clearGitHubSession, writeGitHubSession } from "./github-session";
import { readRuntimeSession } from "./runtime-fixtures";

export function useGitHubConnection() {
  const [initialSession] = useState(readRuntimeSession);
  const [owner, setOwner] = useState(initialSession?.owner ?? "");
  const [repo, setRepo] = useState(initialSession?.repo ?? "");
  const [token, setToken] = useState(initialSession?.token ?? "");
  const [storedSession, setStoredSession] = useState(initialSession);
  const [error, setError] = useState<"requiredFields" | "unknown">();

  function save() {
    try {
      const session = writeGitHubSession({ owner, repo, token });
      setOwner(session.owner);
      setRepo(session.repo);
      setToken(session.token);
      setStoredSession(session);
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? "requiredFields" : "unknown");
      throw new WorkspaceSettingsError({ type: "invalid-input" });
    }
  }

  function clear() {
    clearGitHubSession();
    setToken("");
    setStoredSession(null);
    setError(undefined);
  }

  return {
    owner,
    repo,
    token,
    setOwner,
    setRepo,
    setToken,
    storedSession,
    error,
    save,
    clear,
  };
}
