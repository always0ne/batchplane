import type { WorkspacePolicy } from "@batchplane/domain";
import type { GitHubLiteClient, GitHubPullRequest, RepoRef } from "./index.js";
import {
  buildWorkspacePolicyYaml,
  liteWorkspacePolicyPath,
} from "./workspace-installation-templates.js";

export type CreateWorkspacePolicyPullRequestParams = {
  client: Pick<
    GitHubLiteClient,
    | "createBranch"
    | "createPullRequest"
    | "getBranchHeadSha"
    | "getFile"
    | "putFile"
  >;
  date?: Date;
  defaultBranch: string;
  policy: WorkspacePolicy;
  repo: RepoRef;
};

export async function createWorkspacePolicyPullRequest({
  client,
  date = new Date(),
  defaultBranch,
  policy,
  repo,
}: CreateWorkspacePolicyPullRequestParams): Promise<GitHubPullRequest> {
  const branch = createWorkspacePolicyBranchName(date);
  const title = buildWorkspacePolicyPullRequestTitle();
  const baseSha = await client.getBranchHeadSha({
    ...repo,
    branch: defaultBranch,
  });
  const currentFile = await client.getFile({
    ...repo,
    path: liteWorkspacePolicyPath,
    ref: defaultBranch,
  });

  await client.createBranch({ ...repo, branch, sha: baseSha });
  await client.putFile({
    ...repo,
    branch,
    content: buildWorkspacePolicyYaml(policy.approval.mode),
    message: title,
    path: liteWorkspacePolicyPath,
    ...(currentFile ? { sha: currentFile.sha } : {}),
  });

  return client.createPullRequest({
    ...repo,
    base: defaultBranch,
    body: buildWorkspacePolicyPullRequestBody(policy),
    head: branch,
    title,
  });
}

export function createWorkspacePolicyBranchName(date = new Date()): string {
  const timestamp = date
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replaceAll(".", "")
    .replaceAll("T", "")
    .replaceAll("Z", "")
    .slice(0, 14);

  return `batchplane/workspace/policy-${timestamp}`;
}

export function buildWorkspacePolicyPullRequestTitle(): string {
  return "Update BatchPlane Workspace policy";
}

export function buildWorkspacePolicyPullRequestBody(
  policy: WorkspacePolicy,
): string {
  return [
    "## BatchPlane Workspace Policy",
    "",
    "This pull request updates the Workspace policy used by BatchPlane Lite and Gate.",
    "",
    "### Approval mode",
    "",
    `- \`${policy.approval.mode}\``,
    "",
    "The browser UI does not store approval policy locally. After this pull request is merged, the UI and Gate read the same `.batch-governance/workspace.yml` evidence from the repository.",
  ].join("\n");
}
