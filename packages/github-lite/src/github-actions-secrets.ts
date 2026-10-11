import sodium from "libsodium-wrappers";
import type { GitHubRequester } from "./github-http.js";
import { GitHubLiteApiError, type GitHubLiteClient } from "./github-types.js";

export function createGitHubActionsSecretOperations({
  request,
}: GitHubRequester): Pick<
  GitHubLiteClient,
  "getActionsSecretPublicKey" | "getActionsSecret" | "putActionsSecret"
> {
  function base(owner: string, repo: string) {
    return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/secrets`;
  }
  return {
    async getActionsSecretPublicKey({ owner, repo }) {
      const result = await request<{ key_id: string; key: string }>(
        `${base(owner, repo)}/public-key`,
      );
      if (!result)
        throw new GitHubLiteApiError(
          "Actions upload key is unavailable.",
          "unknown",
          500,
        );
      return { keyId: result.key_id, key: result.key };
    },
    async getActionsSecret({ owner, repo, name }) {
      const result = await request<{
        name: string;
        created_at: string;
        updated_at: string;
      }>(
        `${base(owner, repo)}/${encodeURIComponent(name)}`,
        {},
        { allowNotFound: true },
      );
      return result
        ? {
            name: result.name,
            createdAt: result.created_at,
            updatedAt: result.updated_at,
          }
        : null;
    },
    async putActionsSecret({ owner, repo, name, encryptedValue, keyId }) {
      await request(`${base(owner, repo)}/${encodeURIComponent(name)}`, {
        method: "PUT",
        body: JSON.stringify({
          encrypted_value: encryptedValue,
          key_id: keyId,
        }),
      });
    },
  };
}

export async function sealGitHubActionsSecret(
  value: string,
  publicKey: string,
): Promise<string> {
  await sodium.ready;
  const plaintext = sodium.from_string(value);
  try {
    const key = sodium.from_base64(publicKey, sodium.base64_variants.ORIGINAL);
    return sodium.to_base64(
      sodium.crypto_box_seal(plaintext, key),
      sodium.base64_variants.ORIGINAL,
    );
  } finally {
    sodium.memzero(plaintext);
  }
}
