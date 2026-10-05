import type {
  GitHubLiteClient,
  GitHubPullRequest,
  RepoRef,
} from "./github-types.js";
import {
  checkLiteInstallationStatus,
  type LiteInstallationStatus,
} from "./workspace-installation-inspection.js";
import {
  buildLiteInstallationFiles,
  type LiteInstallationFile,
} from "./workspace-installation-templates.js";

export type CreateLiteInstallationPullRequestParams = {
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
  repo: RepoRef;
};

export type CreateLiteInstallationUpdatePullRequestParams = Omit<
  CreateLiteInstallationPullRequestParams,
  "client"
> & {
  client: CreateLiteInstallationPullRequestParams["client"] &
    Pick<GitHubLiteClient, "deleteFile">;
};

export type LiteInstallationPullRequestResult = {
  pullRequest: GitHubPullRequest;
  status: LiteInstallationStatus;
};

export async function createLiteInstallationPullRequest({
  client,
  date = new Date(),
  defaultBranch,
  repo,
}: CreateLiteInstallationPullRequestParams): Promise<LiteInstallationPullRequestResult> {
  const status = await checkLiteInstallationStatus({
    client,
    ref: defaultBranch,
    repo,
  });

  if (status.installed) {
    throw new Error("BatchPlane Lite is already installed.");
  }

  const branch = createLiteInstallationBranchName(date);
  const baseSha = await client.getBranchHeadSha({
    ...repo,
    branch: defaultBranch,
  });

  await client.createBranch({ ...repo, branch, sha: baseSha });

  const filesByPath = new Map(
    buildLiteInstallationFiles().map((file) => [file.path, file]),
  );

  for (const path of status.missingPaths) {
    const file = filesByPath.get(path);

    if (!file) {
      continue;
    }

    await client.putFile({
      ...repo,
      branch,
      path: file.path,
      message: buildLiteInstallationPullRequestTitle(),
      content: file.content,
    });
  }

  const pullRequest = await client.createPullRequest({
    ...repo,
    title: buildLiteInstallationPullRequestTitle(),
    body: buildLiteInstallationPullRequestBody(status.missingPaths),
    head: branch,
    base: defaultBranch,
  });

  return { pullRequest, status };
}

export async function createLiteInstallationUpdatePullRequest({
  client,
  date = new Date(),
  defaultBranch,
  repo,
}: CreateLiteInstallationUpdatePullRequestParams): Promise<LiteInstallationPullRequestResult> {
  const status = await checkLiteInstallationStatus({
    client,
    ref: defaultBranch,
    repo,
  });

  if (!status.installed) {
    throw new Error(
      "BatchPlane Lite must be installed before it can be updated.",
    );
  }

  if (status.outdatedPaths.length === 0) {
    throw new Error("BatchPlane Lite installation workflows are up to date.");
  }

  const branch = createLiteInstallationUpdateBranchName(date);
  const title = buildLiteInstallationUpdatePullRequestTitle();
  const baseSha = await client.getBranchHeadSha({
    ...repo,
    branch: defaultBranch,
  });
  const filesByPath = new Map(
    buildLiteInstallationFiles().map((file) => [file.path, file]),
  );

  await client.createBranch({ ...repo, branch, sha: baseSha });

  for (const path of status.outdatedPaths) {
    const file = filesByPath.get(path);

    if (!file) {
      continue;
    }

    await replaceInstallationWorkflow({
      client,
      repo,
      defaultBranch,
      branch,
      title,
      file,
    });
  }

  const pullRequest = await client.createPullRequest({
    ...repo,
    title,
    body: buildLiteInstallationUpdatePullRequestBody(status.outdatedPaths),
    head: branch,
    base: defaultBranch,
  });

  return { pullRequest, status };
}

async function replaceInstallationWorkflow({
  client,
  repo,
  defaultBranch,
  branch,
  title,
  file,
}: {
  client: CreateLiteInstallationUpdatePullRequestParams["client"];
  repo: RepoRef;
  defaultBranch: string;
  branch: string;
  title: string;
  file: LiteInstallationFile;
}) {
  const currentFile = await client.getFile({
    ...repo,
    path: file.path,
    ref: defaultBranch,
  });
  await client.putFile({
    ...repo,
    branch,
    path: file.path,
    message: title,
    content: file.content,
    ...(currentFile ? { sha: currentFile.sha } : {}),
  });
  for (const legacyPath of file.legacyPaths ?? []) {
    const legacyFile = await client.getFile({
      ...repo,
      path: legacyPath,
      ref: branch,
    });
    if (!legacyFile) continue;
    await client.deleteFile({
      ...repo,
      branch,
      path: legacyPath,
      message: title,
      sha: legacyFile.sha,
    });
  }
}

export function createLiteInstallationBranchName(date = new Date()): string {
  const timestamp = date
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replaceAll(".", "")
    .replaceAll("T", "")
    .replaceAll("Z", "")
    .slice(0, 14);

  return `batchplane/install/lite-${timestamp}`;
}

export function createLiteInstallationUpdateBranchName(
  date = new Date(),
): string {
  const timestamp = date
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replaceAll(".", "")
    .replaceAll("T", "")
    .replaceAll("Z", "")
    .slice(0, 14);

  return `batchplane/workspace/update-${timestamp}`;
}

export function buildLiteInstallationPullRequestTitle(): string {
  return "Install BatchPlane Lite";
}

export function buildLiteInstallationUpdatePullRequestTitle(): string {
  return "Update BatchPlane Workspace workflows";
}

export function buildLiteInstallationPullRequestBody(missingPaths: string[]) {
  return [
    "## BatchPlane Lite Installation",
    "",
    "This pull request installs the repository-side files required by BatchPlane GitHub Lite.",
    "",
    "### Added files",
    "",
    ...missingPaths.map((path) => `- \`${path}\``),
    "",
    "After this pull request is merged, BatchPlane approval comments can trigger the repository dispatcher workflow. The browser UI still creates requests and approval evidence; runtime dispatch remains owned by this repository workflow.",
  ].join("\n");
}

export function buildLiteInstallationUpdatePullRequestBody(
  outdatedPaths: string[],
): string {
  return [
    "## BatchPlane Workspace Workflow Update",
    "",
    "This pull request updates repository-side workflow files generated by BatchPlane Lite.",
    "",
    "### Updated workflows",
    "",
    ...outdatedPaths.map((path) => `- \`${path}\``),
    "",
    "The browser UI does not dispatch governed batch workflows directly. Keeping these workflows current keeps dispatcher filtering and Gate handoff behavior aligned with the installed BatchPlane action version.",
    "",
    "Legacy BatchTrail workflow files are removed when a current BatchPlane workflow replaces them, preventing duplicate repository-side triggers.",
  ].join("\n");
}
