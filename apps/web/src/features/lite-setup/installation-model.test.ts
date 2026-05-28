import type {
  GitHubLiteClient,
  GitHubPullRequest,
} from "@batchplane/github-lite";
import { parseYamlDocument, validateRoleMappingFile } from "@batchplane/domain";
import { describe, expect, it } from "vitest";

import {
  buildDispatcherWorkflowYaml,
  buildRoleMappingYaml,
  buildSampleTargetWorkflowYaml,
  buildWorkspacePolicyYaml,
  checkLiteInstallationStatus,
  createLiteInstallationPullRequest,
  createWorkspacePolicyPullRequest,
  liteDispatcherWorkflowPath,
  liteRoleMappingPath,
  liteSampleTargetWorkflowPath,
  liteWorkspacePolicyPath,
} from "./installation-model";

describe("Lite installation model", () => {
  it("detects missing repository-side installation files", async () => {
    const client = {
      getFile: async ({ path }: { path: string }) =>
        path === ".batch-governance/README.md"
          ? { path, content: "readme", sha: "sha-readme" }
          : null,
    } satisfies Pick<GitHubLiteClient, "getFile">;

    await expect(
      checkLiteInstallationStatus({
        client,
        ref: "main",
        repo: { owner: "always0ne", repo: "batch" },
      }),
    ).resolves.toEqual({
      installed: false,
      missingPaths: [
        liteDispatcherWorkflowPath,
        liteSampleTargetWorkflowPath,
        liteWorkspacePolicyPath,
        liteRoleMappingPath,
        ".batch-governance/batches/.gitkeep",
        ".batch-governance/schedules/.gitkeep",
      ],
      presentPaths: [".batch-governance/README.md"],
      requiredPaths: [
        liteDispatcherWorkflowPath,
        liteSampleTargetWorkflowPath,
        ".batch-governance/README.md",
        liteWorkspacePolicyPath,
        liteRoleMappingPath,
        ".batch-governance/batches/.gitkeep",
        ".batch-governance/schedules/.gitkeep",
      ],
    });
  });

  it("creates an installation pull request for missing files", async () => {
    const calls: string[] = [];
    const pullRequest: GitHubPullRequest = {
      author: "always0ne",
      base: "main",
      body: "body",
      head: "batchplane/install/lite-20260513010203",
      merged: false,
      number: 41,
      state: "open",
      title: "Install BatchPlane Lite",
      url: "https://github.com/always0ne/batch/pull/41",
    };
    const client = {
      getFile: async () => null,
      getBranchHeadSha: async ({ branch }) => {
        calls.push(`get-head:${branch}`);
        return "base-sha";
      },
      createBranch: async ({ branch, sha }) => {
        calls.push(`create-branch:${branch}:${sha}`);
      },
      putFile: async ({ path, content }) => {
        calls.push(`put-file:${path}`);
        if (path === liteDispatcherWorkflowPath) {
          expect(content).toContain("issue_comment:");
          expect(content).toContain("actions: write");
          expect(content).toContain("concurrency:");
          expect(content).toContain(
            "group: batchplane-dispatch-${{ github.event.issue.number }}",
          );
          expect(content).toContain(
            "always0ne/batchplane/actions/dispatcher@main",
          );
        }
        if (path === liteSampleTargetWorkflowPath) {
          expect(content).toContain("workflow_dispatch:");
          expect(content).toContain(
            "run-name: BatchPlane ${{ inputs.batch_id }} ${{ inputs.request_id }}",
          );
          expect(content).toContain("request_id:");
          expect(content).toContain("request_digest:");
          expect(content).toContain("batchplane-gate:");
          expect(content).toContain("needs: batchplane-gate");
          expect(content).toContain(
            "uses: always0ne/batchplane/actions/gate@main",
          );
        }
        if (path === liteWorkspacePolicyPath) {
          expect(content).toContain('kind: "WorkspacePolicy"');
          expect(content).toContain('mode: "SELF_APPROVAL_BLOCKED"');
        }
        if (path === liteRoleMappingPath) {
          expect(content).toContain('kind: "RoleMapping"');
          expect(content).toContain('repositoryRoles: ["maintain", "admin"]');
        }
        return { path, sha: `sha-${path}` };
      },
      createPullRequest: async ({ title, head, base }) => {
        calls.push(`create-pr:${title}:${head}:${base}`);
        return pullRequest;
      },
    } satisfies Pick<
      GitHubLiteClient,
      | "createBranch"
      | "createPullRequest"
      | "getBranchHeadSha"
      | "getFile"
      | "putFile"
    >;

    await expect(
      createLiteInstallationPullRequest({
        client,
        date: new Date("2026-05-13T01:02:03.000Z"),
        defaultBranch: "main",
        repo: { owner: "always0ne", repo: "batch" },
      }),
    ).resolves.toEqual({
      pullRequest,
      status: {
        installed: false,
        missingPaths: [
          liteDispatcherWorkflowPath,
          liteSampleTargetWorkflowPath,
          ".batch-governance/README.md",
          liteWorkspacePolicyPath,
          liteRoleMappingPath,
          ".batch-governance/batches/.gitkeep",
          ".batch-governance/schedules/.gitkeep",
        ],
        presentPaths: [],
        requiredPaths: [
          liteDispatcherWorkflowPath,
          liteSampleTargetWorkflowPath,
          ".batch-governance/README.md",
          liteWorkspacePolicyPath,
          liteRoleMappingPath,
          ".batch-governance/batches/.gitkeep",
          ".batch-governance/schedules/.gitkeep",
        ],
      },
    });
    expect(calls).toEqual([
      "get-head:main",
      "create-branch:batchplane/install/lite-20260513010203:base-sha",
      `put-file:${liteDispatcherWorkflowPath}`,
      `put-file:${liteSampleTargetWorkflowPath}`,
      "put-file:.batch-governance/README.md",
      `put-file:${liteWorkspacePolicyPath}`,
      `put-file:${liteRoleMappingPath}`,
      "put-file:.batch-governance/batches/.gitkeep",
      "put-file:.batch-governance/schedules/.gitkeep",
      "create-pr:Install BatchPlane Lite:batchplane/install/lite-20260513010203:main",
    ]);
  });

  it("keeps dispatcher workflow dispatch responsibility inside the target repo", () => {
    expect(buildDispatcherWorkflowYaml()).toContain(
      "if: startsWith(github.event.comment.body, '/bgcp approve ')",
    );
    expect(buildDispatcherWorkflowYaml()).toContain(
      "github-token: ${{ secrets.GITHUB_TOKEN }}",
    );
    expect(buildDispatcherWorkflowYaml()).toContain(
      "group: batchplane-dispatch-${{ github.event.issue.number }}",
    );
  });

  it("ships a sample target workflow that requires Gate approval evidence", () => {
    expect(buildSampleTargetWorkflowYaml()).toContain("request_id:");
    expect(buildSampleTargetWorkflowYaml()).toContain("request_digest:");
    expect(buildSampleTargetWorkflowYaml()).toContain(
      "request-id: ${{ inputs.request_id }}",
    );
    expect(buildSampleTargetWorkflowYaml()).toContain(
      "request-digest: ${{ inputs.request_digest }}",
    );
    expect(buildSampleTargetWorkflowYaml()).toContain(
      "approval-ref: ${{ inputs.request_id }}",
    );
    expect(buildSampleTargetWorkflowYaml()).toContain("needs: batchplane-gate");
  });

  it("ships a strict Workspace policy by default", () => {
    expect(buildWorkspacePolicyYaml()).toContain('kind: "WorkspacePolicy"');
    expect(buildWorkspacePolicyYaml()).toContain(
      'mode: "SELF_APPROVAL_BLOCKED"',
    );
  });

  it("ships a default role mapping for maintainer approvals", () => {
    const parsed = parseYamlDocument(buildRoleMappingYaml());

    expect(parsed.ok).toBe(true);
    expect(parsed.ok ? validateRoleMappingFile(parsed.value).ok : false).toBe(
      true,
    );
    expect(buildRoleMappingYaml()).toContain('kind: "RoleMapping"');
    expect(buildRoleMappingYaml()).toContain(
      'repositoryRoles: ["maintain", "admin"]',
    );
  });

  it("creates a Workspace policy change pull request", async () => {
    const calls: string[] = [];
    const pullRequest: GitHubPullRequest = {
      author: "always0ne",
      base: "main",
      body: "body",
      head: "batchplane/workspace/policy-20260513010203",
      merged: false,
      number: 42,
      state: "open",
      title: "Update BatchPlane Workspace policy",
      url: "https://github.com/always0ne/batch/pull/42",
    };
    const client = {
      getFile: async ({ path }) => {
        calls.push(`get-file:${path}`);
        return {
          content: buildWorkspacePolicyYaml("SELF_APPROVAL_BLOCKED"),
          path,
          sha: "workspace-policy-sha",
        };
      },
      getBranchHeadSha: async ({ branch }) => {
        calls.push(`get-head:${branch}`);
        return "base-sha";
      },
      createBranch: async ({ branch, sha }) => {
        calls.push(`create-branch:${branch}:${sha}`);
      },
      putFile: async ({ path, content, sha }) => {
        calls.push(`put-file:${path}:${sha ?? ""}`);
        expect(content).toContain('mode: "SELF_APPROVAL_ALLOWED"');
        return { path, sha: `sha-${path}` };
      },
      createPullRequest: async ({ title, head, base, body }) => {
        calls.push(`create-pr:${title}:${head}:${base}`);
        expect(body).toContain("SELF_APPROVAL_ALLOWED");
        return pullRequest;
      },
    } satisfies Pick<
      GitHubLiteClient,
      | "createBranch"
      | "createPullRequest"
      | "getBranchHeadSha"
      | "getFile"
      | "putFile"
    >;

    await expect(
      createWorkspacePolicyPullRequest({
        client,
        date: new Date("2026-05-13T01:02:03.000Z"),
        defaultBranch: "main",
        policy: { approval: { mode: "SELF_APPROVAL_ALLOWED" } },
        repo: { owner: "always0ne", repo: "batch" },
      }),
    ).resolves.toEqual(pullRequest);
    expect(calls).toEqual([
      "get-head:main",
      `get-file:${liteWorkspacePolicyPath}`,
      "create-branch:batchplane/workspace/policy-20260513010203:base-sha",
      `put-file:${liteWorkspacePolicyPath}:workspace-policy-sha`,
      "create-pr:Update BatchPlane Workspace policy:batchplane/workspace/policy-20260513010203:main",
    ]);
  });
});
