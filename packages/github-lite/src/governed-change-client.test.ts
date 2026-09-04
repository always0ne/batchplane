import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { BatchChangeDraft } from "@batchplane/ui-client";
import {
  buildGovernedChangeRequestBody,
  buildGovernedChangeDecisionBody,
  parseGovernedChangeDecisionEvidence,
  parseGovernedChangeRequestEvidence,
} from "@batchplane/github-lite";
import {
  createGovernedChangeRequestDigest,
  createTargetRevisionDigest,
} from "@batchplane/domain";
import { sha256BytesHex } from "@batchplane/digest";
import {
  getBatchDefinitionPath,
  getBatchWorkflowPath,
  parseBatchDefinitionYaml,
  serializeBatchDefinitionYaml,
} from "./batch-definition-codec.js";
import { buildBatchWorkflowYaml } from "./github-workflow.js";
import {
  createGitHubLiteMockState,
  createMockGitHubLiteClient,
  type GitHubLiteMockState,
} from "@batchplane/github-lite";
import { describe, expect, it, vi } from "vitest";

import { createGitHubLiteGovernedChangeClient } from "./governed-change-client.js";
import {
  assertPreparedChangeTargets,
  prepareGovernedChange,
} from "./governed-change-preparation.js";

const registrationDraft: BatchChangeDraft = {
  batch: {
    batchId: "payment.month-end",
    criticality: "HIGH",
    domain: "payments",
    environment: "PROD",
    name: "Month-end close",
    owner: "ops-team",
    runCommand: "echo close",
    runnerLabel: "ubuntu-latest",
    status: "ACTIVE",
    workflowRef: "main",
  },
  governedChangeId: "bgc-20260901-payment-month-end-0001",
  mode: "create",
  schedules: [],
};

const installedWorkspacePolicy = readFileSync(
  fileURLToPath(
    new URL(
      "../../../examples/github-lite-demo/.batch-governance/workspace.yml",
      import.meta.url,
    ),
  ),
  "utf8",
);

