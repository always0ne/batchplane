import { describe, expect, it, vi } from "vitest";
import { createGitHubLiteClient } from "./github-client.js";

describe("GitHub Actions Secret transport", () => {
  it("maps repository ID, upload key and metadata and sends only the sealed value in the Secret PUT", async () => {
    const fetcher = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 987,
            owner: { login: "owner" },
            name: "repo",
            default_branch: "main",
            private: true,
            html_url: "https://example.test/repo",
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ key_id: "upload-id", key: "base64-key" }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            name: "BATCHPLANE_INPUT_KEY",
            created_at: "created",
            updated_at: "updated",
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = createGitHubLiteClient({ token: "test-token", fetcher });
    const repositoryRef = { owner: "owner", repo: "repo" };
    expect((await client.getRepository(repositoryRef)).id).toBe("987");
    expect(await client.getActionsSecretPublicKey(repositoryRef)).toEqual({
      keyId: "upload-id",
      key: "base64-key",
    });
    expect(
      await client.getActionsSecret({
        ...repositoryRef,
        name: "BATCHPLANE_INPUT_KEY",
      }),
    ).toEqual({
      name: "BATCHPLANE_INPUT_KEY",
      createdAt: "created",
      updatedAt: "updated",
    });
    await client.putActionsSecret({
      ...repositoryRef,
      name: "BATCHPLANE_INPUT_KEY",
      keyId: "upload-id",
      encryptedValue: "sealed-only",
    });
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "https://api.github.com/repos/owner/repo",
      "https://api.github.com/repos/owner/repo/actions/secrets/public-key",
      "https://api.github.com/repos/owner/repo/actions/secrets/BATCHPLANE_INPUT_KEY",
      "https://api.github.com/repos/owner/repo/actions/secrets/BATCHPLANE_INPUT_KEY",
    ]);
    expect(fetcher.mock.calls[3]![1]).toMatchObject({
      method: "PUT",
      body: JSON.stringify({
        encrypted_value: "sealed-only",
        key_id: "upload-id",
      }),
    });
  });

  it("distinguishes an absent Secret from denied access instead of allowing setup on a failed read", async () => {
    const fetcher = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "denied" }), { status: 403 }),
      );
    const client = createGitHubLiteClient({ token: "test-token", fetcher });
    const input = {
      owner: "owner",
      repo: "repo",
      name: "BATCHPLANE_INPUT_KEY",
    };
    expect(await client.getActionsSecret(input)).toBeNull();
    await expect(client.getActionsSecret(input)).rejects.toMatchObject({
      code: "forbidden",
      status: 403,
    });
  });
});
