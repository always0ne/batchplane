import { WorkspaceSettingsError } from "@batchplane/ui-client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubLiteApiError } from "./github-types.js";
import { createGitHubLiteMockState } from "./mock-state.js";
import { createMockGitHubLiteClient } from "./mock-client.js";
import { createGitHubLiteWorkspaceClient } from "./workspace-client.js";
import { loadWorkspacePolicy } from "./inspection-context.js";
import { checkLiteInstallationStatus } from "./workspace-installation-inspection.js";
import {
  createLiteInstallationPullRequest,
  createLiteInstallationUpdatePullRequest,
} from "./workspace-installation-requests.js";
import { createWorkspacePolicyPullRequest } from "./workspace-policy-request.js";

vi.mock("./inspection-context.js", () => ({ loadWorkspacePolicy: vi.fn() }));
vi.mock("./workspace-installation-inspection.js", () => ({
  checkLiteInstallationStatus: vi.fn(),
}));
vi.mock("./workspace-installation-requests.js", () => ({
  createLiteInstallationPullRequest: vi.fn(),
  createLiteInstallationUpdatePullRequest: vi.fn(),
}));
vi.mock("./workspace-policy-request.js", () => ({
  createWorkspacePolicyPullRequest: vi.fn(),
}));

const sourceRequest = {
  number: 71,
  title: "Workspace change",
  url: "https://example.test/source/71",
  author: "operator",
  base: "main",
  head: "request-71",
  body: "request evidence",
  state: "open" as const,
  merged: false,
};
const currentPolicy = { approval: { mode: "SELF_APPROVAL_BLOCKED" as const } };
const installed = {
  installed: true,
  presentPaths: ["installation"],
  requiredPaths: ["installation"],
  missingPaths: [],
  outdatedPaths: [],
};
function createContext() {
  const client = createMockGitHubLiteClient(
    createGitHubLiteMockState({
      currentUser: { login: "operator" },
      repository: {
        owner: "workspace-owner",
        repo: "workspace",
        defaultBranch: "main",
        private: true,
        url: "https://example.test/workspace",
      },
    }),
  );
  return {
    client,
    repositoryRef: { owner: "workspace-owner", repo: "workspace" },
  };
}

