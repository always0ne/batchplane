import type {
  WorkspaceEncryptionSetupResult,
  WorkspaceEncryptionStatus,
  WorkspaceChangeRequest,
} from "@batchplane/ui-client";
import { WorkspaceSettingsError } from "@batchplane/ui-client";
import type { GitHubRepositoryContext } from "./github-types.js";
import {
  generateParameterEncryptionKey,
  parameterPrivateKeySecretName,
} from "./parameter-encryption.js";
import {
  buildWorkspaceEncryptionConfiguration,
  workspaceEncryptionConfigurationPath,
} from "./workspace-encryption-configuration.js";
import {
  inspectWorkspaceEncryptionEvidence,
  workspaceEncryptionBranchPrefix,
} from "./workspace-encryption-inspection.js";
import { sealGitHubActionsSecret } from "./github-actions-secrets.js";
import { toProductReadError } from "./product-read-errors.js";

type SetupSession = Awaited<
  ReturnType<typeof generateParameterEncryptionKey>
> & {
  repositoryId: string;
  login: string;
  branch: string;
  branchCreated: boolean;
  configurationWritten: boolean;
  request?: WorkspaceChangeRequest;
};

type EncryptionEvidence = Awaited<
  ReturnType<typeof inspectWorkspaceEncryptionEvidence>
>;

