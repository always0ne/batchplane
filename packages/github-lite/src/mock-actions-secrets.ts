import type { GitHubLiteClient, GitHubLiteMockState } from "./github-types.js";
import { GitHubLiteApiError } from "./github-types.js";
import { assertMockRepository, cloneJson } from "./mock-state.js";

export function createMockActionsSecretOperations(
  state: GitHubLiteMockState,
): Pick<
  GitHubLiteClient,
  "getActionsSecretPublicKey" | "getActionsSecret" | "putActionsSecret"
> {
  return {
    async getActionsSecretPublicKey(params) {
      assertMockRepository(state, params);
      return cloneJson(state.actionsSecretPublicKey);
    },
    async getActionsSecret(params) {
      assertMockRepository(state, params);
      return cloneJson(
        state.actionsSecrets.find((secret) => secret.name === params.name) ??
          null,
      );
    },
    async putActionsSecret(params) {
      assertMockRepository(state, params);
      if (
        params.keyId !== state.actionsSecretPublicKey.keyId ||
        !params.encryptedValue
      )
        throw new GitHubLiteApiError(
          "Invalid Actions secret upload.",
          "validation",
          422,
        );
      const now = new Date().toISOString();
      const previous = state.actionsSecrets.find(
        (secret) => secret.name === params.name,
      );
      state.actionsSecrets = state.actionsSecrets.filter(
        (secret) => secret.name !== params.name,
      );
      state.actionsSecrets.push({
        name: params.name,
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
      });
    },
  };
}