describe("GitHub Lite governed change client", () => {
  it("reads the installed Workspace policy fixture from its canonical path", async () => {
    const state = createGitHubLiteMockState({
      currentUser: { login: "developer" },
      issues: [],
    });
    state.files.push({
      branch: "main",
      content: installedWorkspacePolicy,
      path: ".batch-governance/workspace.yml",
      sha: "installed-workspace-policy-sha",
    });
    state.repositoryPermissions = state.repositoryPermissions.map(
      (permission) =>
        permission.username === "developer"
          ? { ...permission, permission: "maintain" }
          : permission,
    );
    const mock = createMockGitHubLiteClient(state);
    const getFile = vi.fn(mock.getFile);
    const client = { ...mock, getFile };
    const governedChanges = createGitHubLiteGovernedChangeClient(
      session(),
      client,
    );

    await expect(
      governedChanges.createBatchChangeRequest(registrationDraft),
    ).resolves.toMatchObject({ request: { reviewState: "OPEN" } });
    expect(getFile).toHaveBeenCalledWith(
      expect.objectContaining({
        path: ".batch-governance/workspace.yml",
      }),
    );
    expect(getFile).not.toHaveBeenCalledWith(
      expect.objectContaining({
        path: ".batch-governance/policies/workspace-policy.yml",
      }),
    );
  });

  it("creates immutable governed evidence and approves with the requested head SHA", async () => {
    const state = createGitHubLiteMockState({
      currentUser: { login: "developer" },
    });
    const client = createMockGitHubLiteClient(state);
    const governedChanges = createGitHubLiteGovernedChangeClient(
      session(),
      client,
    );
    const preview = await governedChanges.previewBatchChange(registrationDraft);
    const created =
      await governedChanges.createBatchChangeRequest(registrationDraft);
    const pullRequest = client.state.pullRequests.find(
      (candidate) =>
        candidate.number === Number(created.request.requestLocator),
    );

    expect(preview.files).toHaveLength(2);
    expect(created.request.evidence).toMatchObject({
      governedChangeId: registrationDraft.governedChangeId,
      kind: "VERIFIED_V2",
    });
    expect(
      created.request.evidence.kind === "VERIFIED_V2" &&
        created.request.evidence.governedChangeId,
    ).toBe(registrationDraft.governedChangeId);
    expect(
      client.state.files.find(
        (file) =>
          file.path === ".batch-governance/batches/payment.month-end.yml",
      )?.content,
    ).toContain('governedChangeId: "bgc-20260901-payment-month-end-0001"');
    expect(pullRequest?.body).toContain("batchplane:governed-change-request");

    client.state.currentUser.login = "maintainer";
    client.state.repositoryPermissions.push({
      permission: "maintain",
      roleName: "maintain",
      username: "maintainer",
    });
    const approved = await governedChanges.approveGovernedChange({
      requestLocator: created.request.requestLocator,
    });

    expect(approved.reviewState).toBe("MERGED");
    expect(client.state.issueComments.at(-1)).toMatchObject({
      author: "maintainer",
      updatedAt: "1970-01-01T00:00:00.000Z",
    });
    expect(
      client.state.pullRequests.find(
        (candidate) => candidate.number === pullRequest?.number,
      )?.merged,
    ).toBe(true);
  });

  it.each(["../../workflows/release", "payment/daily-close"])(
    "rejects unsafe Batch ID %s before it can address repository files",
    async (batchId) => {
      const mock = createMockGitHubLiteClient(
        createGitHubLiteMockState({ currentUser: { login: "developer" } }),
      );
      const client = {
        ...mock,
        createBranch: vi.fn(mock.createBranch),
        deleteFile: vi.fn(mock.deleteFile),
        getFile: vi.fn(mock.getFile),
      };
      const governedChanges = createGitHubLiteGovernedChangeClient(
        session(),
        client,
      );
      const draft = {
        ...registrationDraft,
        batch: { ...registrationDraft.batch, batchId },
      };

      await expect(governedChanges.previewBatchChange(draft)).rejects.toThrow(
        "Batch ID",
      );
      await expect(
        governedChanges.createBatchChangeRequest(draft),
      ).rejects.toThrow("Batch ID");
      await expect(
        governedChanges.loadBatchChangeDraft({ batchId, mode: "change" }),
      ).rejects.toThrow("Batch ID");
      await expect(
        governedChanges.loadBatchChangeDraft({ batchId, mode: "delete" }),
      ).rejects.toThrow("Batch ID");

      expect(client.getFile).not.toHaveBeenCalledWith(
        expect.objectContaining({ path: expect.stringContaining(batchId) }),
      );
      expect(client.createBranch).not.toHaveBeenCalled();
      expect(client.deleteFile).not.toHaveBeenCalled();
    },
  );

  it("requires the original Batch ID for direct change and delete commands", async () => {
    const client = createMockGitHubLiteClient(
      createGitHubLiteMockState({ currentUser: { login: "developer" } }),
    );
    const governedChanges = createGitHubLiteGovernedChangeClient(
      session(),
      client,
    );

    await expect(
      governedChanges.createBatchChangeRequest({
        ...changeDraft({}),
        targetBatchId: undefined,
      }),
    ).rejects.toThrow("Batch ID cannot change");

    const loaded = await governedChanges.loadBatchChangeDraft({
      batchId: "payment.daily-close",
      mode: "change",
    });
    expect(loaded.targetBatchId).toBe("payment.daily-close");
    await expect(
      governedChanges.previewBatchChange({
        ...loaded,
        targetBatchId: undefined,
      }),
    ).rejects.toThrow("Batch ID cannot change");
    await expect(
      governedChanges.previewBatchChange({
        ...loaded,
        targetBatchId: "payment.month-end",
      }),
    ).rejects.toThrow("Batch ID cannot change");
    await expect(
      governedChanges.createBatchChangeRequest({
        ...changeDraft({}),
        batch: { ...registrationDraft.batch, batchId: "payment.daily-close" },
      }),
    ).rejects.toThrow("Batch ID cannot change");
    await expect(
      governedChanges.createBatchChangeRequest({
        ...changeDraft({}),
        mode: "delete",
        targetBatchId: undefined,
      }),
    ).rejects.toThrow("Batch ID cannot change");
  });

  it("blocks direct create, change, and delete commands while the batch has a pending governed change", async () => {
    const client = createMockGitHubLiteClient(
      createGitHubLiteMockState({ currentUser: { login: "developer" } }),
    );
    const governedChanges = createGitHubLiteGovernedChangeClient(
      session(),
      client,
    );

    await governedChanges.createBatchChangeRequest(registrationDraft);

    await expect(
      governedChanges.createBatchChangeRequest({
        ...registrationDraft,
        governedChangeId: "bgc-20260901-payment-month-end-0002",
      }),
    ).rejects.toThrow("pending governed change");
    await expect(
      governedChanges.createBatchChangeRequest(changeDraft({})),
    ).rejects.toThrow("pending governed change");
    await expect(
      governedChanges.createBatchChangeRequest({
        ...changeDraft({}),
        mode: "delete",
      }),
    ).rejects.toThrow("pending governed change");
    await expect(
      governedChanges.loadBatchChangeDraft({
        batchId: "payment.daily-close",
        mode: "delete",
      }),
    ).resolves.toMatchObject({
      targetBatchId: "payment.daily-close",
    });
  });

  it.each([
    ["REQUESTED", [], true],
    ["APPROVED", ["batchplane:approved"], true],
    ["DISPATCHING", ["batchplane:dispatching"], true],
    ["DISPATCH_FAILED", ["batchplane:dispatch-failed"], false],
    ["DISPATCHED", ["batchplane:dispatched"], false],
    ["GATE_BLOCKED", ["batchplane:gate-blocked"], false],
    ["REJECTED", ["batchplane:rejected"], false],
  ])(
    "treats execution request %s as %s blocking",
    async (_status, statusLabels, blocksChange) => {
      const state = createGitHubLiteMockState({
        currentUser: { login: "developer" },
        issues: [
          executionRequestIssue({
            labels: ["batchplane:execution-request", ...statusLabels],
          }),
        ],
      });
      const client = createMockGitHubLiteClient(state);
      const governedChanges = createGitHubLiteGovernedChangeClient(
        session(),
        client,
      );

      if (blocksChange) {
        await expect(
          governedChanges.createBatchChangeRequest(
            changeDraft({ batchId: "payment.daily-close" }),
          ),
        ).rejects.toThrow("pending execution request");
        return;
      }

      await expect(
        governedChanges.getBatchChangeBlocker({
          batchId: "payment.daily-close",
        }),
      ).resolves.toBeNull();
    },
  );

  it("does not create a branch or request for a governedChangeId-only change", async () => {
    const client = createMockGitHubLiteClient(
      createGitHubLiteMockState({
        currentUser: { login: "developer" },
        issues: [],
        pullRequests: [],
      }),
    );
    alignMockBatchWithGeneratedWorkflow(client.state, "payment.daily-close");
    const governedChanges = createGitHubLiteGovernedChangeClient(
      session(),
      client,
    );
    const loaded = await governedChanges.loadBatchChangeDraft({
      batchId: "payment.daily-close",
      mode: "change",
    });
    const draft = {
      ...loaded,
      governedChangeId: "bgc-20260901-payment-daily-close-0002",
      targetBatchId: loaded.batch.batchId,
    };
    const branchCount = Object.keys(client.state.branches).length;
    const pullRequestCount = client.state.pullRequests.length;

    await expect(
      governedChanges.previewBatchChange(draft),
    ).resolves.toMatchObject({
      hasEffectiveChanges: false,
    });
    await expect(
      governedChanges.createBatchChangeRequest(draft),
    ).rejects.toThrow("does not modify any file");
    expect(Object.keys(client.state.branches)).toHaveLength(branchCount);
    expect(client.state.pullRequests).toHaveLength(pullRequestCount);
  });

  it("keeps a schedule change effective when the governedChangeId rotates", async () => {
    const client = createMockGitHubLiteClient(
      createGitHubLiteMockState({
        currentUser: { login: "developer" },
        issues: [],
        pullRequests: [],
      }),
    );
    const governedChanges = createGitHubLiteGovernedChangeClient(
      session(),
      client,
    );
    const loaded = await governedChanges.loadBatchChangeDraft({
      batchId: "payment.daily-close",
      mode: "change",
    });

    await expect(
      governedChanges.previewBatchChange({
        ...loaded,
        governedChangeId: "bgc-20260901-payment-daily-close-0003",
        schedules: [
          ...loaded.schedules,
          {
            cron: "0 6 * * *",
            enabled: true,
            name: "Morning close",
            scheduleId: "morning-close",
            timezone: "Asia/Seoul",
          },
        ],
        targetBatchId: loaded.batch.batchId,
      }),
    ).resolves.toMatchObject({ hasEffectiveChanges: true });
  });

  it("uses the governed change suffix to avoid same-second branch collisions", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T12:00:00.000Z"));

    try {
      const client = createMockGitHubLiteClient(
        createGitHubLiteMockState({ currentUser: { login: "developer" } }),
      );
      const governedChanges = createGitHubLiteGovernedChangeClient(
        session(),
        client,
      );
      const draft = { ...registrationDraft, governedChangeId: undefined };
      const first = await governedChanges.createBatchChangeRequest(draft);
      findCreatedPullRequest(client, first.request.requestLocator).state =
        "closed";
      const second = await governedChanges.createBatchChangeRequest(draft);
      const firstPullRequest = findCreatedPullRequest(
        client,
        first.request.requestLocator,
      );
      const secondPullRequest = findCreatedPullRequest(
        client,
        second.request.requestLocator,
      );

      expect(firstPullRequest.head).not.toBe(secondPullRequest.head);
    } finally {
      vi.useRealTimers();
    }
  });

  it("closes and records a stale-base pull request before requiring a retry", async () => {
    const mock = createMockGitHubLiteClient(
      createGitHubLiteMockState({ currentUser: { login: "developer" } }),
    );
    const client = {
      ...mock,
      createPullRequest: vi.fn(async (input) => ({
        ...(await mock.createPullRequest(input)),
        baseSha: "newer-base-sha",
      })),
    };
    const governedChanges = createGitHubLiteGovernedChangeClient(
      session(),
      client,
    );

    await expect(
      governedChanges.createBatchChangeRequest(registrationDraft),
    ).rejects.toThrow("BASE_REVISION_CHANGED");
    expect(client.state.pullRequests.at(-1)).toMatchObject({ state: "closed" });
    expect(client.state.issueComments.at(-1)?.body).toContain(
      "WITHDRAWN_UNVERIFIED",
    );
  });

  it("returns REAPPROVAL_REQUIRED when current governed bytes no longer match the request evidence", async () => {
    const state = createGitHubLiteMockState({
      currentUser: { login: "developer" },
    });
    const client = createMockGitHubLiteClient(state);
    const governedChanges = createGitHubLiteGovernedChangeClient(
      session(),
      client,
    );
    const created =
      await governedChanges.createBatchChangeRequest(registrationDraft);
    const pullRequest = client.state.pullRequests.find(
      (candidate) =>
        candidate.number === Number(created.request.requestLocator),
    );

    if (!pullRequest) {
      throw new Error("Expected governed change pull request.");
    }

    const definition = client.state.files.find(
      (file) =>
        file.branch === pullRequest.head &&
        file.path.endsWith("payment.month-end.yml"),
    );

    if (!definition) {
      throw new Error("Expected governed BatchDefinition.");
    }

    definition.content = `${definition.content}\n# changed outside BatchPlane\n`;
    client.state.currentUser.login = "maintainer";

    await expect(
      governedChanges.approveGovernedChange({
        requestLocator: created.request.requestLocator,
      }),
    ).resolves.toMatchObject({ reviewState: "REAPPROVAL_REQUIRED" });
    expect(pullRequest.merged).toBe(false);
  });

  it("requires reapproval when a governed input changed on the default branch", async () => {
    const state = createGitHubLiteMockState({
      currentUser: { login: "developer" },
    });
    const client = createMockGitHubLiteClient(state);
    const governedChanges = createGitHubLiteGovernedChangeClient(
      session(),
      client,
    );
    const initialCommentCount = client.state.issueComments.length;
    const created =
      await governedChanges.createBatchChangeRequest(registrationDraft);
    const pullRequest = findCreatedPullRequest(
      client,
      created.request.requestLocator,
    );
    preserveDefaultBranchRevision(client.state);
    client.state.branches.main = "concurrent-main-sha";
    const requestedDefinition = client.state.files.find(
      (file) =>
        file.branch === pullRequest.head &&
        file.path === ".batch-governance/batches/payment.month-end.yml",
    );

    if (!requestedDefinition) {
      throw new Error("Expected governed BatchDefinition.");
    }
    client.state.files.push({
      branch: "main",
      content: `${requestedDefinition.content}\n# competing default change\n`,
      path: requestedDefinition.path,
      sha: "concurrent-definition-sha",
    });
    client.state.currentUser.login = "maintainer";
    client.state.repositoryPermissions.push({
      permission: "maintain",
      roleName: "maintain",
      username: "maintainer",
    });

    await expect(
      governedChanges.getGovernedChange({
        requestLocator: created.request.requestLocator,
      }),
    ).resolves.toMatchObject({
      evidence: { kind: "REAPPROVAL_REQUIRED", reason: "STALE_BASE" },
      reviewState: "REAPPROVAL_REQUIRED",
    });
    await expect(
      governedChanges.approveGovernedChange({
        requestLocator: created.request.requestLocator,
      }),
    ).resolves.toMatchObject({ reviewState: "REAPPROVAL_REQUIRED" });
    expect(client.state.issueComments).toHaveLength(initialCommentCount);
  });

  it("does not invalidate a request when only unrelated default-branch files changed", async () => {
    const state = createGitHubLiteMockState({
      currentUser: { login: "developer" },
    });
    const client = createMockGitHubLiteClient(state);
    const governedChanges = createGitHubLiteGovernedChangeClient(
      session(),
      client,
    );
    const created =
      await governedChanges.createBatchChangeRequest(registrationDraft);
    preserveDefaultBranchRevision(client.state);
    client.state.branches.main = "unrelated-main-sha";
    client.state.files.push({
      branch: "main",
      content: "unrelated\n",
      path: "README.md",
      sha: "unrelated-readme-sha",
    });
    client.state.currentUser.login = "maintainer";
    client.state.repositoryPermissions.push({
      permission: "maintain",
      roleName: "maintain",
      username: "maintainer",
    });

    await expect(
      governedChanges.getGovernedChange({
        requestLocator: created.request.requestLocator,
      }),
    ).resolves.toMatchObject({
      evidence: { kind: "VERIFIED_V2" },
      reviewState: "OPEN",
    });
  });

  it("rejects request metadata tampering and an injected pull request file", async () => {
    const client = createMockGitHubLiteClient(
      createGitHubLiteMockState({ currentUser: { login: "developer" } }),
    );
    const governedChanges = createGitHubLiteGovernedChangeClient(
      session(),
      client,
    );
    const created =
      await governedChanges.createBatchChangeRequest(registrationDraft);
    const pullRequest = findCreatedPullRequest(
      client,
      created.request.requestLocator,
    );

    pullRequest.body = pullRequest.body.replace(
      '"requester":"developer"',
      '"requester":"attacker"',
    );
    await expect(
      governedChanges.getGovernedChange({
        requestLocator: created.request.requestLocator,
      }),
    ).resolves.toMatchObject({ reviewState: "REAPPROVAL_REQUIRED" });

    pullRequest.body = pullRequest.body.replace(
      '"requester":"attacker"',
      '"requester":"developer"',
    );
    client.state.pullRequestFiles[pullRequest.number]?.push({
      path: "README.md",
      status: "modified",
    });
    await expect(
      governedChanges.approveGovernedChange({
        requestLocator: created.request.requestLocator,
      }),
    ).resolves.toMatchObject({ reviewState: "REAPPROVAL_REQUIRED" });
  });

  it("rejects an evidence-consistent change that includes an unrelated file", async () => {
    const state = createGitHubLiteMockState({
      currentUser: { login: "developer" },
    });
    const client = createMockGitHubLiteClient(state);
    const governedChanges = createGitHubLiteGovernedChangeClient(
      session(),
      client,
    );
    const created =
      await governedChanges.createBatchChangeRequest(registrationDraft);
    const pullRequest = findCreatedPullRequest(
      client,
      created.request.requestLocator,
    );
    const requestEvidence = parseGovernedChangeRequestEvidence(
      pullRequest.body,
    );
    const unrelatedFileBytes = new TextEncoder().encode("unrelated\n");

    if (!requestEvidence || !pullRequest.headSha) {
      throw new Error("Expected v2 evidence.");
    }

    client.state.files.push({
      branch: pullRequest.head,
      content: "unrelated\n",
      path: "README.md",
      sha: "forged-readme-sha",
    });
    client.state.pullRequestFiles[pullRequest.number] = [
      ...(client.state.pullRequestFiles[pullRequest.number] ?? []),
      { path: "README.md", status: "added" },
    ];
    const forgedArtifacts = [
      ...requestEvidence.artifacts,
      {
        afterDigest: await sha256BytesHex(unrelatedFileBytes),
        beforeDigest: null,
        kind: "ARTIFACT" as const,
        path: "README.md",
      },
    ];
    const forgedEvidence = {
      ...requestEvidence,
      artifacts: forgedArtifacts,
      targetRevisionDigest: await createTargetRevisionDigest(forgedArtifacts),
    };
    pullRequest.body = buildGovernedChangeRequestBody(forgedEvidence);

    await expect(
      governedChanges.getGovernedChange({
        requestLocator: created.request.requestLocator,
      }),
    ).resolves.toMatchObject({
      evidence: { kind: "REAPPROVAL_REQUIRED", reason: "UNVERIFIED_REQUEST" },
      reviewState: "REAPPROVAL_REQUIRED",
    });
  });

  it("rejects a requester-controlled README artifact path with coherent evidence", async () => {
    const client = createMockGitHubLiteClient(
      createGitHubLiteMockState({ currentUser: { login: "developer" } }),
    );
    const governedChanges = createGitHubLiteGovernedChangeClient(
      session(),
      client,
    );
    const created = await governedChanges.createBatchChangeRequest({
      ...registrationDraft,
      artifact: {
        bytes: new TextEncoder().encode("trusted?\n"),
        fileName: "run.sh",
      },
    });
    const pullRequest = findCreatedPullRequest(
      client,
      created.request.requestLocator,
    );
    const evidence = parseGovernedChangeRequestEvidence(pullRequest.body);
    const definitionFile = client.state.files.find(
      (file) =>
        file.branch === pullRequest.head &&
        file.path === getBatchDefinitionPath(registrationDraft.batch.batchId),
    );
    const workflowFile = client.state.files.find(
      (file) =>
        file.branch === pullRequest.head &&
        file.path === getBatchWorkflowPath(registrationDraft.batch.batchId),
    );
    const originalArtifact = evidence?.artifacts.find(
      (artifact) => artifact.kind === "ARTIFACT",
    );

    if (!evidence || !definitionFile || !workflowFile || !originalArtifact) {
      throw new Error("Expected generated registration evidence.");
    }

    const requestedDefinition = parseBatchDefinitionYaml(
      definitionFile.content,
    );
    const forgedDefinition = {
      ...requestedDefinition,
      execution: {
        ...requestedDefinition.execution!,
        artifactPath: "README.md",
      },
    };
    definitionFile.content = serializeBatchDefinitionYaml(forgedDefinition);
    workflowFile.content = buildBatchWorkflowYaml(forgedDefinition);
    client.state.files = client.state.files.filter(
      (file) =>
        !(
          file.branch === pullRequest.head &&
          file.path === originalArtifact.path
        ),
    );
    client.state.files.push({
      branch: pullRequest.head,
      content: "trusted?\n",
      path: "README.md",
      sha: "forged-readme-artifact-sha",
    });
    client.state.pullRequestFiles[pullRequest.number] = [
      {
        path: getBatchDefinitionPath(registrationDraft.batch.batchId),
        status: "added",
      },
      {
        path: getBatchWorkflowPath(registrationDraft.batch.batchId),
        status: "added",
      },
      { path: "README.md", status: "added" },
    ];
    const artifacts = await Promise.all(
      evidence.artifacts.map(async (artifact) => {
        if (artifact.kind === "BATCH_DEFINITION") {
          return {
            ...artifact,
            afterDigest: await sha256BytesHex(
              new TextEncoder().encode(definitionFile.content),
            ),
          };
        }
        if (artifact.kind === "WORKFLOW") {
          return {
            ...artifact,
            afterDigest: await sha256BytesHex(
              new TextEncoder().encode(workflowFile.content),
            ),
          };
        }
        return {
          ...artifact,
          afterDigest: await sha256BytesHex(
            new TextEncoder().encode("trusted?\n"),
          ),
          path: "README.md",
        };
      }),
    );
    pullRequest.body = buildGovernedChangeRequestBody({
      ...evidence,
      artifacts,
      targetRevisionDigest: await createTargetRevisionDigest(artifacts),
    });

    await expect(
      governedChanges.getGovernedChange({
        requestLocator: created.request.requestLocator,
      }),
    ).resolves.toMatchObject({ reviewState: "REAPPROVAL_REQUIRED" });
  });

  it("rejects an evidence-consistent workflow that omits the mandatory Gate", async () => {
    const client = createMockGitHubLiteClient(
      createGitHubLiteMockState({ currentUser: { login: "developer" } }),
    );
    const governedChanges = createGitHubLiteGovernedChangeClient(
      session(),
      client,
    );
    const created =
      await governedChanges.createBatchChangeRequest(registrationDraft);
    const pullRequest = findCreatedPullRequest(
      client,
      created.request.requestLocator,
    );
    const evidence = parseGovernedChangeRequestEvidence(pullRequest.body);
    const workflow = client.state.files.find(
      (file) =>
        file.branch === pullRequest.head &&
        file.path === getBatchWorkflowPath(registrationDraft.batch.batchId),
    );

    if (!evidence || !workflow) throw new Error("Expected governed workflow.");

    workflow.content =
      "name: altered\non: workflow_dispatch\njobs:\n  run:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo bypass\n";
    const workflowDigest = await sha256BytesHex(
      new TextEncoder().encode(workflow.content),
    );
    const artifacts = evidence.artifacts.map((artifact) =>
      artifact.kind === "WORKFLOW"
        ? { ...artifact, afterDigest: workflowDigest }
        : artifact,
    );
    pullRequest.body = buildGovernedChangeRequestBody({
      ...evidence,
      artifacts,
      targetRevisionDigest: await createTargetRevisionDigest(artifacts),
    });

    await expect(
      governedChanges.getGovernedChange({
        requestLocator: created.request.requestLocator,
      }),
    ).resolves.toMatchObject({ reviewState: "REAPPROVAL_REQUIRED" });
  });

  it("rejects a registration request that removes its generated workflow", async () => {
    const client = createMockGitHubLiteClient(
      createGitHubLiteMockState({ currentUser: { login: "developer" } }),
    );
    const governedChanges = createGitHubLiteGovernedChangeClient(
      session(),
      client,
    );
    const created =
      await governedChanges.createBatchChangeRequest(registrationDraft);
    const pullRequest = findCreatedPullRequest(
      client,
      created.request.requestLocator,
    );
    const evidence = parseGovernedChangeRequestEvidence(pullRequest.body);

    if (!evidence) throw new Error("Expected governed evidence.");

    client.state.files = client.state.files.filter(
      (file) =>
        !(
          file.branch === pullRequest.head &&
          file.path === getBatchWorkflowPath(registrationDraft.batch.batchId)
        ),
    );
    client.state.pullRequestFiles[pullRequest.number] = [
      {
        path: getBatchDefinitionPath(registrationDraft.batch.batchId),
        status: "added",
      },
    ];
    const artifacts = evidence.artifacts.map((artifact) =>
      artifact.kind === "WORKFLOW"
        ? { ...artifact, afterDigest: null }
        : artifact,
    );
    pullRequest.body = buildGovernedChangeRequestBody({
      ...evidence,
      artifacts,
      targetRevisionDigest: await createTargetRevisionDigest(artifacts),
    });

    await expect(
      governedChanges.getGovernedChange({
        requestLocator: created.request.requestLocator,
      }),
    ).resolves.toMatchObject({ reviewState: "REAPPROVAL_REQUIRED" });
  });

  it("keeps a manually crafted request from a non-requester unapprovable", async () => {
    const client = createMockGitHubLiteClient(
      createGitHubLiteMockState({ currentUser: { login: "developer" } }),
    );
    const governedChanges = createGitHubLiteGovernedChangeClient(
      session(),
      client,
    );
    const created =
      await governedChanges.createBatchChangeRequest(registrationDraft);
    const pullRequest = findCreatedPullRequest(
      client,
      created.request.requestLocator,
    );

    pullRequest.author = "attacker";
    pullRequest.body = pullRequest.body.replace(
      '"requester":"developer"',
      '"requester":"attacker"',
    );

    await expect(
      governedChanges.getGovernedChange({
        requestLocator: created.request.requestLocator,
      }),
    ).resolves.toMatchObject({ reviewState: "REAPPROVAL_REQUIRED" });
  });

  it("ignores edited, forged, and unauthorized decision comments", async () => {
    const client = createMockGitHubLiteClient(
      createGitHubLiteMockState({ currentUser: { login: "developer" } }),
    );
    const governedChanges = createGitHubLiteGovernedChangeClient(
      session(),
      client,
    );
    const created =
      await governedChanges.createBatchChangeRequest(registrationDraft);
    const pullRequest = findCreatedPullRequest(
      client,
      created.request.requestLocator,
    );
    const evidence = parseGovernedChangeRequestEvidence(pullRequest.body);

    if (!evidence || !pullRequest.headSha)
      throw new Error("Expected v2 evidence.");

    const requestDigest = await createGovernedChangeRequestDigest(evidence);
    const body = buildGovernedChangeDecisionBody({
      authorizationRevisionSha: "main-sha",
      headRevisionSha: pullRequest.headSha,
      decision: "APPROVED",
      decisionSource: "USER",
      governedChangeId: evidence.governedChangeId,
      requestDigest,
      targetRevisionDigest: evidence.targetRevisionDigest,
      version: "batchplane.io/governed-change/v2",
    });
    client.state.issueComments.push(
      {
        author: "attacker",
        body,
        createdAt: "2026-09-01T00:00:00.000Z",
        id: 100,
        issueNumber: pullRequest.number,
        updatedAt: "2026-09-01T00:00:00.000Z",
      },
      {
        author: "maintainer",
        body,
        createdAt: "2026-09-01T00:01:00.000Z",
        id: 101,
        issueNumber: pullRequest.number,
        updatedAt: "2026-09-01T00:02:00.000Z",
      },
    );

    await expect(
      governedChanges.getGovernedChange({
        requestLocator: created.request.requestLocator,
      }),
    ).resolves.toMatchObject({ reviewState: "OPEN" });
  });

  it("requires a reason for rejection and keeps withdraw distinct from an external close", async () => {
    const state = createGitHubLiteMockState({
      currentUser: { login: "developer" },
    });
    const client = createMockGitHubLiteClient(state);
    const governedChanges = createGitHubLiteGovernedChangeClient(
      session(),
      client,
    );
    const created =
      await governedChanges.createBatchChangeRequest(registrationDraft);

    await expect(
      governedChanges.rejectGovernedChange({
        reason: " ",
        requestLocator: created.request.requestLocator,
      }),
    ).rejects.toThrow("rejection reason");

    await expect(
      governedChanges.withdrawGovernedChange({
        requestLocator: created.request.requestLocator,
      }),
    ).resolves.toMatchObject({ reviewState: "WITHDRAWN" });

    const legacy = await governedChanges.getGovernedChange({
      requestLocator: "12",
    });
    expect(legacy).toMatchObject({
      canWithdraw: true,
      reviewState: "LEGACY_UNAPPROVABLE",
    });
  });

  it("records Workspace policy as the automatic approval source", async () => {
    const state = createGitHubLiteMockState({
      currentUser: { login: "developer" },
    });
    state.files.push({
      branch: "main",
      content: workspaceAutoApprovalPolicy(),
      path: ".batch-governance/workspace.yml",
      sha: "mock-workspace-policy-sha",
    });
    const client = createMockGitHubLiteClient(state);
    const governedChanges = createGitHubLiteGovernedChangeClient(
      session(),
      client,
    );

    const created =
      await governedChanges.createBatchChangeRequest(registrationDraft);

    expect(created.request).toMatchObject({
      decision: { decision: "APPROVED", source: "WORKSPACE_POLICY" },
      reviewState: "MERGED",
    });
    expect(created.request.decision?.actor).toBeUndefined();
  });

  it.each([
    ["requester", '"requester":"attacker"'],
    ["request time", '"requestedAt":"2026-09-02T00:00:00.000Z"'],
    ["repository", '"repository":"attacker/other"'],
    ["workspace", '"workspace":"attacker/other"'],
    ["base revision", '"baseRevisionSha":"attacker-sha"'],
    ["head revision", '"headRevisionSha":"attacker-sha"'],
    ["batch", '"batchId":"attacker.batch"'],
    ["governed change ID", '"governedChangeId":"bgc-attacker"'],
    ["type", '"type":"DELETE"'],
  ])("does not trust a tampered request %s", async (_field, replacement) => {
    const client = createMockGitHubLiteClient(
      createGitHubLiteMockState({ currentUser: { login: "developer" } }),
    );
    const governedChanges = createGitHubLiteGovernedChangeClient(
      session(),
      client,
    );
    const created =
      await governedChanges.createBatchChangeRequest(registrationDraft);
    const pullRequest = findCreatedPullRequest(
      client,
      created.request.requestLocator,
    );
    const key = replacement.slice(1, replacement.indexOf('"', 1));
    const original = pullRequest.body.match(new RegExp(`"${key}":"[^"]+"`));

    if (!original) throw new Error(`Expected ${key} request evidence.`);
    pullRequest.body = pullRequest.body.replace(original[0], replacement);

    await expect(
      governedChanges.getGovernedChange({
        requestLocator: created.request.requestLocator,
      }),
    ).resolves.toMatchObject({
      evidence: { kind: "REAPPROVAL_REQUIRED", reason: "UNVERIFIED_REQUEST" },
      reviewState: "REAPPROVAL_REQUIRED",
    });
  });

  it("does not approve a coherent request targeting a non-default branch", async () => {
    const client = createMockGitHubLiteClient(
      createGitHubLiteMockState({ currentUser: { login: "developer" } }),
    );
    const governedChanges = createGitHubLiteGovernedChangeClient(
      session(),
      client,
    );
    const created =
      await governedChanges.createBatchChangeRequest(registrationDraft);
    const pullRequest = findCreatedPullRequest(
      client,
      created.request.requestLocator,
    );
    pullRequest.base = "release";
    client.state.currentUser.login = "maintainer";
    client.state.repositoryPermissions.push({
      permission: "maintain",
      roleName: "maintain",
      username: "maintainer",
    });

    await expect(
      governedChanges.approveGovernedChange({
        requestLocator: created.request.requestLocator,
      }),
    ).resolves.toMatchObject({ reviewState: "REAPPROVAL_REQUIRED" });
    expect(pullRequest.merged).toBe(false);
  });

  it("keeps a merged historical request verified after the default branch changes", async () => {
    const client = createMockGitHubLiteClient(
      createGitHubLiteMockState({ currentUser: { login: "developer" } }),
    );
    const governedChanges = createGitHubLiteGovernedChangeClient(
      session(),
      client,
    );
    const created =
      await governedChanges.createBatchChangeRequest(registrationDraft);
    client.state.currentUser.login = "maintainer";
    client.state.repositoryPermissions.push({
      permission: "maintain",
      roleName: "maintain",
      username: "maintainer",
    });
    await governedChanges.approveGovernedChange({
      requestLocator: created.request.requestLocator,
    });

    renameDefaultBranch(client.state, "trunk");
    replaceDefaultFile(
      client.state,
      ".batch-governance/policies/role-mapping.yml",
      workspaceRoleMapping(["admin"]),
    );

    await expect(
      governedChanges.getGovernedChange({
        requestLocator: created.request.requestLocator,
      }),
    ).resolves.toMatchObject({ reviewState: "MERGED" });
  });

  it("keeps a rejected historical request verified after current policy changes", async () => {
    const client = createMockGitHubLiteClient(
      createGitHubLiteMockState({ currentUser: { login: "developer" } }),
    );
    const governedChanges = createGitHubLiteGovernedChangeClient(
      session(),
      client,
    );
    const created =
      await governedChanges.createBatchChangeRequest(registrationDraft);
    client.state.currentUser.login = "maintainer";
    client.state.repositoryPermissions.push({
      permission: "maintain",
      roleName: "maintain",
      username: "maintainer",
    });
    await governedChanges.rejectGovernedChange({
      reason: "Not ready.",
      requestLocator: created.request.requestLocator,
    });

    renameDefaultBranch(client.state, "trunk");
    client.state.files.push({
      branch: "trunk",
      content: workspaceApprovalPolicy("SELF_APPROVAL_BLOCKED"),
      path: ".batch-governance/workspace.yml",
      sha: "trunk-policy-sha",
    });
    replaceDefaultFile(
      client.state,
      ".batch-governance/policies/role-mapping.yml",
      workspaceRoleMapping(["admin"]),
    );

    await expect(
      governedChanges.getGovernedChange({
        requestLocator: created.request.requestLocator,
      }),
    ).resolves.toMatchObject({ reviewState: "REJECTED" });
  });

  it("does not project an invalid request body as trusted file content", async () => {
    const client = createMockGitHubLiteClient(
      createGitHubLiteMockState({ currentUser: { login: "developer" } }),
    );
    const governedChanges = createGitHubLiteGovernedChangeClient(
      session(),
      client,
    );
    const created =
      await governedChanges.createBatchChangeRequest(registrationDraft);
    const pullRequest = findCreatedPullRequest(
      client,
      created.request.requestLocator,
    );

    pullRequest.body = pullRequest.body.replace(
      '"governedChangeId":"bgc-20260901-payment-month-end-0001"',
      '"governedChangeId":"bgc-attacker"',
    );

    const detail = await governedChanges.getGovernedChange({
      requestLocator: created.request.requestLocator,
    });

    expect(detail?.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          evidenceUnavailable: true,
          path: ".batch-governance/batches/payment.month-end.yml",
        }),
      ]),
    );
    expect(detail?.files.every((file) => file.baseContent === undefined)).toBe(
      true,
    );
    expect(detail?.files.every((file) => file.nextContent === undefined)).toBe(
      true,
    );
  });

  it("rejects a forged self approval when self approval is blocked", async () => {
    const client = createMockGitHubLiteClient(
      createGitHubLiteMockState({ currentUser: { login: "developer" } }),
    );
    const governedChanges = createGitHubLiteGovernedChangeClient(
      session(),
      client,
    );
    const created =
      await governedChanges.createBatchChangeRequest(registrationDraft);
    client.state.repositoryPermissions = client.state.repositoryPermissions.map(
      (permission) =>
        permission.username === "developer"
          ? { ...permission, permission: "maintain" }
          : permission,
    );
    const initialCommentCount = client.state.issueComments.length;

    await expect(
      governedChanges.approveGovernedChange({
        requestLocator: created.request.requestLocator,
      }),
    ).rejects.toThrow("SELF_APPROVAL_BLOCKED");
    expect(client.state.issueComments).toHaveLength(initialCommentCount);
  });

  it("accepts a self approval when the trusted policy allows it", async () => {
    const state = createGitHubLiteMockState({
      currentUser: { login: "developer" },
    });
    state.files.push({
      branch: "main",
      content: workspaceApprovalPolicy("SELF_APPROVAL_ALLOWED"),
      path: ".batch-governance/workspace.yml",
      sha: "self-approval-policy-sha",
    });
    state.repositoryPermissions = state.repositoryPermissions.map(
      (permission) =>
        permission.username === "developer"
          ? { ...permission, permission: "maintain" }
          : permission,
    );
    const client = createMockGitHubLiteClient(state);
    const governedChanges = createGitHubLiteGovernedChangeClient(
      session(),
      client,
    );
    const created =
      await governedChanges.createBatchChangeRequest(registrationDraft);

    await expect(
      governedChanges.approveGovernedChange({
        requestLocator: created.request.requestLocator,
      }),
    ).resolves.toMatchObject({ reviewState: "MERGED" });
  });

  it("uses the current authorization revision when an approver role is removed", async () => {
    const state = createGitHubLiteMockState({
      currentUser: { login: "developer" },
    });
    const client = createMockGitHubLiteClient(state);
    const governedChanges = createGitHubLiteGovernedChangeClient(
      session(),
      client,
    );
    const initialCommentCount = client.state.issueComments.length;
    const created =
      await governedChanges.createBatchChangeRequest(registrationDraft);
    preserveDefaultBranchRevision(client.state);
    client.state.branches.main = "authorization-current-sha";
    replaceDefaultFile(
      client.state,
      ".batch-governance/policies/role-mapping.yml",
      workspaceRoleMapping(["admin"]),
    );
    client.state.currentUser.login = "maintainer";
    client.state.repositoryPermissions.push({
      permission: "maintain",
      roleName: "maintain",
      username: "maintainer",
    });

    await expect(
      governedChanges.approveGovernedChange({
        requestLocator: created.request.requestLocator,
      }),
    ).rejects.toThrow("APPROVER_ROLE_REQUIRED");
    expect(client.state.issueComments).toHaveLength(initialCommentCount);
  });

  it("uses the current authorization revision when self-approval policy tightens", async () => {
    const state = createGitHubLiteMockState({
      currentUser: { login: "developer" },
    });
    state.files.push({
      branch: "main",
      content: workspaceApprovalPolicy("SELF_APPROVAL_ALLOWED"),
      path: ".batch-governance/workspace.yml",
      sha: "self-approval-policy-sha",
    });
    state.repositoryPermissions = state.repositoryPermissions.map(
      (permission) =>
        permission.username === "developer"
          ? { ...permission, permission: "maintain" }
          : permission,
    );
    const client = createMockGitHubLiteClient(state);
    const governedChanges = createGitHubLiteGovernedChangeClient(
      session(),
      client,
    );
    const initialCommentCount = client.state.issueComments.length;
    const created =
      await governedChanges.createBatchChangeRequest(registrationDraft);
    preserveDefaultBranchRevision(client.state);
    client.state.branches.main = "tightened-policy-sha";
    replaceDefaultFile(
      client.state,
      ".batch-governance/workspace.yml",
      workspaceApprovalPolicy("SELF_APPROVAL_BLOCKED"),
    );

    await expect(
      governedChanges.approveGovernedChange({
        requestLocator: created.request.requestLocator,
      }),
    ).rejects.toThrow("SELF_APPROVAL_BLOCKED");
    expect(client.state.issueComments).toHaveLength(initialCommentCount);
  });

  it("records a decision's current authorization revision and replays it from that revision", async () => {
    const mock = createMockGitHubLiteClient(
      createGitHubLiteMockState({ currentUser: { login: "developer" } }),
    );
    const client = {
      ...mock,
      mergePullRequest: vi.fn().mockResolvedValue({
        merged: false,
        message: "merge blocked",
        sha: "",
      }),
    };
    const governedChanges = createGitHubLiteGovernedChangeClient(
      session(),
      client,
    );
    const created =
      await governedChanges.createBatchChangeRequest(registrationDraft);
    preserveDefaultBranchRevision(client.state);
    client.state.branches.main = "decision-authorization-sha";
    client.state.currentUser.login = "maintainer";
    client.state.repositoryPermissions.push({
      permission: "maintain",
      roleName: "maintain",
      username: "maintainer",
    });

    await expect(
      governedChanges.approveGovernedChange({
        requestLocator: created.request.requestLocator,
      }),
    ).resolves.toMatchObject({ reviewState: "APPROVED_PENDING_MERGE" });
    const decision = parseGovernedChangeDecisionEvidence(
      client.state.issueComments.at(-1)?.body ?? "",
    );

    expect(decision?.authorizationRevisionSha).toBe(
      "decision-authorization-sha",
    );
    preserveBranchRevision(client.state, "decision-authorization");
    client.state.branches.main = "later-authorization-sha";
    replaceDefaultFile(
      client.state,
      ".batch-governance/policies/role-mapping.yml",
      workspaceRoleMapping(["admin"]),
    );

    await expect(
      governedChanges.getGovernedChange({
        requestLocator: created.request.requestLocator,
      }),
    ).resolves.toMatchObject({ reviewState: "OPEN" });

    preserveBranchRevision(client.state, "invalid-approval-current");
    client.state.branches.main = "reapproval-authorization-sha";
    client.state.currentUser.login = "admin";
    client.state.repositoryPermissions.push({
      permission: "admin",
      roleName: "admin",
      username: "admin",
    });

    await expect(
      governedChanges.approveGovernedChange({
        requestLocator: created.request.requestLocator,
      }),
    ).resolves.toMatchObject({ reviewState: "APPROVED_PENDING_MERGE" });
    expect(
      parseGovernedChangeDecisionEvidence(
        client.state.issueComments.at(-1)?.body ?? "",
      )?.authorizationRevisionSha,
    ).toBe("reapproval-authorization-sha");
  });

  it("loads creation policy and roles from the captured base revision", async () => {
    const mock = createMockGitHubLiteClient(
      createGitHubLiteMockState({ currentUser: { login: "developer" } }),
    );
    const capturedBaseRevisionSha = mock.state.branches.main!;
    const getFile = vi.fn(mock.getFile);
    let advancedDefaultBranch = false;
    const client = {
      ...mock,
      getBranchHeadSha: vi.fn(async (params) => {
        const sha = await mock.getBranchHeadSha(params);

        if (params.branch === "main" && !advancedDefaultBranch) {
          preserveDefaultBranchRevision(mock.state);
          mock.state.branches.main = "moved-main-sha";
          advancedDefaultBranch = true;
        }

        return sha;
      }),
      getFile,
    };
    const governedChanges = createGitHubLiteGovernedChangeClient(
      session(),
      client,
    );

    await expect(
      governedChanges.createBatchChangeRequest(registrationDraft),
    ).rejects.toThrow("BASE_REVISION_CHANGED");
    const authorizationReads = getFile.mock.calls
      .map(([params]) => params)
      .filter(
        (params) =>
          params.path === ".batch-governance/policies/role-mapping.yml" ||
          params.path === ".batch-governance/workspace.yml",
      );

    expect(authorizationReads).not.toHaveLength(0);
    expect(authorizationReads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ".batch-governance/policies/role-mapping.yml",
          ref: capturedBaseRevisionSha,
        }),
      ]),
    );
    expect(
      authorizationReads.every(
        (params) => params.ref === capturedBaseRevisionSha,
      ),
    ).toBe(true);
  });

  it("keeps a same-head approval actionable after a merge failure without another comment", async () => {
    const mock = createMockGitHubLiteClient(
      createGitHubLiteMockState({ currentUser: { login: "developer" } }),
    );
    const client = {
      ...mock,
      mergePullRequest: vi.fn().mockResolvedValue({
        merged: false,
        message: "merge blocked",
        sha: "",
      }),
    };
    const governedChanges = createGitHubLiteGovernedChangeClient(
      session(),
      client,
    );
    const initialCommentCount = client.state.issueComments.length;
    const created =
      await governedChanges.createBatchChangeRequest(registrationDraft);
    client.state.currentUser.login = "maintainer";
    client.state.repositoryPermissions.push({
      permission: "maintain",
      roleName: "maintain",
      username: "maintainer",
    });

    await expect(
      governedChanges.approveGovernedChange({
        requestLocator: created.request.requestLocator,
      }),
    ).resolves.toMatchObject({
      canApplyApprovedChange: true,
      reviewState: "APPROVED_PENDING_MERGE",
    });
    await governedChanges.approveGovernedChange({
      requestLocator: created.request.requestLocator,
    });

    expect(client.state.issueComments).toHaveLength(initialCommentCount + 1);
    expect(client.mergePullRequest).toHaveBeenCalledTimes(2);
  });

  it("requires reapproval when the head changes after an authorized approval", async () => {
    const mock = createMockGitHubLiteClient(
      createGitHubLiteMockState({ currentUser: { login: "developer" } }),
    );
    const client = {
      ...mock,
      mergePullRequest: vi.fn(async ({ pullNumber }) => {
        const pullRequest = mock.state.pullRequests.find(
          (candidate) => candidate.number === pullNumber,
        );

        if (!pullRequest) throw new Error("Expected pull request.");
        pullRequest.headSha = "new-unapproved-head";
        mock.state.branches[pullRequest.head] = "new-unapproved-head";
        return { merged: false, message: "head changed", sha: "" };
      }),
    };
    const governedChanges = createGitHubLiteGovernedChangeClient(
      session(),
      client,
    );
    const created =
      await governedChanges.createBatchChangeRequest(registrationDraft);
    client.state.currentUser.login = "maintainer";
    client.state.repositoryPermissions.push({
      permission: "maintain",
      roleName: "maintain",
      username: "maintainer",
    });
    await expect(
      governedChanges.approveGovernedChange({
        requestLocator: created.request.requestLocator,
      }),
    ).resolves.toMatchObject({
      evidence: { kind: "REAPPROVAL_REQUIRED", reason: "STALE_HEAD" },
      reviewState: "REAPPROVAL_REQUIRED",
    });

    await expect(
      governedChanges.getGovernedChange({
        requestLocator: created.request.requestLocator,
      }),
    ).resolves.toMatchObject({ canReject: true, canWithdraw: false });

    client.state.currentUser.login = "developer";
    await expect(
      governedChanges.getGovernedChange({
        requestLocator: created.request.requestLocator,
      }),
    ).resolves.toMatchObject({ canWithdraw: true });
  });

  it("finalizes a rejected invalid request only after disposition and close", async () => {
    const client = createMockGitHubLiteClient(
      createGitHubLiteMockState({ currentUser: { login: "developer" } }),
    );
    const governedChanges = createGitHubLiteGovernedChangeClient(
      session(),
      client,
    );
    const created =
      await governedChanges.createBatchChangeRequest(registrationDraft);
    const pullRequest = findCreatedPullRequest(
      client,
      created.request.requestLocator,
    );
    pullRequest.body = pullRequest.body.replace(
      '"requester":"developer"',
      '"requester":"attacker"',
    );
    client.state.currentUser.login = "maintainer";
    client.state.repositoryPermissions.push({
      permission: "maintain",
      roleName: "maintain",
      username: "maintainer",
    });

    await expect(
      governedChanges.getGovernedChange({
        requestLocator: created.request.requestLocator,
      }),
    ).resolves.toMatchObject({
      canReject: true,
      canWithdraw: false,
      reviewState: "REAPPROVAL_REQUIRED",
    });

    await expect(
      governedChanges.rejectGovernedChange({
        reason: "Evidence is invalid.",
        requestLocator: created.request.requestLocator,
      }),
    ).resolves.toMatchObject({
      evidence: { decision: "REJECTED", kind: "UNVERIFIED_DISPOSITION" },
      reviewState: "REJECTED",
    });
  });

  it("finalizes withdrawal of an invalid request by its authoritative PR author", async () => {
    const client = createMockGitHubLiteClient(
      createGitHubLiteMockState({ currentUser: { login: "developer" } }),
    );
    const governedChanges = createGitHubLiteGovernedChangeClient(
      session(),
      client,
    );
    const created =
      await governedChanges.createBatchChangeRequest(registrationDraft);
    const pullRequest = findCreatedPullRequest(
      client,
      created.request.requestLocator,
    );
    pullRequest.body = pullRequest.body.replace(
      '"requestedAt":"1970-01-01T00:00:00.000Z"',
      '"requestedAt":"2026-09-02T00:00:00.000Z"',
    );

    await expect(
      governedChanges.withdrawGovernedChange({
        requestLocator: created.request.requestLocator,
      }),
    ).resolves.toMatchObject({
      evidence: { decision: "WITHDRAWN", kind: "UNVERIFIED_DISPOSITION" },
      reviewState: "WITHDRAWN",
    });
  });

  it("does not project a rejection as final when closing the PR fails", async () => {
    const mock = createMockGitHubLiteClient(
      createGitHubLiteMockState({ currentUser: { login: "developer" } }),
    );
    const client = {
      ...mock,
      closeIssue: vi.fn().mockResolvedValue(undefined),
    };
    const governedChanges = createGitHubLiteGovernedChangeClient(
      session(),
      client,
    );
    const created =
      await governedChanges.createBatchChangeRequest(registrationDraft);
    client.state.currentUser.login = "maintainer";
    client.state.repositoryPermissions.push({
      permission: "maintain",
      roleName: "maintain",
      username: "maintainer",
    });

    await expect(
      governedChanges.rejectGovernedChange({
        reason: "Needs a different command.",
        requestLocator: created.request.requestLocator,
      }),
    ).resolves.toMatchObject({ reviewState: "OPEN" });
  });

  it.each([
    ["closed", false],
    ["merged", true],
  ])(
    "does not mutate a verified %s governed change when rejecting it",
    async (_description, merged) => {
      const client = createMockGitHubLiteClient(
        createGitHubLiteMockState({ currentUser: { login: "developer" } }),
      );
      const governedChanges = createGitHubLiteGovernedChangeClient(
        session(),
        client,
      );
      const created =
        await governedChanges.createBatchChangeRequest(registrationDraft);
      const pullRequest = findCreatedPullRequest(
        client,
        created.request.requestLocator,
      );
      pullRequest.state = "closed";
      pullRequest.merged = merged;
      client.state.currentUser.login = "maintainer";
      client.state.repositoryPermissions.push({
        permission: "maintain",
        roleName: "maintain",
        username: "maintainer",
      });
      const commentCount = client.state.issueComments.length;

      await expect(
        governedChanges.rejectGovernedChange({
          reason: "Too late to reject.",
          requestLocator: created.request.requestLocator,
        }),
      ).rejects.toThrow("no longer awaiting a decision");
      expect(client.state.issueComments).toHaveLength(commentCount);
    },
  );

  it("does not call an externally closed request withdrawn", async () => {
    const client = createMockGitHubLiteClient(
      createGitHubLiteMockState({ currentUser: { login: "developer" } }),
    );
    const governedChanges = createGitHubLiteGovernedChangeClient(
      session(),
      client,
    );
    const created =
      await governedChanges.createBatchChangeRequest(registrationDraft);
    findCreatedPullRequest(client, created.request.requestLocator).state =
      "closed";

    await expect(
      governedChanges.getGovernedChange({
        requestLocator: created.request.requestLocator,
      }),
    ).resolves.toMatchObject({ reviewState: "CLOSED" });
  });

  it("rejects a referenced artifact that is missing without a replacement", async () => {
    const client = createMockGitHubLiteClient(
      createGitHubLiteMockState({ currentUser: { login: "developer" } }),
    );
    const governedChanges = createGitHubLiteGovernedChangeClient(
      session(),
      client,
    );

    await expect(
      governedChanges.previewBatchChange(
        changeDraft({
          existingArtifact: {
            fileName: "runner.jar",
            locator: "vendor/releases/missing-runner.jar",
          },
        }),
      ),
    ).rejects.toThrow("Upload a replacement");
  });

  it("persists an uploaded zero-byte artifact", async () => {
    const client = createMockGitHubLiteClient(
      createGitHubLiteMockState({ currentUser: { login: "developer" } }),
    );
    const governedChanges = createGitHubLiteGovernedChangeClient(
      session(),
      client,
    );
    const draft = {
      ...registrationDraft,
      artifact: { bytes: new Uint8Array(), fileName: "empty.bin" },
    };
    const created = await governedChanges.createBatchChangeRequest(draft);
    const pullRequest = findCreatedPullRequest(
      client,
      created.request.requestLocator,
    );
    const artifact = client.state.files.find(
      (file) =>
        file.branch === pullRequest.head &&
        file.path.endsWith("/artifacts/empty.bin"),
    );

    expect(artifact).toBeDefined();
    expect(new TextEncoder().encode(artifact?.content).byteLength).toBe(0);
  });

  it("accepts GitHub renamed-file metadata as the intended old delete and new add", async () => {
    const state = createGitHubLiteMockState({
      currentUser: { login: "developer" },
    });
    state.issues = state.issues.map((issue) => ({ ...issue, state: "closed" }));
    const oldArtifactPath = "vendor/releases/runner.jar";
    state.files = state.files.map((file) =>
      file.path === ".batch-governance/batches/payment.daily-close.yml"
        ? {
            ...file,
            content: serializeBatchDefinitionYaml({
              batchId: "payment.daily-close",
              criticality: "HIGH",
              domain: "payments",
              environment: "PROD",
              execution: {
                artifactPath: oldArtifactPath,
                command: "echo close",
                runsOn: "ubuntu-latest",
              },
              gateRequired: true,
              name: "Daily close",
              owner: "ops-team",
              status: "ACTIVE",
              workflow: {
                path: ".github/workflows/payment.daily-close.yml",
                ref: "main",
              },
            }),
          }
        : file,
    );
    state.files.push({
      branch: "main",
      content: "old artifact",
      path: oldArtifactPath,
      sha: "old-artifact-sha",
    });
    const client = createMockGitHubLiteClient(state);
    const governedChanges = createGitHubLiteGovernedChangeClient(
      session(),
      client,
    );
    const created = await governedChanges.createBatchChangeRequest(
      changeDraft({
        artifact: { bytes: new Uint8Array([1]), fileName: "replacement.jar" },
        batchId: "payment.daily-close",
        existingArtifact: {
          fileName: "runner.jar",
          locator: oldArtifactPath,
        },
      }),
    );
    const pullRequest = findCreatedPullRequest(
      client,
      created.request.requestLocator,
    );
    const newArtifactPath =
      ".batch-governance/batches/payment.daily-close/artifacts/replacement.jar";
    client.state.pullRequestFiles[pullRequest.number] =
      client.state.pullRequestFiles[pullRequest.number]!.filter(
        (file) =>
          file.path !== oldArtifactPath && file.path !== newArtifactPath,
      ).concat({
        path: newArtifactPath,
        previousPath: oldArtifactPath,
        status: "renamed",
      });

    await expect(
      governedChanges.getGovernedChange({
        requestLocator: created.request.requestLocator,
      }),
    ).resolves.toMatchObject({ evidence: { kind: "VERIFIED_V2" } });
  });
});