/** Only this client session retains a failed upload's original private key. */
export function createWorkspaceEncryptionSetup(
  context: GitHubRepositoryContext,
) {
  let session: SetupSession | undefined;
  let initializing: Promise<WorkspaceEncryptionSetupResult> | undefined;

  async function inspect(): Promise<WorkspaceEncryptionStatus> {
    try {
      const evidence = await inspectWorkspaceEncryptionEvidence(context);
      reconcileSessionRequest(evidence);
      return withRetryAvailability(evidence);
    } catch (error) {
      if (session?.request) return retainedRequestStatus();
      throw error;
    }
  }

  function retainedRequestStatus(): WorkspaceEncryptionStatus {
    return {
      state: "STATUS_UNAVAILABLE",
      configurationPublished: false,
      privateKeyStored: "UNKNOWN",
      canInitialize: false,
      canRetryUpload: true,
      keyId: session!.configuration.keyId,
      request: session!.request,
    };
  }

  function statusCheckFailure(error: unknown): WorkspaceEncryptionSetupResult {
    return {
      status: retainedRequestStatus(),
      upload: "NOT_ATTEMPTED",
      failureStage: "STATUS_CHECK",
      error: toProductReadError(error),
    };
  }

  function reconcileSessionRequest(evidence: EncryptionEvidence) {
    if (
      session &&
      evidence.request?.head === session.branch &&
      evidence.configuration?.keyId === session.configuration.keyId
    )
      session.request = evidence.status.request;
  }

  function withRetryAvailability(
    evidence: EncryptionEvidence,
  ): WorkspaceEncryptionStatus {
    const canRetryUpload = Boolean(
      session &&
      session.request &&
      evidence.authorized &&
      session.repositoryId === evidence.repository.id &&
      session.login === evidence.user.login &&
      evidence.configuration?.keyId === session.configuration.keyId &&
      evidence.status.state === "INCOMPLETE" &&
      evidence.status.privateKeyStored === "ABSENT",
    );
    return {
      ...evidence.status,
      canInitialize: evidence.status.canInitialize && !session?.request,
      canRetryUpload,
      ...(session?.request ? { request: session.request } : {}),
    };
  }

  async function initialize(): Promise<WorkspaceEncryptionSetupResult> {
    let evidence: EncryptionEvidence;
    try {
      evidence = await inspectWorkspaceEncryptionEvidence(context);
    } catch (error) {
      if (session?.request) return statusCheckFailure(error);
      throw error;
    }
    if (!evidence.authorized)
      throw new WorkspaceSettingsError({ type: "access-denied" });
    if (
      session &&
      (session.repositoryId !== evidence.repository.id ||
        session.login !== evidence.user.login)
    )
      throw new WorkspaceSettingsError({ type: "access-denied" });
    reconcileSessionRequest(evidence);
    if (
      !evidence.status.canInitialize &&
      !withRetryAvailability(evidence).canRetryUpload
    )
      return {
        status: withRetryAvailability(evidence),
        upload: "NOT_ATTEMPTED",
      };
    if (!session) {
      const generated = await generateParameterEncryptionKey();
      session = {
        ...generated,
        repositoryId: evidence.repository.id,
        login: evidence.user.login,
        branch: `${workspaceEncryptionBranchPrefix}${generated.configuration.keyId}`,
        branchCreated: false,
        configurationWritten: false,
      };
    }
    const retained = session;
    if (!retained.request) {
      await createPublicConfigurationRequest(context, retained, evidence);
    }
    // Re-read approval evidence and metadata before any write; never repair another setup.
    try {
      evidence = await inspectWorkspaceEncryptionEvidence(context);
    } catch (error) {
      return statusCheckFailure(error);
    }
    if (!withRetryAvailability(evidence).canRetryUpload)
      return {
        status: withRetryAvailability(evidence),
        upload: "NOT_ATTEMPTED",
      };
    try {
      const { client, repositoryRef } = context;
      const uploadKey = await client.getActionsSecretPublicKey(repositoryRef);
      const encryptedValue = await sealGitHubActionsSecret(
        retained.privateKey,
        uploadKey.key,
      );
      // GitHub's PUT is an upsert. Refuse any existing Secret, even on a manual retry.
      if (
        await client.getActionsSecret({
          ...repositoryRef,
          name: parameterPrivateKeySecretName,
        })
      )
        return { status: await inspect(), upload: "NOT_ATTEMPTED" };
      await client.putActionsSecret({
        ...repositoryRef,
        name: parameterPrivateKeySecretName,
        keyId: uploadKey.keyId,
        encryptedValue,
      });
      session = undefined;
    } catch (error) {
      return {
        status: withRetryAvailability(evidence),
        upload: "FAILED",
        failureStage: "PRIVATE_KEY_UPLOAD",
        error: toProductReadError(error),
      };
    }
    return {
      upload: "RECORDED",
      status: {
        ...evidence.status,
        state: evidence.status.configurationPublished
          ? "SETUP_RECORDED"
          : "PENDING_APPROVAL",
        privateKeyStored: "PRESENT",
        canInitialize: false,
        canRetryUpload: false,
        request: retained.request,
      },
    };
  }

  return {
    inspectWorkspaceEncryption: inspect,
    initializeWorkspaceEncryption() {
      if (!initializing) {
        initializing = initialize().finally(() => {
          initializing = undefined;
        });
      }
      return initializing;
    },
  };
}

async function createPublicConfigurationRequest(
  context: GitHubRepositoryContext,
  session: SetupSession,
  evidence: EncryptionEvidence,
) {
  const { client, repositoryRef } = context;
  const title = "Set up BatchPlane Workspace encryption";
  if (!session.branchCreated) {
    await client.createBranch({
      ...repositoryRef,
      branch: session.branch,
      sha: evidence.revision,
    });
    session.branchCreated = true;
  }
  if (!session.configurationWritten) {
    await client.putFile({
      ...repositoryRef,
      branch: session.branch,
      path: workspaceEncryptionConfigurationPath,
      message: title,
      content: buildWorkspaceEncryptionConfiguration(session.configuration),
    });
    session.configurationWritten = true;
  }
  const request = await client.createPullRequest({
    ...repositoryRef,
    head: session.branch,
    base: evidence.repository.defaultBranch,
    title,
    body: "## BatchPlane Workspace Encryption\n\nThis request adds the public encryption configuration through the normal Workspace approval workflow. The private key is uploaded separately and is never included in this request. Merge after setup is recorded; setup metadata is not proof of runner decryption.\n",
  });
  session.request = {
    label: `#${request.number} ${request.title}`,
    sourceUrl: request.url,
  };
}
