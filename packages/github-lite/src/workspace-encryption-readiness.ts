import type {
  WorkspaceEncryptionStatus,
  WorkspaceEncryptionUnavailableReason,
} from "@batchplane/ui-client";
import type { GitHubRepositoryContext } from "./github-types.js";
import {
  parameterPrivateKeySecretName,
  type WorkspaceEncryptionConfiguration,
} from "./parameter-encryption.js";
import {
  loadWorkspaceEncryptionConfiguration,
  WorkspaceEncryptionConfigurationError,
} from "./workspace-encryption-configuration.js";

export type WorkspaceEncryptionReadiness = {
  configuration: WorkspaceEncryptionConfiguration | null;
  privateKeyStored: WorkspaceEncryptionStatus["privateKeyStored"];
  available: boolean;
  unavailableReason?: WorkspaceEncryptionUnavailableReason;
};

/** The caller supplies an applied revision; metadata is registration evidence, not a key match. */
export async function loadWorkspaceEncryptionReadiness(
  context: GitHubRepositoryContext & { ref?: string; configPath?: string },
): Promise<WorkspaceEncryptionReadiness> {
  let configuration: WorkspaceEncryptionConfiguration | null;
  try {
    configuration = await loadWorkspaceEncryptionConfiguration(context);
  } catch (error) {
    return {
      configuration: null,
      privateKeyStored: "UNKNOWN",
      available: false,
      unavailableReason:
        error instanceof WorkspaceEncryptionConfigurationError
          ? "INVALID_CONFIGURATION"
          : "STATUS_UNAVAILABLE",
    };
  }
  if (!configuration)
    return {
      configuration: null,
      privateKeyStored: "UNKNOWN",
      available: false,
      unavailableReason: "NOT_CONFIGURED",
    };
  const privateKeyStored = await loadWorkspacePrivateKeyRegistration(context);
  if (privateKeyStored === "PRESENT")
    return { configuration, privateKeyStored, available: true };
  return {
    configuration,
    privateKeyStored,
    available: false,
    unavailableReason:
      privateKeyStored === "ABSENT"
        ? "KEY_NOT_REGISTERED"
        : "STATUS_UNAVAILABLE",
  };
}

/** Interactive requesters need metadata read access, never Secret-write authority. */
export async function loadWorkspacePrivateKeyRegistration({
  client,
  repositoryRef,
}: GitHubRepositoryContext): Promise<
  WorkspaceEncryptionStatus["privateKeyStored"]
> {
  try {
    return (await client.getActionsSecret({
      ...repositoryRef,
      name: parameterPrivateKeySecretName,
    }))
      ? "PRESENT"
      : "ABSENT";
  } catch {
    return "UNKNOWN";
  }
}