describe("governed artifact preparation", () => {
  it.each([
    ["definition", "MODIFIED", "DELETED"],
    ["workflow", "DELETED", "MODIFIED"],
  ] as const)(
    "blocks deletion when the %s is already missing",
    (_label, definitionStatus, workflowStatus) => {
      expect(() =>
        assertPreparedChangeTargets("DELETE", [
          {
            path: getBatchDefinitionPath("payment.daily-close"),
            status: definitionStatus,
          },
          {
            path: getBatchWorkflowPath("payment.daily-close"),
            status: workflowStatus,
          },
        ]),
      ).toThrow("no longer exists");
    },
  );

  it("preserves an opaque existing artifact locator without an upload", () => {
    const prepared = prepareGovernedChange(
      changeDraft({
        existingArtifact: {
          fileName: "runner.jar",
          locator: "vendor/releases/runner.jar",
        },
      }),
      "bgc-artifact-preserve",
    );

    expect(prepared.files).toContainEqual({
      bytes: undefined,
      kind: "ARTIFACT",
      path: "vendor/releases/runner.jar",
    });
  });

  it("replaces a same-name artifact at its opaque existing locator", () => {
    const prepared = prepareGovernedChange(
      changeDraft({
        artifact: { bytes: new Uint8Array([1, 2]), fileName: "runner.jar" },
        existingArtifact: {
          fileName: "runner.jar",
          locator: "vendor/releases/runner.jar",
        },
      }),
      "bgc-artifact-replace",
    );

    expect(prepared.files.filter((file) => file.kind === "ARTIFACT")).toEqual([
      {
        bytes: new Uint8Array([1, 2]),
        kind: "ARTIFACT",
        path: "vendor/releases/runner.jar",
      },
    ]);
  });

  it("removes the old artifact and adds the new artifact for a rename", () => {
    const prepared = prepareGovernedChange(
      changeDraft({
        artifact: { bytes: new Uint8Array([1]), fileName: "replacement.jar" },
        existingArtifact: {
          fileName: "runner.jar",
          locator: "vendor/releases/runner.jar",
        },
      }),
      "bgc-artifact-rename",
    );

    expect(prepared.files.filter((file) => file.kind === "ARTIFACT")).toEqual([
      { bytes: null, kind: "ARTIFACT", path: "vendor/releases/runner.jar" },
      {
        bytes: new Uint8Array([1]),
        kind: "ARTIFACT",
        path: ".batch-governance/batches/payment.month-end/artifacts/replacement.jar",
      },
    ]);
  });

  it("keeps a zero-byte replacement distinct from an absent artifact", () => {
    const prepared = prepareGovernedChange(
      changeDraft({
        artifact: { bytes: new Uint8Array(), fileName: "runner.jar" },
        existingArtifact: {
          fileName: "runner.jar",
          locator: "vendor/releases/runner.jar",
        },
      }),
      "bgc-artifact-empty",
    );

    expect(prepared.files).toContainEqual({
      bytes: new Uint8Array(),
      kind: "ARTIFACT",
      path: "vendor/releases/runner.jar",
    });
  });

  it("deletes the exact opaque artifact locator with its batch", () => {
    const prepared = prepareGovernedChange(
      {
        ...changeDraft({
          existingArtifact: {
            fileName: "runner.jar",
            locator: "vendor/releases/runner.jar",
          },
        }),
        mode: "delete",
      },
      "bgc-artifact-delete",
    );

    expect(prepared.files).toContainEqual({
      bytes: null,
      kind: "ARTIFACT",
      path: "vendor/releases/runner.jar",
    });
  });

  it("orders prepared artifact files deterministically", () => {
    const prepared = prepareGovernedChange(
      changeDraft({
        artifact: { bytes: new Uint8Array([1]), fileName: "replacement.jar" },
        existingArtifact: {
          fileName: "runner.jar",
          locator: "vendor/releases/runner.jar",
        },
      }),
      "bgc-artifact-order",
    );

    expect(prepared.files.map((file) => file.path)).toEqual([
      ".batch-governance/batches/payment.month-end.yml",
      ".github/workflows/payment.month-end.yml",
      "vendor/releases/runner.jar",
      ".batch-governance/batches/payment.month-end/artifacts/replacement.jar",
    ]);
  });
});

