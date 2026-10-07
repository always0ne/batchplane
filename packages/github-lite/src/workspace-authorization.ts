import {
  defaultWorkspacePolicy,
  type WorkspacePolicy,
} from "@batchplane/domain";
import {
  type ApproverSelector,
  type RoleMapping,
  validateRoleMappingFile,
} from "./repository-schema.js";

import { parseRepositoryYaml } from "./repository-yaml.js";
import type { GitHubLiteClient, RepoRef } from "./github-types.js";
import { parseWorkspacePolicyFile } from "./inspection-context.js";
import { isSameGitHubLogin } from "./execution-request-evidence.js";

const workspacePolicyPath = ".batch-governance/workspace.yml";

/** Reads historical change authorization at the explicitly authoritative revision. */
export async function loadHistoricalWorkspacePolicy(
  client: GitHubLiteClient,
  repository: RepoRef,
  ref: string,
): Promise<WorkspacePolicy> {
  const file = await client.getFile({
    ...repository,
    path: workspacePolicyPath,
    ref,
  });

  if (!file) return defaultWorkspacePolicy;

  return parseWorkspacePolicyFile(file.content);
}

export async function loadWorkspaceRoles(
  client: GitHubLiteClient,
  repository: RepoRef,
  ref: string,
  configPath = ".batch-governance",
): Promise<RoleMapping> {
  const file = await client.getFile({
    ...repository,
    path: `${configPath.replace(/\/+$/u, "")}/policies/role-mapping.yml`,
    ref,
  });

  if (!file) throw new Error("Workspace role mapping is required.");

  const parsed = parseRepositoryYaml(file.content);
  const validated = parsed.ok ? validateRoleMappingFile(parsed.value) : null;

  if (!validated?.ok) throw new Error("Workspace role mapping is invalid.");

  return validated.value.spec;
}

export async function hasWorkspaceRole(
  client: GitHubLiteClient,
  repository: RepoRef,
  login: string,
  selector: ApproverSelector,
): Promise<boolean> {
  if (selector.githubUsers?.some((user) => isSameGitHubLogin(user, login)))
    return true;

  if (selector.repositoryRoles?.length) {
    const permission = await client.getRepositoryPermissionForUser({
      ...repository,
      username: login.trim().toLowerCase(),
    });

    if (
      isSameGitHubLogin(permission.username, login) &&
      selector.repositoryRoles.some(
        (role) =>
          role === permission.roleName?.toLowerCase() ||
          role === permission.permission.toLowerCase(),
      )
    ) {
      return true;
    }
  }

  if (!selector.githubTeams?.length) return false;

  const memberships = await Promise.all(
    selector.githubTeams.map((teamSlug) =>
      client.getTeamMembershipForUser({
        org: repository.owner,
        teamSlug,
        username: login.trim().toLowerCase(),
      }),
    ),
  );

  return memberships.some((membership) => membership?.state === "active");
}

/** Resolve once so policy and role proof cannot come from different branch revisions. */
export async function loadCurrentExecutionApprovalPolicy(
  client: GitHubLiteClient,
  repository: RepoRef,
  configPath = ".batch-governance",
) {
  const metadata = await client.getRepository(repository);
  const revision = await client.getBranchHeadSha({
    ...repository,
    branch: metadata.defaultBranch,
  });
  const [file, roleMapping] = await Promise.all([
    client.getFile({
      ...repository,
      path: `${configPath.replace(/\/+$/u, "")}/workspace.yml`,
      ref: revision,
    }),
    loadWorkspaceRoles(client, repository, revision, configPath),
  ]);
  return {
    policy: file
      ? parseWorkspacePolicyFile(file.content)
      : defaultWorkspacePolicy,
    roleMapping,
    revision,
  };
}
