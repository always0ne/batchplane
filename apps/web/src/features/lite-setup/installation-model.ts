import type {
  GitHubLiteClient,
  GitHubPullRequest,
  RepoRef,
} from "@batchtrail/github-lite";

export const liteDispatcherWorkflowPath =
  ".github/workflows/batchtrail-dispatcher.yml";

export type LiteInstallationFile = {
  content: string;
  path: string;
};

export type LiteInstallationStatus = {
  installed: boolean;
  missingPaths: string[];
  presentPaths: string[];
  requiredPaths: string[];
};

export type CheckLiteInstallationStatusParams = {
  client: Pick<GitHubLiteClient, "getFile">;
  ref: string;
  repo: RepoRef;
};

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

export type LiteInstallationPullRequestResult = {
  pullRequest: GitHubPullRequest;
  status: LiteInstallationStatus;
};

export function buildLiteInstallationFiles(): LiteInstallationFile[] {
  return [
    {
      path: liteDispatcherWorkflowPath,
      content: buildDispatcherWorkflowYaml(),
    },
    {
      path: ".batch-governance/README.md",
      content: buildGovernanceReadme(),
    },
    {
      path: ".batch-governance/batches/.gitkeep",
      content: "Batch definitions created by BatchTrail Repo Mode live here.\n",
    },
    {
      path: ".batch-governance/schedules/.gitkeep",
      content:
        "Schedule definitions created by BatchTrail Repo Mode live here.\n",
    },
  ];
}

export async function checkLiteInstallationStatus({
  client,
  ref,
  repo,
}: CheckLiteInstallationStatusParams): Promise<LiteInstallationStatus> {
  const requiredFiles = buildLiteInstallationFiles();
  const files = await Promise.all(
    requiredFiles.map(async (file) => ({
      file,
      exists: Boolean(await client.getFile({ ...repo, path: file.path, ref })),
    })),
  );
  const presentPaths = files
    .filter((result) => result.exists)
    .map((result) => result.file.path);
  const missingPaths = files
    .filter((result) => !result.exists)
    .map((result) => result.file.path);

  return {
    installed: missingPaths.length === 0,
    missingPaths,
    presentPaths,
    requiredPaths: requiredFiles.map((file) => file.path),
  };
}

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
    throw new Error("BatchTrail Repo Mode is already installed.");
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

export function createLiteInstallationBranchName(date = new Date()): string {
  const timestamp = date
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replaceAll(".", "")
    .replaceAll("T", "")
    .replaceAll("Z", "")
    .slice(0, 14);

  return `batchtrail/install/repo-mode-${timestamp}`;
}

export function buildLiteInstallationPullRequestTitle(): string {
  return "Install BatchTrail Repo Mode";
}

export function buildLiteInstallationPullRequestBody(missingPaths: string[]) {
  return [
    "## BatchTrail Repo Mode Installation",
    "",
    "This pull request installs the repository-side files required by BatchTrail GitHub Lite.",
    "",
    "### Added files",
    "",
    ...missingPaths.map((path) => `- \`${path}\``),
    "",
    "After this pull request is merged, BatchTrail approval comments can trigger the repository dispatcher workflow. The browser UI still creates requests and approval evidence; runtime dispatch remains owned by this repository workflow.",
  ].join("\n");
}

export function buildDispatcherWorkflowYaml(): string {
  return [
    "name: BatchTrail Dispatcher",
    "",
    "on:",
    "  issue_comment:",
    "    types: [created]",
    "",
    "permissions:",
    "  actions: write",
    "  contents: read",
    "  issues: write",
    "",
    "concurrency:",
    "  group: batchtrail-dispatch-${{ github.event.issue.number }}",
    "  cancel-in-progress: false",
    "",
    "jobs:",
    "  dispatch-approved-request:",
    "    if: startsWith(github.event.comment.body, '/bgcp approve ')",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - name: Dispatch approved BatchTrail execution",
    "        uses: always0ne/batchtrail/actions/dispatcher@main",
    "        with:",
    "          issue-number: ${{ github.event.issue.number }}",
    "          comment-id: ${{ github.event.comment.id }}",
    "          github-token: ${{ secrets.GITHUB_TOKEN }}",
    "",
  ].join("\n");
}

function buildGovernanceReadme(): string {
  return [
    "# BatchTrail Governance",
    "",
    "This directory stores BatchTrail Repo Mode definitions and audit evidence that are reviewed through GitHub pull requests and issues.",
    "",
    "- `batches/`: approved batch definitions and optional execution artifacts",
    "- `schedules/`: approved schedule definitions",
    "",
  ].join("\n");
}
