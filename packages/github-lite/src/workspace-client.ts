import type {
  RepositoryPullRequest,
  RuntimeInstallationStatus,
  SettingsPort,
} from "@batchplane/domain";
import {
  WorkspaceSettingsError,
  type BatchPlaneClient,
  type WorkspaceChangeRequest,
  type WorkspaceInstallation,
} from "@batchplane/ui-client";
import { toProductReadError } from "./product-read-errors.js";

export function createGitHubLiteWorkspaceClient({
  settings,
}: {
  settings: SettingsPort;
}): Pick<
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
          settings.getCurrentUser(),
          settings.getRepository(),
        ]);
        const policy = await settings.getWorkspacePolicy({
          ref: repository.defaultBranch,
        });
        const installation = await settings.checkInstallationStatus({
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
    requestWorkspaceInstallation: () =>
      requestInstallation(settings, "install"),
    requestWorkspaceUpdate: () => requestInstallation(settings, "update"),
    requestWorkspacePolicyChange: ({ policy }) =>
      withWorkspaceErrorMapping(async () => {
        const repository = await settings.getRepository();
        const currentPolicy = await settings.getWorkspacePolicy({
          ref: repository.defaultBranch,
        });
        const request = await settings.createWorkspacePolicyPullRequest({
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
  settings: SettingsPort,
  kind: "install" | "update",
) {
  return withWorkspaceErrorMapping(async () => {
    const repository = await settings.getRepository();
    const input = { defaultBranch: repository.defaultBranch };
    const result =
      kind === "install"
        ? await settings.createInstallationPullRequest(input)
        : await settings.createInstallationUpdatePullRequest(input);
    return {
      request: toWorkspaceChangeRequest(result.pullRequest),
      installation: toWorkspaceInstallation(result.status),
    };
  });
}

function toWorkspaceInstallation(
  status: RuntimeInstallationStatus,
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