function session() {
  return { owner: "always0ne", repo: "batch", token: "fixture-token" };
}

function findCreatedPullRequest(
  client: ReturnType<typeof createMockGitHubLiteClient>,
  requestLocator: string,
) {
  const pullRequest = client.state.pullRequests.find(
    (candidate) => candidate.number === Number(requestLocator),
  );

  if (!pullRequest) throw new Error("Expected governed change pull request.");

  return pullRequest;
}

function alignMockBatchWithGeneratedWorkflow(
  state: GitHubLiteMockState,
  batchId: string,
): void {
  const definitionFile = state.files.find(
    (file) =>
      file.branch === state.repository.defaultBranch &&
      file.path === getBatchDefinitionPath(batchId),
  );
  const workflowFile = state.files.find(
    (file) =>
      file.branch === state.repository.defaultBranch &&
      file.path === getBatchWorkflowPath(batchId),
  );
  if (!definitionFile || !workflowFile) {
    throw new Error("Expected BatchDefinition and workflow fixtures.");
  }

  const definition = {
    ...parseBatchDefinitionYaml(definitionFile.content),
    governedChangeId: "bgc-existing-payment-daily-close",
  };
  definitionFile.content = serializeBatchDefinitionYaml(definition);
  workflowFile.content = buildBatchWorkflowYaml(definition);
}

