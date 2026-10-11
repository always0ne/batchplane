import type { WorkspaceEncryptionStatus } from "@batchplane/ui-client";
import type { GitHubRepositoryContext } from "./github-types.js";
import type { WorkspaceEncryptionConfiguration } from "./parameter-encryption.js";
import { loadWorkspacePrivateKeyRegistration } from "./workspace-encryption-readiness.js";
import {
  hasWorkspaceRole,
  loadWorkspaceRoles,
} from "./workspace-authorization.js";
import {
  parseWorkspaceEncryptionConfiguration,
  workspaceEncryptionConfigurationPath,
} from "./workspace-encryption-configuration.js";

export const workspaceEncryptionBranchPrefix =
  "batchplane/workspace/parameter-encryption-";

export async function inspectWorkspaceEncryptionStatus(
  context: GitHubRepositoryContext,
): Promise<WorkspaceEncryptionStatus> {
  return (await inspectWorkspaceEncryptionEvidence(context)).status;
}

export async function inspectWorkspaceEncryptionEvidence(
  context: GitHubRepositoryContext,
) {
  const { client, repositoryRef } = context;
  const repository = await client.getRepository(repositoryRef);
  const user = await client.getCurrentUser();
  const revision = await client.getBranchHeadSha({
    ...repositoryRef,
    branch: repository.defaultBranch,
  });
  const authorized = await canManageWorkspaceEncryption(
    context,
    user.login,
    revision,
  );
  const publishedFile = await client.getFile({
    ...repositoryRef,
    ref: revision,
    path: workspaceEncryptionConfigurationPath,
  });
  const requests = (
    await client.listPullRequests({
      ...repositoryRef,
      base: repository.defaultBranch,
      state: "open",
    })
  ).filter((request) =>
    request.head.startsWith(workspaceEncryptionBranchPrefix),
  );
  const request = requests[0];
  const pendingFile = request
    ? await client.getFile({
        ...repositoryRef,
        ref: request.headSha ?? request.head,
        path: workspaceEncryptionConfigurationPath,
      })
    : null;
  let configuration: WorkspaceEncryptionConfiguration | null = null;
  let invalid = requests.length > 1;
  for (const file of [publishedFile, pendingFile]) {
    if (!file) continue;
    try {
      const parsed = await parseWorkspaceEncryptionConfiguration(file.content);
      if (configuration && configuration.keyId !== parsed.keyId) invalid = true;
      configuration ??= parsed;
    } catch {
      invalid = true;
    }
  }
  if (request && !pendingFile) invalid = true;
  let privateKeyStored: WorkspaceEncryptionStatus["privateKeyStored"] =
    "UNKNOWN";
  if (authorized || configuration)
    privateKeyStored = await loadWorkspacePrivateKeyRegistration(context);
  let state: WorkspaceEncryptionStatus["state"] = "NOT_CONFIGURED";
  if (invalid) state = "INVALID_CONFIGURATION";
  else if (privateKeyStored === "UNKNOWN" && (configuration || authorized))
    state = "STATUS_UNAVAILABLE";
  else if (configuration && privateKeyStored === "ABSENT") state = "INCOMPLETE";
  else if (!configuration && privateKeyStored === "PRESENT")
    state = "INCOMPLETE";
  else if (request) state = "PENDING_APPROVAL";
  else if (publishedFile) state = "SETUP_RECORDED";
  const status: WorkspaceEncryptionStatus = {
    state,
    ...(configuration ? { keyId: configuration.keyId } : {}),
    configurationPublished: Boolean(publishedFile),
    privateKeyStored,
    canInitialize:
      authorized && state === "NOT_CONFIGURED" && privateKeyStored === "ABSENT",
    canRetryUpload: false,
    ...(request
      ? {
          request: {
            label: `#${request.number} ${request.title}`,
            sourceUrl: request.url,
          },
        }
      : {}),
  };
  return {
    status,
    configuration,
    repository,
    user,
    revision,
    authorized,
    request,
  };
}

async function canManageWorkspaceEncryption(
  context: GitHubRepositoryContext,
  login: string,
  revision: string,
): Promise<boolean> {
  const { client, repositoryRef } = context;
  const permission = await client.getRepositoryPermissionForUser({
    ...repositoryRef,
    username: login.trim().toLowerCase(),
  });
  if (permission.username.toLowerCase() !== login.toLowerCase()) return false;
  if (permission.permission === "admin") return true;
  const roleFile = await client.getFile({
    ...repositoryRef,
    ref: revision,
    path: ".batch-governance/policies/role-mapping.yml",
  });
  if (!roleFile) return false;
  const roles = await loadWorkspaceRoles(client, repositoryRef, revision);
  return hasWorkspaceRole(client, repositoryRef, login, roles.roles.maintainer);
}