describe("Workspace product adapter", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(loadWorkspacePolicy).mockResolvedValue(currentPolicy);
    vi.mocked(checkLiteInstallationStatus).mockResolvedValue(installed);
    vi.mocked(createLiteInstallationPullRequest).mockResolvedValue({
      pullRequest: sourceRequest,
      status: installed,
    });
    vi.mocked(createLiteInstallationUpdatePullRequest).mockResolvedValue({
      pullRequest: sourceRequest,
      status: installed,
    });
    vi.mocked(createWorkspacePolicyPullRequest).mockResolvedValue(
      sourceRequest,
    );
  });

  it.each([
    {
      installed: false,
      presentPaths: [],
      missingPaths: ["installation"],
      outdatedPaths: [],
      action: "INSTALL",
    },
    {
      installed: false,
      presentPaths: ["policy"],
      missingPaths: ["installation"],
      outdatedPaths: [],
      action: "INSTALL",
    },
    {
      installed: true,
      presentPaths: ["installation"],
      missingPaths: [],
      outdatedPaths: [],
      action: null,
    },
    {
      installed: true,
      presentPaths: ["installation"],
      missingPaths: [],
      outdatedPaths: ["installation"],
      action: "UPDATE",
    },
  ])(
    "projects readiness into the existing $action request availability",
    async (readiness) => {
      const context = createContext();
      vi.mocked(checkLiteInstallationStatus).mockResolvedValue({
        ...readiness,
        requiredPaths: ["installation"],
      });
      const result =
        await createGitHubLiteWorkspaceClient(context).inspectWorkspace();
      expect(result.connection).toEqual({
        label: "workspace-owner/workspace",
        currentUser: "operator",
        defaultRevision: "main",
      });
      expect(result.policy).toEqual(currentPolicy);
      expect(result.installation).toEqual({
        availableRequest: readiness.action,
        installed: readiness.installed,
        requiredEvidence: ["installation"],
        presentEvidence: readiness.presentPaths,
        missingEvidence: readiness.missingPaths,
        outdatedEvidence: readiness.outdatedPaths,
      });
      expect(loadWorkspacePolicy).toHaveBeenCalledWith({
        ...context,
        ref: "main",
      });
      expect(checkLiteInstallationStatus).toHaveBeenCalledWith({
        client: context.client,
        repo: context.repositoryRef,
        ref: "main",
      });
      expect(result).not.toHaveProperty("token");
      expect(result.connection).not.toHaveProperty("repo");
      expect(createLiteInstallationPullRequest).not.toHaveBeenCalled();
    },
  );

  it.each(["requestWorkspaceInstallation", "requestWorkspaceUpdate"] as const)(
    "%s returns the actual request without claiming installation was applied",
    async (method) => {
      const context = createContext();
      vi.mocked(createLiteInstallationPullRequest).mockResolvedValue({
        pullRequest: sourceRequest,
        status: {
          ...installed,
          installed: false,
          missingPaths: ["installation"],
        },
      });
      const result = await createGitHubLiteWorkspaceClient(context)[method]();
      expect(result.request).toEqual({
        label: "#71 Workspace change",
        sourceUrl: sourceRequest.url,
      });
      expect(result.installation.installed).toBe(
        method === "requestWorkspaceUpdate",
      );
      expect(
        method === "requestWorkspaceInstallation"
          ? createLiteInstallationPullRequest
          : createLiteInstallationUpdatePullRequest,
      ).toHaveBeenCalledWith({
        client: context.client,
        repo: context.repositoryRef,
        defaultBranch: "main",
      });
      expect(checkLiteInstallationStatus).not.toHaveBeenCalled();
    },
  );

  it.each([
    "SELF_APPROVAL_BLOCKED",
    "SELF_APPROVAL_ALLOWED",
    "AUTO_APPROVE",
  ] as const)(
    "keeps current policy separate from the requested %s policy",
    async (mode) => {
      const context = createContext();
      const policy = { approval: { mode } };
      const result = await createGitHubLiteWorkspaceClient(
        context,
      ).requestWorkspacePolicyChange({ policy });
      expect(result).toEqual({
        currentPolicy,
        requestedPolicy: policy,
        request: {
          label: "#71 Workspace change",
          sourceUrl: sourceRequest.url,
        },
      });
      expect(loadWorkspacePolicy).toHaveBeenCalledWith({
        ...context,
        ref: "main",
      });
      expect(createWorkspacePolicyPullRequest).toHaveBeenCalledWith({
        client: context.client,
        repo: context.repositoryRef,
        defaultBranch: "main",
        policy,
      });
    },
  );

  it.each([
    ["unauthorized", 401, "authentication-required"],
    ["forbidden", 403, "access-denied"],
  ] as const)(
    "reports %s instead of connected or installed success",
    async (code, status, reason) => {
      const context = createContext();
      vi.spyOn(context.client, "getRepository").mockRejectedValue(
        new GitHubLiteApiError("provider detail", code, status),
      );
      await expect(
        createGitHubLiteWorkspaceClient(context).inspectWorkspace(),
      ).rejects.toEqual(new WorkspaceSettingsError({ type: reason }));
      expect(checkLiteInstallationStatus).not.toHaveBeenCalled();
    },
  );

  it("preserves a failed write as an error rather than returning a request", async () => {
    vi.mocked(createWorkspacePolicyPullRequest).mockRejectedValue(
      new GitHubLiteApiError("denied", "forbidden", 403),
    );
    await expect(
      createGitHubLiteWorkspaceClient(
        createContext(),
      ).requestWorkspacePolicyChange({ policy: currentPolicy }),
    ).rejects.toEqual(new WorkspaceSettingsError({ type: "access-denied" }));
  });
});
