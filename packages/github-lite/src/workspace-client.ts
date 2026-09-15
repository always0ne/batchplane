import type { LiteInstallationStatus } from "./workspace-installation-inspection.js";
import type { GitHubRepositoryContext } from "./github-types.js";
import { loadWorkspacePolicy } from "./inspection-context.js";
import { checkLiteInstallationStatus } from "./workspace-installation-inspection.js";
import {
  createLiteInstallationPullRequest,
  createLiteInstallationUpdatePullRequest,
} from "./workspace-installation-requests.js";
import { createWorkspacePolicyPullRequest } from "./workspace-policy-request.js";
import type { RepositoryPullRequest } from "./repository-evidence-types.js";
import {
  WorkspaceSettingsError,
  type BatchPlaneClient,
  type WorkspaceChangeRequest,
  type WorkspaceInstallation,
} from "@batchplane/ui-client";
import { toProductReadError } from "./product-read-errors.js";

export function createGitHubLiteWorkspaceClient(
  context: GitHubRepositoryContext,
): Pick<
  BatchPlaneClient,
  | "inspectWorkspace"
  | "requestWorkspaceInstallation"
  | "requestWorkspaceUpdate"
  | "requestWorkspacePolicyChange"
> {
  return {
    inspectWorkspace: () =>
      withWorkspaceErrorMapping(async () => {
        const [user, repository] = await Promise.all([
          context.client.getCurrentUser(),
          context.client.getRepository(context.repositoryRef),
        ]);
        const policy = await loadWorkspacePolicy({
          ...context,
          ref: repository.defaultBranch,
        });
        const installation = await checkLiteInstallationStatus({
          client: context.client,
          repo: context.repositoryRef,
          ref: repository.defaultBranch,
        });
        return {
          connection: {
            label: `${repository.owner}/${repository.repo}`,
            currentUser: user.login,
            defaultRevision: repository.defaultBranch,
          },
          installation: toWorkspaceInstallation(installation),
          policy,
        };
      }),
    requestWorkspaceInstallation: () => requestInstallation(context, "install"),
    requestWorkspaceUpdate: () => requestInstallation(context, "update"),
    requestWorkspacePolicyChange: ({ policy }) =>
      withWorkspaceErrorMapping(async () => {
        const repository = await context.client.getRepository(
          context.repositoryRef,
        );
        const currentPolicy = await loadWorkspacePolicy({
          ...context,
          ref: repository.defaultBranch,
        });
        const request = await createWorkspacePolicyPullRequest({
          client: context.client,
          repo: context.repositoryRef,
          defaultBranch: repository.defaultBranch,
          policy,
        });
        return {
          currentPolicy,
          requestedPolicy: policy,
          request: toWorkspaceChangeRequest(request),
        };
      }),
  };
}

async function requestInstallation(
  context: GitHubRepositoryContext,
  kind: "install" | "update",
) {
  return withWorkspaceErrorMapping(async () => {
    const repository = await context.client.getRepository(
      context.repositoryRef,
    );
    const input = {
      client: context.client,
      repo: context.repositoryRef,
      defaultBranch: repository.defaultBranch,
    };
    const result =
      kind === "install"
        ? await createLiteInstallationPullRequest(input)
        : await createLiteInstallationUpdatePullRequest(input);
    return {
      request: toWorkspaceChangeRequest(result.pullRequest),
      installation: toWorkspaceInstallation(result.status),
    };
  });
}

function toWorkspaceInstallation(
  status: LiteInstallationStatus,
): WorkspaceInstallation {
  return {
    availableRequest: !status.installed
      ? "INSTALL"
      : status.outdatedPaths?.length
        ? "UPDATE"
        : null,
    installed: status.installed,
    requiredEvidence: status.requiredPaths,
    presentEvidence: status.presentPaths,
    missingEvidence: status.missingPaths,
    outdatedEvidence: status.outdatedPaths ?? [],
  };
}

function toWorkspaceChangeRequest(
  request: RepositoryPullRequest,
): WorkspaceChangeRequest {
  return {
    label: `#${request.number} ${request.title}`,
    sourceUrl: request.url,
  };
}

async function withWorkspaceErrorMapping<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw new WorkspaceSettingsError(toProductReadError(error));
  }
}
