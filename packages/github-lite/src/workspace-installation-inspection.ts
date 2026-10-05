import type { GitHubLiteClient, RepoRef } from "./github-types.js";
import {
  buildLiteInstallationFiles,
  liteDispatcherWorkflowPath,
  liteSampleTargetWorkflowPath,
} from "./workspace-installation-templates.js";

export type LiteInstallationStatus = {
  installed: boolean;
  missingPaths: string[];
  outdatedPaths: string[];
  presentPaths: string[];
  requiredPaths: string[];
};

export type CheckLiteInstallationStatusParams = {
  client: Pick<GitHubLiteClient, "getFile">;
  ref: string;
  repo: RepoRef;
};

export async function checkLiteInstallationStatus({
  client,
  ref,
  repo,
}: CheckLiteInstallationStatusParams): Promise<LiteInstallationStatus> {
  const requiredFiles = buildLiteInstallationFiles();
  const files = await Promise.all(
    requiredFiles.map(async (file) => {
      const candidates = [file.path, ...(file.legacyPaths ?? [])];
      const presentFile = await findPresentInstallationFile({
        candidates,
        client,
        ref,
        repo,
      });

      const legacyFiles = await findPresentInstallationFiles({
        candidates: file.legacyPaths ?? [],
        client,
        ref,
        repo,
      });

      return {
        file,
        legacyFiles,
        presentFile,
      };
    }),
  );
  const presentPaths = files
    .map((result) => result.presentFile?.path)
    .filter((path): path is string => Boolean(path));
  const missingPaths = files
    .filter((result) => !result.presentFile)
    .map((result) => result.file.path);
  const outdatedPaths = files
    .filter(
      (result) =>
        result.presentFile &&
        isWorkflowInstallationFile(result.file.path) &&
        (result.presentFile.path !== result.file.path ||
          result.legacyFiles.length > 0 ||
          !isSameInstallationContent(
            result.presentFile.content,
            result.file.content,
          )),
    )
    .map((result) => result.file.path);

  return {
    installed: missingPaths.length === 0,
    missingPaths,
    outdatedPaths,
    presentPaths,
    requiredPaths: requiredFiles.map((file) => file.path),
  };
}

async function findPresentInstallationFile({
  candidates,
  client,
  ref,
  repo,
}: {
  candidates: string[];
  client: Pick<GitHubLiteClient, "getFile">;
  ref: string;
  repo: RepoRef;
}): Promise<{ content: string; path: string; sha: string } | null> {
  const files = await findPresentInstallationFiles({
    candidates,
    client,
    ref,
    repo,
  });

  return files[0] ?? null;
}

async function findPresentInstallationFiles({
  candidates,
  client,
  ref,
  repo,
}: {
  candidates: string[];
  client: Pick<GitHubLiteClient, "getFile">;
  ref: string;
  repo: RepoRef;
}): Promise<{ content: string; path: string; sha: string }[]> {
  const files: { content: string; path: string; sha: string }[] = [];

  for (const path of candidates) {
    const file = await client.getFile({ ...repo, path, ref });

    if (file) {
      files.push({
        content: file.content,
        path,
        sha: file.sha,
      });
    }
  }

  return files;
}

function isWorkflowInstallationFile(path: string): boolean {
  return (
    path === liteDispatcherWorkflowPath || path === liteSampleTargetWorkflowPath
  );
}

function isSameInstallationContent(left: string, right: string): boolean {
  return (
    normalizeInstallationContent(left) === normalizeInstallationContent(right)
  );
}

function normalizeInstallationContent(content: string): string {
  return content.trim().replace(/\r\n/g, "\n");
}
