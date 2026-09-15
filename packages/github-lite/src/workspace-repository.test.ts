import { describe, expect, it } from "vitest";
import { createGitHubLiteMockState } from "./mock-state.js";
import { createMockGitHubLiteClient } from "./mock-client.js";
import { createGitHubLiteBatchPlaneClient } from "./product-client.js";
import { parseGovernanceYaml } from "./governance-yaml.js";
import {
  buildSampleTargetWorkflowYaml,
  buildWorkspacePolicyYaml,
} from "./workspace-installation-templates.js";
const session = { owner: "always0ne", repo: "batch" };
describe("Workspace repository integration", () => {
  it("reads Workspace policy from repository configuration", async () => {
    const state = createGitHubLiteMockState();
    state.files.push({
      branch: "main",
      content: [
        'apiVersion: "batchplane.io/v1"',
        'kind: "WorkspacePolicy"',
        "metadata:",
        '  id: "default"',
        "spec:",
        "  approval:",
        '    mode: "SELF_APPROVAL_ALLOWED"',
        "",
      ].join("\n"),
      path: ".batch-governance/workspace.yml",
      sha: "workspace-policy-sha",
    });
    const client = createMockGitHubLiteClient(state);
    const workspace = createGitHubLiteBatchPlaneClient({
      client,
      repositoryRef: session,
    });

    await expect(
      workspace.inspectWorkspace().then((result) => result.policy),
    ).resolves.toEqual({
      approval: {
        mode: "SELF_APPROVAL_ALLOWED",
      },
    });
  });

  it("defaults Workspace policy to self-approval blocked when configuration is missing", async () => {
    const client = createMockGitHubLiteClient(createGitHubLiteMockState());
    const workspace = createGitHubLiteBatchPlaneClient({
      client,
      repositoryRef: session,
    });

    await expect(
      workspace.inspectWorkspace().then((result) => result.policy),
    ).resolves.toEqual({
      approval: {
        mode: "SELF_APPROVAL_BLOCKED",
      },
    });
  });

  it("creates Workspace policy change pull requests through the product client", async () => {
    const client = createMockGitHubLiteClient(createGitHubLiteMockState());
    const workspace = createGitHubLiteBatchPlaneClient({
      client,
      repositoryRef: session,
    });

    const result = await workspace.requestWorkspacePolicyChange({
      policy: { approval: { mode: "SELF_APPROVAL_ALLOWED" } },
    });

    const pullRequest = client.state.pullRequests.find(
      (request) => request.url === result.request.sourceUrl,
    );
    expect(pullRequest).toEqual(
      expect.objectContaining({
        head: expect.stringContaining("batchplane/workspace/policy-"),
        title: "Update BatchPlane Workspace policy",
      }),
    );
    const policyFile = client.state.files.find(
      (file) =>
        file.branch === pullRequest?.head &&
        file.path === ".batch-governance/workspace.yml",
    );
    if (!policyFile) {
      throw new Error("Workspace policy file was not created.");
    }
    expect(parseGovernanceYaml(policyFile.content)).toMatchObject({
      ok: true,
      value: { spec: { approval: { mode: "SELF_APPROVAL_ALLOWED" } } },
    });
  });

  it("creates Workspace workflow update pull requests through the product client", async () => {
    const state = createGitHubLiteMockState();

    state.files.push(
      {
        branch: "main",
        content: buildSampleTargetWorkflowYaml(),
        path: ".github/workflows/batchplane-sample-target.yml",
        sha: "mock-sample-target-sha",
      },
      {
        branch: "main",
        content: buildWorkspacePolicyYaml(),
        path: ".batch-governance/workspace.yml",
        sha: "mock-workspace-policy-sha",
      },
    );

    const client = createMockGitHubLiteClient(state);
    const workspace = createGitHubLiteBatchPlaneClient({
      client,
      repositoryRef: session,
    });

    const result = await workspace.requestWorkspaceUpdate();

    const pullRequest = client.state.pullRequests.find(
      (request) => request.url === result.request.sourceUrl,
    );
    expect(pullRequest).toEqual(
      expect.objectContaining({
        head: expect.stringContaining("batchplane/workspace/update-"),
        title: "Update BatchPlane Workspace workflows",
      }),
    );
    expect(result.installation.outdatedEvidence).toContain(
      ".github/workflows/batchplane-dispatcher.yml",
    );
    expect(
      client.state.files.find(
        (file) =>
          file.branch === pullRequest?.head &&
          file.path === ".github/workflows/batchplane-dispatcher.yml",
      )?.content,
    ).toContain("github.event.issue.pull_request == null");
  });
});
