import type {
  GitHubLiteClient,
  GitHubPullRequest,
  RepoRef,
} from "@batchplane/github-lite";
import type {
  WorkspaceApprovalMode,
  WorkspacePolicy,
} from "@batchplane/domain";

import {
  batchPlaneDispatcherActionRef,
  batchPlaneGateActionRef,
} from "../../shared/github-action-references";

export const liteDispatcherWorkflowPath =
  ".github/workflows/batchplane-dispatcher.yml";
export const legacyLiteDispatcherWorkflowPath =
  ".github/workflows/batchtrail-dispatcher.yml";
export const liteSampleTargetWorkflowPath =
  ".github/workflows/batchplane-sample-target.yml";
export const legacyLiteSampleTargetWorkflowPath =
  ".github/workflows/batchtrail-sample-target.yml";
export const liteWorkspacePolicyPath = ".batch-governance/workspace.yml";
export const liteRoleMappingPath =
  ".batch-governance/policies/role-mapping.yml";

export type LiteInstallationFile = {
  content: string;
  legacyPaths?: string[];
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

export type LiteInstallationPullRequestResult = {
  pullRequest: GitHubPullRequest;
  status: LiteInstallationStatus;
};

export function buildLiteInstallationFiles(): LiteInstallationFile[] {
  return [
    {
      path: liteDispatcherWorkflowPath,
      legacyPaths: [legacyLiteDispatcherWorkflowPath],
      content: buildDispatcherWorkflowYaml(),
    },
    {
      path: liteSampleTargetWorkflowPath,
      legacyPaths: [legacyLiteSampleTargetWorkflowPath],
      content: buildSampleTargetWorkflowYaml(),
    },
    {
      path: ".batch-governance/README.md",
      content: buildGovernanceReadme(),
    },
    {
      path: liteWorkspacePolicyPath,
      content: buildWorkspacePolicyYaml(),
    },
    {
      path: liteRoleMappingPath,
      content: buildRoleMappingYaml(),
    },
    {
      path: ".batch-governance/batches/.gitkeep",
      content: "Batch definitions created by BatchPlane Lite live here.\n",
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
    requiredFiles.map(async (file) => {
      const candidates = [file.path, ...(file.legacyPaths ?? [])];
      const presentPath = await findPresentInstallationPath({
        candidates,
        client,
        ref,
        repo,
      });

      return {
        file,
        presentPath,
      };
    }),
  );
  const presentPaths = files
    .map((result) => result.presentPath)
    .filter((path): path is string => Boolean(path));
  const missingPaths = files
    .filter((result) => !result.presentPath)
    .map((result) => result.file.path);

  return {
    installed: missingPaths.length === 0,
    missingPaths,
    presentPaths,
    requiredPaths: requiredFiles.map((file) => file.path),
  };
}

async function findPresentInstallationPath({
  candidates,
  client,
  ref,
  repo,
}: {
  candidates: string[];
  client: Pick<GitHubLiteClient, "getFile">;
  ref: string;
  repo: RepoRef;
}): Promise<string | null> {
  for (const path of candidates) {
    const file = await client.getFile({ ...repo, path, ref });

    if (file) {
      return path;
    }
  }

  return null;
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

export function buildLiteInstallationPullRequestTitle(): string {
  return "Install BatchPlane Lite";
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
    "This pull request updates the repository-backed Workspace policy used by BatchPlane Lite and Gate.",
    "",
    "### Approval mode",
    "",
    `- \`${policy.approval.mode}\``,
    "",
    "The browser UI does not store approval policy locally. After this pull request is merged, the UI and Gate read the same `.batch-governance/workspace.yml` evidence from the repository.",
  ].join("\n");
}

export function buildWorkspacePolicyYaml(
  mode: WorkspaceApprovalMode = "SELF_APPROVAL_BLOCKED",
): string {
  return [
    'apiVersion: "batchplane.io/v1"',
    'kind: "WorkspacePolicy"',
    "metadata:",
    '  id: "default"',
    "spec:",
    "  approval:",
    `    mode: "${mode}"`,
    "",
  ].join("\n");
}

export function buildRoleMappingYaml(): string {
  return [
    'apiVersion: "batchplane.io/v1"',
    'kind: "RoleMapping"',
    "metadata:",
    '  id: "default"',
    "spec:",
    "  roles:",
    "    requester:",
    '      repositoryRoles: ["write", "maintain", "admin"]',
    "    approver:",
    '      repositoryRoles: ["maintain", "admin"]',
    "    maintainer:",
    '      repositoryRoles: ["maintain", "admin"]',
    "    auditor:",
    '      repositoryRoles: ["triage"]',
    "",
  ].join("\n");
}

export function buildDispatcherWorkflowYaml(): string {
  return [
    "name: BatchPlane Dispatcher",
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
    "  group: batchplane-dispatch-${{ github.event.issue.number }}",
    "  cancel-in-progress: false",
    "",
    "jobs:",
    "  dispatch-approved-request:",
    "    if: startsWith(github.event.comment.body, '/bgcp approve ')",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - name: Dispatch approved BatchPlane execution",
    `        uses: ${batchPlaneDispatcherActionRef}`,
    "        with:",
    "          issue-number: ${{ github.event.issue.number }}",
    "          comment-id: ${{ github.event.comment.id }}",
    "          github-token: ${{ secrets.GITHUB_TOKEN }}",
    "",
  ].join("\n");
}

export function buildSampleTargetWorkflowYaml(): string {
  return [
    "name: BatchPlane Sample Target",
    "run-name: BatchPlane ${{ inputs.batch_id }} ${{ inputs.request_id }}",
    "",
    "on:",
    "  workflow_dispatch:",
    "    inputs:",
    "      request_id:",
    "        description: BatchPlane execution request ID",
    "        required: true",
    "        type: string",
    "      batch_id:",
    "        description: BatchPlane batch ID",
    "        required: true",
    "        type: string",
    "      request_digest:",
    "        description: BatchPlane approved request digest",
    "        required: true",
    "        type: string",
    "      schedule_id:",
    "        description: BatchPlane schedule identifier for scheduled dispatches",
    "        required: false",
    "        type: string",
    "",
    "permissions:",
    "  contents: read",
    "  issues: read",
    "",
    "jobs:",
    "  batchplane-gate:",
    "    name: BatchPlane Gate",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - name: Verify approved execution evidence",
    `        uses: ${batchPlaneGateActionRef}`,
    "        with:",
    "          mode: lite",
    "          batch-id: ${{ inputs.batch_id }}",
    "          config-path: .batch-governance",
    "          request-id: ${{ inputs.request_id }}",
    "          approval-source: issue",
    "          approval-ref: ${{ inputs.request_id }}",
    "          request-digest: ${{ inputs.request_digest }}",
    "          schedule-id: ${{ inputs.schedule_id }}",
    "          github-token: ${{ secrets.GITHUB_TOKEN }}",
    "",
    "  run-sample-batch:",
    "    name: Run sample batch command",
    "    runs-on: ubuntu-latest",
    "    needs: batchplane-gate",
    "    steps:",
    "      - name: Checkout",
    "        uses: actions/checkout@v4",
    "      - name: Sample command",
    '        run: echo "BatchPlane approved sample execution"',
    "",
  ].join("\n");
}

function buildGovernanceReadme(): string {
  return [
    "# BatchPlane Governance",
    "",
    "This directory stores BatchPlane Lite definitions and audit evidence that are reviewed through GitHub pull requests and issues.",
    "",
    "- `batches/`: approved batch definitions and optional execution artifacts",
    "- `workspace.yml`: Workspace-level approval mode. Default is `SELF_APPROVAL_BLOCKED`; use `SELF_APPROVAL_ALLOWED` only when the repository intentionally permits requester approval.",
    "- `policies/role-mapping.yml`: repository-side approver role mapping used by Gate when self-approval is not explicitly allowed.",
    "- `.github/workflows/batchplane-sample-target.yml`: sample governed target workflow",
    "",
  ].join("\n");
}
