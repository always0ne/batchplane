import { createGitHubLiteClient } from "./github-client.js";
import type { GitHubLiteClient } from "./github-types.js";
import { createChangeRequestOperations } from "./change-request-operations.js";

/** Composes the GitHub session with the concrete R2-A change-request flows. */
export function createGitHubLiteChangeRequestClient(
  session: { owner: string; repo: string; token: string },
  client: GitHubLiteClient = createGitHubLiteClient({ token: session.token }),
) {
  return createChangeRequestOperations(session, client);
}
