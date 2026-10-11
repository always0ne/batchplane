import sodium from "libsodium-wrappers";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createMockGitHubLiteClient } from "./mock-client.js";
import { createGitHubLiteWorkspaceClient } from "./workspace-client.js";
import * as encryption from "./parameter-encryption.js";
import {
  buildWorkspaceEncryptionConfiguration,
  loadWorkspaceEncryptionConfiguration,
  workspaceEncryptionConfigurationPath,
} from "./workspace-encryption-configuration.js";
import { GitHubLiteApiError } from "./github-types.js";

let generated: Awaited<
  ReturnType<typeof encryption.generateParameterEncryptionKey>
>;
let uploadKey: { publicKey: Uint8Array; privateKey: Uint8Array };
beforeAll(async () => {
  generated = await encryption.generateParameterEncryptionKey();
  await sodium.ready;
  uploadKey = sodium.crypto_box_keypair("uint8array");
});
afterEach(() => {
  vi.restoreAllMocks();
});

function context() {
  const client = createMockGitHubLiteClient();
  client.state.pullRequests = [];
  client.state.actionsSecretPublicKey.key = sodium.to_base64(
    uploadKey.publicKey,
    sodium.base64_variants.ORIGINAL,
  );
  const repositoryRef = {
    owner: client.state.repository.owner,
    repo: client.state.repository.repo,
  };
  return { client, repositoryRef };
}
function retainedGeneration() {
  return vi
    .spyOn(encryption, "generateParameterEncryptionKey")
    .mockResolvedValue(generated);
}