function executionRequestIssue({ labels }: { labels: string[] }) {
  return {
    author: "developer",
    body: [
      "<!-- batchplane:execution-request",
      "requestId=btr-20260901-payment-daily-close-0001",
      "batchId=payment.daily-close",
      "requestDigest=sha256:request",
      "-->",
    ].join("\n"),
    isPullRequest: false,
    labels,
    number: 99,
    state: "open" as const,
    title: "Run batch payment.daily-close",
    url: "https://github.com/always0ne/batch/issues/99",
  };
}

function workspaceAutoApprovalPolicy(): string {
  return workspaceApprovalPolicy("AUTO_APPROVE");
}

function workspaceApprovalPolicy(
  mode: "AUTO_APPROVE" | "SELF_APPROVAL_ALLOWED" | "SELF_APPROVAL_BLOCKED",
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

function preserveDefaultBranchRevision(state: GitHubLiteMockState): void {
  preserveBranchRevision(state, "request-base");
}

function renameDefaultBranch(
  state: GitHubLiteMockState,
  defaultBranch: string,
): void {
  const previousDefaultBranch = state.repository.defaultBranch;
  const revisionSha = state.branches[previousDefaultBranch];

  if (!revisionSha) throw new Error("Expected default branch SHA.");
  state.repository.defaultBranch = defaultBranch;
  state.branches[defaultBranch] = revisionSha;
  state.files.push(
    ...state.files
      .filter((file) => file.branch === previousDefaultBranch)
      .map((file) => ({ ...file, branch: defaultBranch })),
  );
}

function preserveBranchRevision(
  state: GitHubLiteMockState,
  snapshotBranch: string,
): void {
  const defaultBranch = state.repository.defaultBranch;
  const baseRevisionSha = state.branches[defaultBranch];

  if (!baseRevisionSha) throw new Error("Expected default branch SHA.");
  state.branches[snapshotBranch] = baseRevisionSha;
  state.files.push(
    ...state.files
      .filter((file) => file.branch === defaultBranch)
      .map((file) => ({ ...file, branch: snapshotBranch })),
  );
}

function replaceDefaultFile(
  state: GitHubLiteMockState,
  path: string,
  content: string,
): void {
  const file = state.files.find(
    (candidate) =>
      candidate.branch === state.repository.defaultBranch &&
      candidate.path === path,
  );

  if (!file) throw new Error(`Expected default-branch file ${path}.`);
  file.content = content;
}

function workspaceRoleMapping(approverRoles: string[]): string {
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
    `      repositoryRoles: [${approverRoles.map((role) => `"${role}"`).join(", ")}]`,
    "    maintainer:",
    '      repositoryRoles: ["maintain", "admin"]',
    "    auditor:",
    '      repositoryRoles: ["triage"]',
    "",
  ].join("\n");
}

function changeDraft(
  overrides: Partial<BatchChangeDraft["batch"]> & {
    artifact?: BatchChangeDraft["artifact"];
  },
): BatchChangeDraft {
  const { artifact, ...batch } = overrides;

  return {
    ...registrationDraft,
    ...(artifact ? { artifact } : {}),
    batch: { ...registrationDraft.batch, ...batch },
    mode: "change",
    targetBatchId: batch.batchId ?? registrationDraft.batch.batchId,
  };
}
