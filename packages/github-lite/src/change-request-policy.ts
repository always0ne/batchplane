import {
  defaultWorkspacePolicy,
  type WorkspacePolicy,
} from "@batchplane/domain";
import {
  type ApproverSelector,
  type RoleMapping,
  validateRoleMappingFile,
  validateWorkspacePolicyFile,
} from "./repository-schema.js";

import { parseRepositoryYaml } from "./repository-yaml.js";
import type { GitHubLiteClient, RepoRef } from "./github-types.js";

const roleMappingPath = ".batch-governance/policies/role-mapping.yml";
const workspacePolicyPath = ".batch-governance/workspace.yml";

/** Reads Workspace policy at the explicitly authoritative repository revision. */
export async function loadChangeRequestPolicy(
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

  const parsed = parseRepositoryYaml(file.content);
  const validated = parsed.ok
    ? validateWorkspacePolicyFile(parsed.value)
    : null;

  return validated?.ok ? validated.value.spec : defaultWorkspacePolicy;
}

export async function loadChangeRequestRoles(
  client: GitHubLiteClient,
  repository: RepoRef,
  ref: string,
): Promise<RoleMapping> {
  const file = await client.getFile({
    ...repository,
    path: roleMappingPath,
    ref,
  });

  if (!file) throw new Error("Workspace role mapping is required.");

  const parsed = parseRepositoryYaml(file.content);
  const validated = parsed.ok ? validateRoleMappingFile(parsed.value) : null;

  if (!validated?.ok) throw new Error("Workspace role mapping is invalid.");

  return validated.value.spec;
}

export async function hasChangeRequestRole(
  client: GitHubLiteClient,
  repository: RepoRef,
  login: string,
  selector: ApproverSelector,
): Promise<boolean> {
  if (selector.githubUsers?.includes(login)) return true;

  if (selector.repositoryRoles?.length) {
    const permission = await client.getRepositoryPermissionForUser({
      ...repository,
      username: login,
    });

    if (
      selector.repositoryRoles.includes(
        permission.permission as "admin" | "maintain" | "write" | "triage",
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
        username: login,
      }),
    ),
  );

  return memberships.some((membership) => membership?.state === "active");
}
