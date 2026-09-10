import { createGitHubLiteClient, type GitHubLiteClient } from "./index.js";
import { createGovernedChangeOperations } from "./governed-change-operations.js";

/** Composes the GitHub session with the concrete R2-A governed-change flows. */
export function createGitHubLiteGovernedChangeClient(
  session: { owner: string; repo: string; token: string },
  client: GitHubLiteClient = createGitHubLiteClient({ token: session.token }),
) {
  return createGovernedChangeOperations(session, client);
}
