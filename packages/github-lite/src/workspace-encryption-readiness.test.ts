import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createMockGitHubLiteClient } from "./mock-client.js";
import { GitHubLiteApiError } from "./github-types.js";
import {
  generateParameterEncryptionKey,
  parameterPrivateKeySecretName,
  type WorkspaceEncryptionConfiguration,
} from "./parameter-encryption.js";
import {
  buildWorkspaceEncryptionConfiguration,
  workspaceEncryptionConfigurationPath,
} from "./workspace-encryption-configuration.js";
import { loadWorkspaceEncryptionReadiness } from "./workspace-encryption-readiness.js";
import { createGitHubLiteWorkspaceClient } from "./workspace-client.js";

let configuration: WorkspaceEncryptionConfiguration;
beforeAll(async () => {
  configuration = (await generateParameterEncryptionKey()).configuration;
});
afterEach(() => {
  vi.restoreAllMocks();
});

function context() {
  const client = createMockGitHubLiteClient();
  client.state.currentUser.login = "developer";
  const repositoryRef = {
    owner: client.state.repository.owner,
    repo: client.state.repository.repo,
  };
  return { client, repositoryRef, ref: "main" };
}

function publish(input: ReturnType<typeof context>) {
  input.client.state.files.push({
    branch: "main",
    path: workspaceEncryptionConfigurationPath,
    sha: "applied-public-sha",
    content: buildWorkspaceEncryptionConfiguration(configuration),
  });
}

describe("Workspace sensitive-input readiness", () => {
  it("requires both applied public configuration and private-key registration while allowing ordinary read-only requesters", async () => {
    const input = context();
    const metadata = vi.spyOn(input.client, "getActionsSecret");
    const write = vi.spyOn(input.client, "putActionsSecret");
    const authority = vi.spyOn(input.client, "getRepositoryPermissionForUser");
    expect(await loadWorkspaceEncryptionReadiness(input)).toMatchObject({
      available: false,
      configuration: null,
      unavailableReason: "NOT_CONFIGURED",
    });
    expect(metadata).not.toHaveBeenCalled();
    publish(input);
    expect(await loadWorkspaceEncryptionReadiness(input)).toEqual({
      configuration,
      available: false,
      privateKeyStored: "ABSENT",
      unavailableReason: "KEY_NOT_REGISTERED",
    });
    input.client.state.actionsSecrets.push({
      name: parameterPrivateKeySecretName,
      createdAt: "created",
      updatedAt: "updated",
    });
    expect(await loadWorkspaceEncryptionReadiness(input)).toEqual({
      configuration,
      available: true,
      privateKeyStored: "PRESENT",
    });
    expect(authority).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(
      await createGitHubLiteWorkspaceClient(input).inspectWorkspaceEncryption(),
    ).toMatchObject({
      state: "SETUP_RECORDED",
      privateKeyStored: "PRESENT",
      configurationPublished: true,
      canInitialize: false,
    });
  });

  it.each(["forbidden", "transport"])(
    "keeps the public config but blocks sensitive inputs with STATUS_UNAVAILABLE after a %s metadata failure",
    async (condition) => {
      const input = context();
      publish(input);
      vi.spyOn(input.client, "getActionsSecret").mockRejectedValue(
        condition === "forbidden"
          ? new GitHubLiteApiError("denied", "forbidden", 403)
          : new TypeError("network unavailable"),
      );
      expect(await loadWorkspaceEncryptionReadiness(input)).toEqual({
        configuration,
        available: false,
        privateKeyStored: "UNKNOWN",
        unavailableReason: "STATUS_UNAVAILABLE",
      });
      expect(
        await createGitHubLiteWorkspaceClient(
          input,
        ).inspectWorkspaceEncryption(),
      ).toMatchObject({
        state: "STATUS_UNAVAILABLE",
        privateKeyStored: "UNKNOWN",
        canInitialize: false,
      });
    },
  );

  it.each(["invalid", "unreadable"])(
    "distinguishes %s configuration from an absent configuration instead of enabling sensitive use",
    async (condition) => {
      const input = context();
      if (condition === "invalid")
        input.client.state.files.push({
          branch: "main",
          path: workspaceEncryptionConfigurationPath,
          sha: "invalid",
          content: "version: 2\n",
        });
      else
        vi.spyOn(input.client, "getFile").mockRejectedValue(
          new TypeError("network unavailable"),
        );
      const metadata = vi.spyOn(input.client, "getActionsSecret");
      expect(await loadWorkspaceEncryptionReadiness(input)).toMatchObject({
        available: false,
        privateKeyStored: "UNKNOWN",
        unavailableReason:
          condition === "invalid"
            ? "INVALID_CONFIGURATION"
            : "STATUS_UNAVAILABLE",
      });
      expect(metadata).not.toHaveBeenCalled();
    },
  );

  it("reads only the caller's verified configuration revision and does not infer readiness from an unmerged pending config", async () => {
    const input = context();
    input.client.state.branches.pending = "pending-sha";
    input.client.state.files.push({
      branch: "pending",
      path: workspaceEncryptionConfigurationPath,
      sha: "pending-public",
      content: buildWorkspaceEncryptionConfiguration(configuration),
    });
    input.client.state.actionsSecrets.push({
      name: parameterPrivateKeySecretName,
      createdAt: "created",
      updatedAt: "updated",
    });
    expect(await loadWorkspaceEncryptionReadiness(input)).toMatchObject({
      available: false,
      unavailableReason: "NOT_CONFIGURED",
    });
    input.client.state.branches["verified-sha"] = "verified-sha";
    input.client.state.files.push({
      branch: "verified-sha",
      path: workspaceEncryptionConfigurationPath,
      sha: "verified-public",
      content: buildWorkspaceEncryptionConfiguration(configuration),
    });
    const repository = vi
      .spyOn(input.client, "getRepository")
      .mockRejectedValue(new Error("not required"));
    expect(
      await loadWorkspaceEncryptionReadiness({ ...input, ref: "verified-sha" }),
    ).toMatchObject({ available: true });
    expect(repository).not.toHaveBeenCalled();
  });
});
