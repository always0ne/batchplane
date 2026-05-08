export const githubSessionStorageKey = "batchtrail.github.session.v1";

export type GitHubSession = {
  owner: string;
  repo: string;
  token: string;
};

export type GitHubSessionDraft = Partial<GitHubSession>;

export function readGitHubSession(
  storage: Pick<Storage, "getItem"> = window.sessionStorage,
): GitHubSession | null {
  const rawValue = storage.getItem(githubSessionStorageKey);

  if (!rawValue) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as GitHubSessionDraft;
    return normalizeGitHubSession(parsedValue);
  } catch {
    return null;
  }
}

export function writeGitHubSession(
  draft: GitHubSessionDraft,
  storage: Pick<Storage, "setItem"> = window.sessionStorage,
): GitHubSession {
  const session = normalizeGitHubSession(draft);

  if (!session) {
    throw new Error("GitHub owner, repository, and token are required.");
  }

  storage.setItem(githubSessionStorageKey, JSON.stringify(session));
  return session;
}

export function clearGitHubSession(
  storage: Pick<Storage, "removeItem"> = window.sessionStorage,
) {
  storage.removeItem(githubSessionStorageKey);
}

export function hasGitHubSession(
  storage: Pick<Storage, "getItem"> = window.sessionStorage,
): boolean {
  return readGitHubSession(storage) !== null;
}

export function redactGitHubToken(token: string): string {
  const trimmedToken = token.trim();

  if (trimmedToken.length <= 8) {
    return "****";
  }

  return `${trimmedToken.slice(0, 4)}****${trimmedToken.slice(-4)}`;
}

function normalizeGitHubSession(
  draft: GitHubSessionDraft,
): GitHubSession | null {
  const owner = draft.owner?.trim();
  const repo = draft.repo?.trim();
  const token = draft.token?.trim();

  if (!owner || !repo || !token) {
    return null;
  }

  return { owner, repo, token };
}