describe("Workspace encryption setup", () => {
  it("preserves a successful public request when follow-up inspection fails and retries without regenerating or creating another request", async () => {
    const input = context();
    const generation = retainedGeneration();
    const read = vi.spyOn(input.client, "getRepository");
    const create = input.client.createPullRequest.bind(input.client);
    const request = vi
      .spyOn(input.client, "createPullRequest")
      .mockImplementation(async (params) => {
        const created = await create(params);
        read.mockRejectedValueOnce(new TypeError("follow-up unavailable"));
        return created;
      });
    const upload = vi.spyOn(input.client, "putActionsSecret");
    const workspace = createGitHubLiteWorkspaceClient(input);
    const partial = await workspace.initializeWorkspaceEncryption();
    expect(partial).toMatchObject({
      upload: "NOT_ATTEMPTED",
      failureStage: "STATUS_CHECK",
      status: {
        state: "STATUS_UNAVAILABLE",
        canInitialize: false,
        canRetryUpload: true,
      },
    });
    expect(partial.status.request?.sourceUrl).toBe(
      input.client.state.pullRequests[0]!.url,
    );
    expect(upload).not.toHaveBeenCalled();
    read.mockRejectedValueOnce(new TypeError("still unavailable"));
    expect((await workspace.inspectWorkspaceEncryption()).request).toEqual(
      partial.status.request,
    );
    const retried = await workspace.initializeWorkspaceEncryption();
    expect(retried.upload).toBe("RECORDED");
    expect(retried.status.request).toEqual(partial.status.request);
    expect(generation).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledTimes(1);
  });
  it("creates a public-only approval request before uploading the same PKCS8 key as a sealed Actions Secret", async () => {
    const input = context();
    const generation = retainedGeneration();
    const putSecret = vi.spyOn(input.client, "putActionsSecret");
    const createRequest = vi.spyOn(input.client, "createPullRequest");
    const workspace = createGitHubLiteWorkspaceClient(input);
    const result = await workspace.initializeWorkspaceEncryption();
    expect(result.upload).toBe("RECORDED");
    expect(result.status).toMatchObject({
      state: "PENDING_APPROVAL",
      configurationPublished: false,
      privateKeyStored: "PRESENT",
      canInitialize: false,
      canRetryUpload: false,
    });
    expect(result.status.request?.sourceUrl).toBe(
      input.client.state.pullRequests[0]?.url,
    );
    expect(generation).toHaveBeenCalledTimes(1);
    expect(createRequest.mock.invocationCallOrder[0]!).toBeLessThan(
      putSecret.mock.invocationCallOrder[0]!,
    );
    const secret = putSecret.mock.calls[0]![0];
    expect(secret.name).toBe(encryption.parameterPrivateKeySecretName);
    const opened = sodium.crypto_box_seal_open(
      sodium.from_base64(
        secret.encryptedValue,
        sodium.base64_variants.ORIGINAL,
      ),
      uploadKey.publicKey,
      uploadKey.privateKey,
    );
    expect(sodium.to_string(opened) === generated.privateKey).toBe(true);
    const storedPublic = input.client.state.files.find(
      (file) => file.path === workspaceEncryptionConfigurationPath,
    )!;
    expect(storedPublic.content.includes("PRIVATE KEY")).toBe(false);
    expect(
      await loadWorkspaceEncryptionConfiguration({
        ...input,
        ref: storedPublic.branch,
      }),
    ).toEqual(generated.configuration);
    expect(
      input.client.state.files.some(
        (file) =>
          file.branch === "main" &&
          file.path === workspaceEncryptionConfigurationPath,
      ),
    ).toBe(false);
    expect(JSON.stringify(result).includes(generated.privateKey)).toBe(false);
    await workspace.initializeWorkspaceEncryption();
    expect(putSecret).toHaveBeenCalledTimes(1);
    expect(generation).toHaveBeenCalledTimes(1);
  });

  it("retains the existing request and retries the same private key after upload failure in the same client session", async () => {
    const input = context();
    const generation = retainedGeneration();
    const putSecret = vi
      .spyOn(input.client, "putActionsSecret")
      .mockRejectedValueOnce(
        new GitHubLiteApiError("denied", "forbidden", 403),
      );
    const createRequest = vi.spyOn(input.client, "createPullRequest");
    const workspace = createGitHubLiteWorkspaceClient(input);
    const failed = await workspace.initializeWorkspaceEncryption();
    expect(failed).toMatchObject({
      upload: "FAILED",
      error: { type: "access-denied" },
      status: {
        state: "INCOMPLETE",
        canRetryUpload: true,
        privateKeyStored: "ABSENT",
      },
    });
    expect((await workspace.inspectWorkspaceEncryption()).request).toEqual(
      failed.status.request,
    );
    const retried = await workspace.initializeWorkspaceEncryption();
    expect(retried.upload).toBe("RECORDED");
    expect(retried.status.request).toEqual(failed.status.request);
    expect(generation).toHaveBeenCalledTimes(1);
    expect(createRequest).toHaveBeenCalledTimes(1);
    for (const [secret] of putSecret.mock.calls) {
      const opened = sodium.crypto_box_seal_open(
        sodium.from_base64(
          secret.encryptedValue,
          sodium.base64_variants.ORIGINAL,
        ),
        uploadKey.publicKey,
        uploadKey.privateKey,
      );
      expect(sodium.to_string(opened) === generated.privateKey).toBe(true);
    }
  });

  it("reports an incomplete pending configuration on reconnect without regenerating or overwriting the lost key", async () => {
    const input = context();
    const generation = retainedGeneration();
    const putSecret = vi
      .spyOn(input.client, "putActionsSecret")
      .mockRejectedValueOnce(new Error("upload unavailable"));
    const first =
      await createGitHubLiteWorkspaceClient(
        input,
      ).initializeWorkspaceEncryption();
    const reconnected = createGitHubLiteWorkspaceClient(input);
    expect(await reconnected.inspectWorkspaceEncryption()).toMatchObject({
      state: "INCOMPLETE",
      request: first.status.request,
      canRetryUpload: false,
      canInitialize: false,
    });
    expect((await reconnected.initializeWorkspaceEncryption()).upload).toBe(
      "NOT_ATTEMPTED",
    );
    expect(generation).toHaveBeenCalledTimes(1);
    expect(putSecret).toHaveBeenCalledTimes(1);
    expect(input.client.state.pullRequests).toHaveLength(1);
  });

  it("does not overwrite a Secret that appeared after an uncertain upload failure", async () => {
    const input = context();
    const generation = retainedGeneration();
    const putSecret = vi
      .spyOn(input.client, "putActionsSecret")
      .mockRejectedValueOnce(new Error("response lost"));
    const workspace = createGitHubLiteWorkspaceClient(input);
    await workspace.initializeWorkspaceEncryption();
    input.client.state.actionsSecrets.push({
      name: encryption.parameterPrivateKeySecretName,
      createdAt: "2026-10-11",
      updatedAt: "2026-10-11",
    });
    const result = await workspace.initializeWorkspaceEncryption();
    expect(result).toMatchObject({
      upload: "NOT_ATTEMPTED",
      status: { state: "PENDING_APPROVAL", canRetryUpload: false },
    });
    expect(putSecret).toHaveBeenCalledTimes(1);
    expect(generation).toHaveBeenCalledTimes(1);
  });

  it("denies an ordinary requester setup before key generation or Secret API access", async () => {
    const input = context();
    input.client.state.currentUser.login = "developer";
    const generation = retainedGeneration();
    const metadata = vi.spyOn(input.client, "getActionsSecret");
    const upload = vi.spyOn(input.client, "putActionsSecret");
    const workspace = createGitHubLiteWorkspaceClient(input);
    expect((await workspace.inspectWorkspaceEncryption()).canInitialize).toBe(
      false,
    );
    await expect(
      workspace.initializeWorkspaceEncryption(),
    ).rejects.toMatchObject({ reason: { type: "access-denied" } });
    expect(metadata).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect(generation).not.toHaveBeenCalled();
  });

  it("records merged public configuration and saved-key metadata as setup evidence without claiming a key match", async () => {
    const input = context();
    retainedGeneration();
    const workspace = createGitHubLiteWorkspaceClient(input);
    await workspace.initializeWorkspaceEncryption();
    await input.client.mergePullRequest({
      ...input.repositoryRef,
      pullNumber: input.client.state.pullRequests[0]!.number,
    });
    const reconnected = createGitHubLiteWorkspaceClient(input);
    expect(await reconnected.inspectWorkspaceEncryption()).toEqual({
      state: "SETUP_RECORDED",
      keyId: generated.configuration.keyId,
      configurationPublished: true,
      privateKeyStored: "PRESENT",
      canInitialize: false,
      canRetryUpload: false,
    });
    expect((await reconnected.initializeWorkspaceEncryption()).upload).toBe(
      "NOT_ATTEMPTED",
    );
  });

  it("reports unknown setup status when an administrator cannot read Secret metadata and performs no writes", async () => {
    const input = context();
    input.client.state.repositoryPermissions[0]!.permission = "admin";
    vi.spyOn(input.client, "getActionsSecret").mockRejectedValue(
      new GitHubLiteApiError("denied", "forbidden", 403),
    );
    const generation = retainedGeneration();
    const workspace = createGitHubLiteWorkspaceClient(input);
    expect(await workspace.inspectWorkspaceEncryption()).toMatchObject({
      state: "STATUS_UNAVAILABLE",
      privateKeyStored: "UNKNOWN",
      canInitialize: false,
    });
    expect((await workspace.initializeWorkspaceEncryption()).upload).toBe(
      "NOT_ATTEMPTED",
    );
    expect(generation).not.toHaveBeenCalled();
  });

  it("serializes duplicate setup clicks into one key, one public request and one Secret upload", async () => {
    const input = context();
    const generation = retainedGeneration();
    const upload = vi.spyOn(input.client, "putActionsSecret");
    const workspace = createGitHubLiteWorkspaceClient(input);
    await Promise.all([
      workspace.initializeWorkspaceEncryption(),
      workspace.initializeWorkspaceEncryption(),
    ]);
    expect(generation).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(input.client.state.pullRequests).toHaveLength(1);
  });
});

