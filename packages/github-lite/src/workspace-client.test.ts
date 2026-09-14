import type {
  SettingsPort,
  RuntimeInstallationStatus,
} from "@batchplane/domain";
import { WorkspaceSettingsError } from "@batchplane/ui-client";
import { describe, expect, it, vi } from "vitest";
import { GitHubLiteApiError } from "./index.js";
import { createGitHubLiteWorkspaceClient } from "./workspace-client.js";

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
const installed: RuntimeInstallationStatus = {
  installed: true,
  presentPaths: ["installation"],
  requiredPaths: ["installation"],
  missingPaths: [],
  outdatedPaths: [],
};

function settingsFixture(overrides: Partial<SettingsPort> = {}): SettingsPort {
  return {
    getCurrentUser: vi.fn(async () => ({ login: "operator" })),
    getRepository: vi.fn(async () => ({
      owner: "workspace-owner",
      repo: "workspace",
      defaultBranch: "main",
      private: true,
      url: "https://example.test/workspace",
    })),
    checkInstallationStatus: vi.fn(async () => installed),
    getWorkspacePolicy: vi.fn(async () => currentPolicy),
    createInstallationPullRequest: vi.fn(async () => ({
      pullRequest: sourceRequest,
      status: installed,
    })),
    createInstallationUpdatePullRequest: vi.fn(async () => ({
      pullRequest: sourceRequest,
      status: installed,
    })),
    createWorkspacePolicyPullRequest: vi.fn(async () => sourceRequest),
    ...overrides,
  };
}

describe("Workspace product adapter", () => {
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
  ] as const)(
    "projects readiness into the existing $action request availability",
    async (readiness) => {
      const settings = settingsFixture({
        checkInstallationStatus: vi.fn(async () => ({
          ...readiness,
          presentPaths: [...readiness.presentPaths],
          missingPaths: [...readiness.missingPaths],
          outdatedPaths: [...readiness.outdatedPaths],
          requiredPaths: ["installation"],
        })),
      });
      const result = await createGitHubLiteWorkspaceClient({
        settings,
      }).inspectWorkspace();
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
      expect(settings.getWorkspacePolicy).toHaveBeenCalledWith({ ref: "main" });
      expect(settings.checkInstallationStatus).toHaveBeenCalledWith({
        ref: "main",
      });
      expect(result).not.toHaveProperty("token");
      expect(result.connection).not.toHaveProperty("repo");
      expect(settings.createInstallationPullRequest).not.toHaveBeenCalled();
    },
  );

  it.each(["requestWorkspaceInstallation", "requestWorkspaceUpdate"] as const)(
    "%s returns the actual request without claiming installation was applied",
    async (method) => {
      const before = {
        ...installed,
        installed: false,
        missingPaths: ["installation"],
      };
      const settings = settingsFixture({
        createInstallationPullRequest: vi.fn(async () => ({
          pullRequest: sourceRequest,
          status: before,
        })),
        createInstallationUpdatePullRequest: vi.fn(async () => ({
          pullRequest: sourceRequest,
          status: installed,
        })),
      });
      const result = await createGitHubLiteWorkspaceClient({ settings })[
        method
      ]();
      expect(result.request).toEqual({
        label: "#71 Workspace change",
        sourceUrl: sourceRequest.url,
      });
      expect(result.installation.installed).toBe(
        method === "requestWorkspaceUpdate",
      );
      expect(
        settings[
          method === "requestWorkspaceInstallation"
            ? "createInstallationPullRequest"
            : "createInstallationUpdatePullRequest"
        ],
      ).toHaveBeenCalledWith({ defaultBranch: "main" });
      expect(settings.checkInstallationStatus).not.toHaveBeenCalled();
    },
  );

  it.each([
    "SELF_APPROVAL_BLOCKED",
    "SELF_APPROVAL_ALLOWED",
    "AUTO_APPROVE",
  ] as const)(
    "keeps current policy separate from the requested %s policy",
    async (mode) => {
      const settings = settingsFixture();
      const policy = { approval: { mode } };
      const result = await createGitHubLiteWorkspaceClient({
        settings,
      }).requestWorkspacePolicyChange({ policy });
      expect(result).toEqual({
        currentPolicy,
        requestedPolicy: policy,
        request: {
          label: "#71 Workspace change",
          sourceUrl: sourceRequest.url,
        },
      });
      expect(settings.getWorkspacePolicy).toHaveBeenCalledWith({ ref: "main" });
      expect(settings.createWorkspacePolicyPullRequest).toHaveBeenCalledWith({
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
      const settings = settingsFixture({
        getRepository: vi.fn(async () => {
          throw new GitHubLiteApiError("provider detail", code, status);
        }),
      });
      await expect(
        createGitHubLiteWorkspaceClient({ settings }).inspectWorkspace(),
      ).rejects.toEqual(new WorkspaceSettingsError({ type: reason }));
      expect(settings.checkInstallationStatus).not.toHaveBeenCalled();
    },
  );

  it("preserves a failed write as an error rather than returning a request", async () => {
    const settings = settingsFixture({
      createWorkspacePolicyPullRequest: vi.fn(async () => {
        throw new GitHubLiteApiError("denied", "forbidden", 403);
      }),
    });
    await expect(
      createGitHubLiteWorkspaceClient({
        settings,
      }).requestWorkspacePolicyChange({ policy: currentPolicy }),
    ).rejects.toEqual(new WorkspaceSettingsError({ type: "access-denied" }));
  });
});