describe("Workspace public encryption configuration", () => {
  it("loads a verified revision and custom configuration path without accessing Secrets or current repository metadata", async () => {
    const input = context();
    input.client.state.branches["verified-sha"] = "verified-sha";
    input.client.state.files.push({
      branch: "verified-sha",
      path: "governance/parameter-encryption.yml",
      sha: "public-file-sha",
      content: buildWorkspaceEncryptionConfiguration(generated.configuration),
    });
    const repository = vi
      .spyOn(input.client, "getRepository")
      .mockRejectedValue(new Error("not needed"));
    const secret = vi
      .spyOn(input.client, "getActionsSecret")
      .mockRejectedValue(new Error("not allowed"));
    expect(
      await loadWorkspaceEncryptionConfiguration({
        ...input,
        ref: "verified-sha",
        configPath: "governance/",
      }),
    ).toEqual(generated.configuration);
    expect(repository).not.toHaveBeenCalled();
    expect(secret).not.toHaveBeenCalled();
    expect(
      await loadWorkspaceEncryptionConfiguration({
        ...input,
        ref: "verified-sha",
      }),
    ).toBeNull();
  });

  it.each(["wrong-id", "private-field", "invalid-yaml", "wrong-version"])(
    "rejects %s public configuration without replacing it",
    async (condition) => {
      const input = context();
      const source = {
        ...generated.configuration,
        publicKey: { ...generated.configuration.publicKey },
      };
      let content = buildWorkspaceEncryptionConfiguration(source);
      if (condition === "wrong-id")
        content = content.replace(source.keyId, "changed-key-id");
      if (condition === "wrong-version")
        content = content.replace("version: 1", "version: 2");
      if (condition === "private-field") content += "privateKey: forbidden\n";
      if (condition === "invalid-yaml") content = "version: 1\nversion: 1\n";
      input.client.state.files.push({
        branch: "main",
        path: workspaceEncryptionConfigurationPath,
        sha: "invalid",
        content,
      });
      await expect(
        loadWorkspaceEncryptionConfiguration({ ...input, ref: "main" }),
      ).rejects.toThrow();
      const generation = retainedGeneration();
      const workspace = createGitHubLiteWorkspaceClient(input);
      expect((await workspace.inspectWorkspaceEncryption()).state).toBe(
        "INVALID_CONFIGURATION",
      );
      expect((await workspace.initializeWorkspaceEncryption()).upload).toBe(
        "NOT_ATTEMPTED",
      );
      expect(generation).not.toHaveBeenCalled();
      expect(
        input.client.state.files.find(
          (file) => file.path === workspaceEncryptionConfigurationPath,
        )?.content,
      ).toBe(content);
    },
  );
});
