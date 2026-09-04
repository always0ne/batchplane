import { describe, expect, it } from "vitest";
import type { BatchDefinition } from "@batchplane/domain";
import { createTargetRevisionDigest } from "@batchplane/domain";
import { sha256BytesHex } from "@batchplane/digest";
import {
  buildGovernedChangeRequestBody,
  createGitHubLiteMockState,
  createMockGitHubLiteClient,
  serializeBatchDefinitionYaml,
  type GitHubLiteMockState,
} from "@batchplane/github-lite";

import {
  buildSampleTargetWorkflowYaml,
  buildWorkspacePolicyYaml,
} from "../features/lite-setup/installation-model";
import {
  buildFailureFollowUpComment,
  buildFailureFollowUpReviewComment,
} from "../features/execution-requests/failure-follow-up-model";
import { createGitHubLiteRuntime } from "./github-lite-runtime";

const session = {
  owner: "always0ne",
  repo: "batch",
  token: "ghp_test",
};

type DeletedArchiveFixtureOptions = {
  body?: string;
  definitionContent?: string;
  evidenceDefinitionContent?: string;
  modifyEvidence?: (body: string) => string;
  omitDefinition?: boolean;
};

async function createDeletedArchiveState(
  options: DeletedArchiveFixtureOptions = {},
): Promise<GitHubLiteMockState> {
  const state = createGitHubLiteMockState();
  const batchId = "payment.daily-close";
  const definitionPath = `.batch-governance/batches/${batchId}.yml`;
  const workflowPath = `.github/workflows/${batchId}.yml`;
  const baseBranch = "archive-base";
  const headBranch = "archive-delete";
  const baseRevisionSha = "archive-base-sha";
  const headRevisionSha = "archive-head-sha";
  const workflowFile = state.files.find(
    (file) => file.branch === "main" && file.path === workflowPath,
  );
  const roleMappingFile = state.files.find(
    (file) =>
      file.branch === "main" &&
      file.path === ".batch-governance/policies/role-mapping.yml",
  );

  if (!workflowFile || !roleMappingFile) {
    throw new Error("The default mock state is missing archive fixture files.");
  }

  const batchDefinition: BatchDefinition = {
    batchId,
    criticality: "HIGH",
    domain: "payments",
    environment: "PROD",
    execution: {
      command: "echo mock batch",
      runsOn: "ubuntu-latest",
    },
    gateRequired: true,
    name: "Daily Close",
    owner: "ops-team",
    schedules: [
      {
        cron: "0 5 * * *",
        enabled: true,
        name: "Daily settlement window",
        scheduleId: `${batchId}-daily`,
        timezone: "Asia/Seoul",
      },
    ],
    status: "ACTIVE",
    workflow: {
      path: workflowPath,
      ref: "main",
    },
  };
  const defaultDefinitionContent =
    serializeBatchDefinitionYaml(batchDefinition);
  const definitionContent =
    options.definitionContent ?? defaultDefinitionContent;
  const evidenceDefinitionContent =
    options.evidenceDefinitionContent ?? defaultDefinitionContent;
  const artifacts = [
    {
      afterDigest: null,
      beforeDigest: await sha256BytesHex(
        new TextEncoder().encode(evidenceDefinitionContent),
      ),
      kind: "BATCH_DEFINITION" as const,
      path: definitionPath,
    },
    {
      afterDigest: null,
      beforeDigest: await sha256BytesHex(
        new TextEncoder().encode(workflowFile.content),
      ),
      kind: "WORKFLOW" as const,
      path: workflowPath,
    },
  ];
  const evidence = {
    artifacts,
    baseRevisionSha,
    batchId,
    governedChangeId: "bgc-delete-payment-daily-close-1",
    headRevisionSha,
    repository: "always0ne/batch",
    requester: "developer",
    requestedAt: "2026-09-04T00:00:00.000Z",
    targetRevisionDigest: await createTargetRevisionDigest(artifacts),
    type: "DELETE" as const,
    version: "batchplane.io/governed-change/v2" as const,
    workspace: "always0ne/batch",
  };
  const requestBody = buildGovernedChangeRequestBody(evidence);
  const body =
    options.body ?? options.modifyEvidence?.(requestBody) ?? requestBody;

  state.branches = {
    ...state.branches,
    [baseBranch]: baseRevisionSha,
    [headBranch]: headRevisionSha,
  };
  state.files = [
    ...state.files,
    {
      branch: baseBranch,
      content: definitionContent,
      path: definitionPath,
      sha: "archive-base-definition-sha",
    },
    {
      branch: baseBranch,
      content: workflowFile.content,
      path: workflowPath,
      sha: "archive-base-workflow-sha",
    },
    {
      branch: baseBranch,
      content: roleMappingFile.content,
      path: roleMappingFile.path,
      sha: "archive-base-role-mapping-sha",
    },
  ].filter((file) => !(options.omitDefinition && file.path === definitionPath));
  state.pullRequests = [
    {
      author: "developer",
      base: "main",
      baseSha: baseRevisionSha,
      body,
      createdAt: evidence.requestedAt,
      head: `batchplane/delete/${batchId}-20260904000000-delete-1`,
      headSha: headRevisionSha,
      merged: true,
      number: 40,
      state: "closed",
      title: `Delete batch ${batchId}`,
      url: "https://github.com/always0ne/batch/pull/40",
    },
  ];
  state.pullRequestFiles = {
    40: [
      { path: definitionPath, status: "removed" },
      { path: workflowPath, status: "removed" },
    ],
  };

  return state;
}

describe("createGitHubLiteRuntime", () => {
  it("loads batch definitions through the BatchPort", async () => {
    const fetcher: typeof fetch = async (input) => {
      const url = input.toString();

      if (
        url ===
        "https://api.github.com/repos/always0ne/batch/contents/.batch-governance/batches?ref=main"
      ) {
        return Response.json([
          {
            name: "payment.daily-close.yml",
            path: ".batch-governance/batches/payment.daily-close.yml",
            sha: "dir-sha",
            type: "file",
          },
        ]);
      }

      if (
        url ===
        "https://api.github.com/repos/always0ne/batch/contents/.batch-governance/batches/payment.daily-close.yml?ref=main"
      ) {
        return Response.json({
          content: btoa(
            [
              'apiVersion: "batchplane.io/v1"',
              'kind: "BatchDefinition"',
              "metadata:",
              '  id: "payment.daily-close"',
              '  name: "Daily Close"',
              "spec:",
              '  owner: "ops-team"',
              '  domain: "payments"',
              '  environment: "PROD"',
              '  criticality: "HIGH"',
              '  status: "ACTIVE"',
              "  workflow:",
              '    path: ".github/workflows/payment.daily-close.yml"',
              '    ref: "main"',
              "  gateRequired: true",
              "",
            ].join("\n"),
          ),
          encoding: "base64",
          path: ".batch-governance/batches/payment.daily-close.yml",
          sha: "file-sha",
        });
      }

      return Response.json({ message: "Not Found" }, { status: 404 });
    };
    const runtime = createGitHubLiteRuntime(session, { fetcher });

    await expect(
      runtime.batches.listBatchDefinitions({ ref: "main" }),
    ).resolves.toEqual([
      expect.objectContaining({
        batchId: "payment.daily-close",
        gateRequired: true,
        status: "ACTIVE",
      }),
    ]);
  });

  it("returns a verified deleted archive from the request base revision", async () => {
    const state = await createDeletedArchiveState();
    const runtime = createGitHubLiteRuntime(session, {
      client: createMockGitHubLiteClient(state),
    });

    const result = await runtime.batches.getDeletedBatchArchive({
      batchId: "payment.daily-close",
    });

    expect(result).not.toBeNull();
    if (!result) return;

    expect(result.status).toBe("VERIFIED");

    if (result.status !== "VERIFIED") return;

    expect(result.sourceRequest).toEqual({
      locator: "40",
      number: 40,
      url: "https://github.com/always0ne/batch/pull/40",
    });
    expect(result.batch).toEqual(
      expect.objectContaining({
        batchId: "payment.daily-close",
        execution: expect.objectContaining({ command: "echo mock batch" }),
        name: "Daily Close",
        schedules: expect.arrayContaining([
          expect.objectContaining({
            scheduleId: "payment.daily-close-daily",
          }),
        ]),
      }),
    );
  });

  it("returns unavailable for legacy or malformed archive evidence", async () => {
    const state = await createDeletedArchiveState({
      body: [
        "## BatchPlane Deletion",
        "",
        "- Batch ID: `payment.daily-close`",
        "- Name: `Forged from an old PR body`",
      ].join("\n"),
    });
    const runtime = createGitHubLiteRuntime(session, {
      client: createMockGitHubLiteClient(state),
    });

    const result = await runtime.batches.getDeletedBatchArchive({
      batchId: "payment.daily-close",
    });

    expect(result).not.toBeNull();
    if (!result) return;

    expect(result).toEqual({
      sourceRequest: {
        locator: "40",
        number: 40,
        url: "https://github.com/always0ne/batch/pull/40",
      },
      status: "UNAVAILABLE",
      unavailableReason: "LEGACY_OR_MALFORMED_EVIDENCE",
    });
    expect(result).not.toHaveProperty("batch");
  });

  it("returns unavailable when governed evidence does not describe a delete", async () => {
    const state = await createDeletedArchiveState({
      modifyEvidence: (body) =>
        body.replace('"type":"DELETE"', '"type":"CHANGE"'),
    });
    const runtime = createGitHubLiteRuntime(session, {
      client: createMockGitHubLiteClient(state),
    });

    const result = await runtime.batches.getDeletedBatchArchive({
      batchId: "payment.daily-close",
    });

    expect(result).not.toBeNull();
    if (!result) return;

    expect(result).toEqual({
      sourceRequest: {
        locator: "40",
        number: 40,
        url: "https://github.com/always0ne/batch/pull/40",
      },
      status: "UNAVAILABLE",
      unavailableReason: "REQUEST_EVIDENCE_MISMATCH",
    });
    expect(result).not.toHaveProperty("batch");
  });

  it("returns unavailable when the deletion base definition is missing", async () => {
    const state = await createDeletedArchiveState({ omitDefinition: true });
    const runtime = createGitHubLiteRuntime(session, {
      client: createMockGitHubLiteClient(state),
    });

    const result = await runtime.batches.getDeletedBatchArchive({
      batchId: "payment.daily-close",
    });

    expect(result).not.toBeNull();
    if (!result) return;

    expect(result).toEqual({
      sourceRequest: {
        locator: "40",
        number: 40,
        url: "https://github.com/always0ne/batch/pull/40",
      },
      status: "UNAVAILABLE",
      unavailableReason: "BATCH_DEFINITION_NOT_FOUND",
    });
    expect(result).not.toHaveProperty("batch");
  });

  it("returns unavailable when the deletion base revision cannot be loaded", async () => {
    const state = await createDeletedArchiveState();
    delete state.branches["archive-base"];
    const runtime = createGitHubLiteRuntime(session, {
      client: createMockGitHubLiteClient(state),
    });

    const result = await runtime.batches.getDeletedBatchArchive({
      batchId: "payment.daily-close",
    });

    expect(result).not.toBeNull();
    if (!result) return;

    expect(result).toEqual({
      sourceRequest: {
        locator: "40",
        number: 40,
        url: "https://github.com/always0ne/batch/pull/40",
      },
      status: "UNAVAILABLE",
      unavailableReason: "BASE_REVISION_UNAVAILABLE",
    });
    expect(result).not.toHaveProperty("batch");
  });

  it("returns unavailable when the archived base definition is malformed", async () => {
    const malformedDefinition = "apiVersion: [\n";
    const state = await createDeletedArchiveState({
      definitionContent: malformedDefinition,
      evidenceDefinitionContent: malformedDefinition,
    });
    const runtime = createGitHubLiteRuntime(session, {
      client: createMockGitHubLiteClient(state),
    });

    const result = await runtime.batches.getDeletedBatchArchive({
      batchId: "payment.daily-close",
    });

    expect(result).not.toBeNull();
    if (!result) return;

    expect(result).toEqual({
      sourceRequest: {
        locator: "40",
        number: 40,
        url: "https://github.com/always0ne/batch/pull/40",
      },
      status: "UNAVAILABLE",
      unavailableReason: "BATCH_DEFINITION_MALFORMED",
    });
    expect(result).not.toHaveProperty("batch");
  });

  it("returns unavailable when the base definition digest differs from evidence", async () => {
    const state = await createDeletedArchiveState({
      definitionContent: `${serializeBatchDefinitionYaml({
        batchId: "payment.daily-close",
        criticality: "HIGH",
        domain: "payments",
        environment: "PROD",
        execution: {
          command: "echo changed batch",
          runsOn: "ubuntu-latest",
        },
        gateRequired: true,
        name: "Daily Close",
        owner: "ops-team",
        status: "ACTIVE",
        workflow: {
          path: ".github/workflows/payment.daily-close.yml",
          ref: "main",
        },
      })}`,
    });
    const runtime = createGitHubLiteRuntime(session, {
      client: createMockGitHubLiteClient(state),
    });

    const result = await runtime.batches.getDeletedBatchArchive({
      batchId: "payment.daily-close",
    });

    expect(result).not.toBeNull();
    if (!result) return;

    expect(result).toEqual({
      sourceRequest: {
        locator: "40",
        number: 40,
        url: "https://github.com/always0ne/batch/pull/40",
      },
      status: "UNAVAILABLE",
      unavailableReason: "BATCH_DEFINITION_DIGEST_MISMATCH",
    });
    expect(result).not.toHaveProperty("batch");
  });

  it("returns unavailable when authoritative request verification fails", async () => {
    const state = await createDeletedArchiveState();
    state.repositoryPermissions = state.repositoryPermissions.filter(
      (permission) => permission.username !== "developer",
    );
    const runtime = createGitHubLiteRuntime(session, {
      client: createMockGitHubLiteClient(state),
    });

    const result = await runtime.batches.getDeletedBatchArchive({
      batchId: "payment.daily-close",
    });

    expect(result).not.toBeNull();
    if (!result) return;

    expect(result).toEqual({
      sourceRequest: {
        locator: "40",
        number: 40,
        url: "https://github.com/always0ne/batch/pull/40",
      },
      status: "UNAVAILABLE",
      unavailableReason: "REQUEST_EVIDENCE_UNVERIFIED",
    });
    expect(result).not.toHaveProperty("batch");
  });

  it("uses the newest merged delete request as the archive source", async () => {
    const state = await createDeletedArchiveState();
    const newestRequest = {
      ...state.pullRequests[0]!,
      body: "Legacy delete request body",
      head: "batchplane/delete/payment.daily-close-20260904000001-delete-2",
      number: 41,
      title: "Delete batch payment.daily-close",
      url: "https://github.com/always0ne/batch/pull/41",
    };

    state.pullRequests = [state.pullRequests[0]!, newestRequest];
    state.pullRequestFiles[41] = [];

    const runtime = createGitHubLiteRuntime(session, {
      client: createMockGitHubLiteClient(state),
    });

    const result = await runtime.batches.getDeletedBatchArchive({
      batchId: "payment.daily-close",
    });

    expect(result).not.toBeNull();
    if (!result) return;

    expect(result).toEqual({
      sourceRequest: {
        locator: "41",
        number: 41,
        url: "https://github.com/always0ne/batch/pull/41",
      },
      status: "UNAVAILABLE",
      unavailableReason: "LEGACY_OR_MALFORMED_EVIDENCE",
    });
  });

  it("previews governed file changes against the base branch", async () => {
    const state = createGitHubLiteMockState();
    const client = createMockGitHubLiteClient(state);
    const runtime = createGitHubLiteRuntime(session, { client });
    const batchFile = state.files.find(
      (file) =>
        file.branch === "main" &&
        file.path === ".batch-governance/batches/payment.daily-close.yml",
    );

    expect(batchFile).toBeDefined();

    const preview = await runtime.registration.previewGovernedChangeFiles({
      baseBranch: "main",
      files: [
        {
          content: batchFile?.content ?? "",
          path: ".batch-governance/batches/payment.daily-close.yml",
        },
        {
          content: "name: Updated workflow\n",
          path: ".github/workflows/payment.daily-close.yml",
        },
        {
          content: "new: file\n",
          path: ".batch-governance/batches/new-batch.yml",
        },
        {
          content: null,
          path: ".batch-governance/policies/role-mapping.yml",
        },
      ],
    });

    expect(preview.map((file) => [file.path, file.status])).toEqual([
      [".batch-governance/batches/payment.daily-close.yml", "UNCHANGED"],
      [".github/workflows/payment.daily-close.yml", "MODIFIED"],
      [".batch-governance/batches/new-batch.yml", "ADDED"],
      [".batch-governance/policies/role-mapping.yml", "DELETED"],
    ]);
  });

  it("updates existing governed files with file SHAs during change-mode PR creation", async () => {
    const requests: Array<{ body: unknown; method: string; url: string }> = [];
    const branch = "batchplane/change/payment.daily-close-20260514010203";
    const fetcher: typeof fetch = async (input, init) => {
      const url = input.toString();
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(init.body.toString()) : null;
      const parsedUrl = new URL(url);

      requests.push({ body, method, url });

      if (url.endsWith("/git/ref/heads/main")) {
        return Response.json({
          object: { sha: "mock-main-sha", type: "commit", url: "" },
          ref: "refs/heads/main",
        });
      }

      if (url.endsWith("/git/refs") && method === "POST") {
        return Response.json({
          object: { sha: "mock-main-sha", type: "commit", url: "" },
          ref: `refs/heads/${branch}`,
        });
      }

      if (
        parsedUrl.pathname ===
          "/repos/always0ne/batch/contents/.batch-governance/batches/payment.daily-close.yml" &&
        parsedUrl.searchParams.get("ref") === branch
      ) {
        return Response.json({
          content: btoa('metadata:\n  id: "payment.daily-close"\n'),
          encoding: "base64",
          path: ".batch-governance/batches/payment.daily-close.yml",
          sha: "existing-batch-sha",
        });
      }

      if (
        parsedUrl.pathname ===
          "/repos/always0ne/batch/contents/.github/workflows/payment.daily-close.yml" &&
        parsedUrl.searchParams.get("ref") === branch
      ) {
        return Response.json({
          content: btoa("name: Existing workflow\n"),
          encoding: "base64",
          path: ".github/workflows/payment.daily-close.yml",
          sha: "existing-workflow-sha",
        });
      }

      if (
        url.endsWith(
          "/contents/.batch-governance/batches/payment.daily-close.yml",
        ) &&
        method === "PUT"
      ) {
        return Response.json({
          content: {
            path: ".batch-governance/batches/payment.daily-close.yml",
            sha: "updated-batch-sha",
          },
        });
      }

      if (
        url.endsWith("/contents/.github/workflows/payment.daily-close.yml") &&
        method === "PUT"
      ) {
        return Response.json({
          content: {
            path: ".github/workflows/payment.daily-close.yml",
            sha: "updated-workflow-sha",
          },
        });
      }

      if (url.endsWith("/pulls") && method === "POST") {
        return Response.json({
          base: { ref: "main" },
          body: "body",
          head: { ref: branch },
          html_url: "https://github.com/always0ne/batch/pull/13",
          number: 13,
          state: "open",
          title: "Change batch payment.daily-close",
          user: { login: "maintainer" },
        });
      }

      return Response.json({ message: "Not Found" }, { status: 404 });
    };
    const runtime = createGitHubLiteRuntime(session, { fetcher });

    await expect(
      runtime.registration.createRegistrationPullRequest({
        baseBranch: "main",
        batchDefinitionPath:
          ".batch-governance/batches/payment.daily-close.yml",
        batchDefinitionYaml: 'metadata:\n  id: "payment.daily-close"\n',
        body: "body",
        branch,
        title: "Change batch payment.daily-close",
        workflowPath: ".github/workflows/payment.daily-close.yml",
        workflowYaml: "name: Updated workflow\n",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        number: 13,
        title: "Change batch payment.daily-close",
      }),
    );

    expect(requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          body: expect.objectContaining({
            branch,
            sha: "existing-batch-sha",
          }),
          method: "PUT",
          url: "https://api.github.com/repos/always0ne/batch/contents/.batch-governance/batches/payment.daily-close.yml",
        }),
        expect.objectContaining({
          body: expect.objectContaining({
            branch,
            sha: "existing-workflow-sha",
          }),
          method: "PUT",
          url: "https://api.github.com/repos/always0ne/batch/contents/.github/workflows/payment.daily-close.yml",
        }),
        expect.objectContaining({
          body: expect.objectContaining({
            branch,
          }),
          method: "PUT",
          url: "https://api.github.com/repos/always0ne/batch/contents/.github/workflows/payment.daily-close.yml",
        }),
      ]),
    );
  });

  it("creates governed delete pull requests by removing batch files from a branch", async () => {
    const requests: Array<{ body: unknown; method: string; url: string }> = [];
    const branch = "batchplane/delete/payment.daily-close-20260514010203";
    const fetcher: typeof fetch = async (input, init) => {
      const url = input.toString();
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(init.body.toString()) : null;
      const parsedUrl = new URL(url);

      requests.push({ body, method, url });

      if (url.endsWith("/git/ref/heads/main")) {
        return Response.json({
          object: { sha: "mock-main-sha", type: "commit", url: "" },
          ref: "refs/heads/main",
        });
      }

      if (
        parsedUrl.pathname ===
          "/repos/always0ne/batch/contents/.batch-governance/batches/payment.daily-close.yml" &&
        parsedUrl.searchParams.get("ref") === "main"
      ) {
        return Response.json({
          content: btoa('metadata:\n  id: "payment.daily-close"\n'),
          encoding: "base64",
          path: ".batch-governance/batches/payment.daily-close.yml",
          sha: "existing-batch-sha",
        });
      }

      if (
        parsedUrl.pathname ===
          "/repos/always0ne/batch/contents/.github/workflows/payment.daily-close.yml" &&
        parsedUrl.searchParams.get("ref") === "main"
      ) {
        return Response.json({
          content: btoa("name: Existing workflow\n"),
          encoding: "base64",
          path: ".github/workflows/payment.daily-close.yml",
          sha: "existing-workflow-sha",
        });
      }

      if (url.endsWith("/git/refs") && method === "POST") {
        return Response.json({
          object: { sha: "mock-main-sha", type: "commit", url: "" },
          ref: `refs/heads/${branch}`,
        });
      }

      if (
        url.endsWith(
          "/contents/.batch-governance/batches/payment.daily-close.yml",
        ) &&
        method === "DELETE"
      ) {
        return Response.json({
          content: {
            path: ".batch-governance/batches/payment.daily-close.yml",
            sha: "deleted-batch-sha",
          },
        });
      }

      if (
        url.endsWith("/contents/.github/workflows/payment.daily-close.yml") &&
        method === "DELETE"
      ) {
        return Response.json({
          content: {
            path: ".github/workflows/payment.daily-close.yml",
            sha: "deleted-workflow-sha",
          },
        });
      }

      if (url.endsWith("/pulls") && method === "POST") {
        return Response.json({
          base: { ref: "main" },
          body: "body",
          head: { ref: branch },
          html_url: "https://github.com/always0ne/batch/pull/14",
          number: 14,
          state: "open",
          title: "Delete batch payment.daily-close",
          user: { login: "maintainer" },
        });
      }

      return Response.json({ message: "Not Found" }, { status: 404 });
    };
    const runtime = createGitHubLiteRuntime(session, { fetcher });

    await expect(
      runtime.registration.createBatchDeletionPullRequest({
        baseBranch: "main",
        batchDefinitionPath:
          ".batch-governance/batches/payment.daily-close.yml",
        body: "body",
        branch,
        title: "Delete batch payment.daily-close",
        workflowPath: ".github/workflows/payment.daily-close.yml",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        number: 14,
        title: "Delete batch payment.daily-close",
      }),
    );

    expect(requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          body: expect.objectContaining({
            branch,
            sha: "existing-batch-sha",
          }),
          method: "DELETE",
          url: "https://api.github.com/repos/always0ne/batch/contents/.batch-governance/batches/payment.daily-close.yml",
        }),
        expect.objectContaining({
          body: expect.objectContaining({
            branch,
            sha: "existing-workflow-sha",
          }),
          method: "DELETE",
          url: "https://api.github.com/repos/always0ne/batch/contents/.github/workflows/payment.daily-close.yml",
        }),
      ]),
    );
  });

  it("approves registration requests through the ApprovalPort", async () => {
    const requests: Array<{ body: unknown; method: string; url: string }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      requests.push({
        body: init?.body ? JSON.parse(init.body.toString()) : null,
        method: init?.method ?? "GET",
        url: input.toString(),
      });

      if (input.toString().endsWith("/issues/12/comments")) {
        return Response.json({ body: "approved", id: 1 });
      }

      if (input.toString().endsWith("/pulls/12/merge")) {
        return Response.json({
          merged: true,
          message: "Pull Request successfully merged",
          sha: "merge-sha",
        });
      }

      return Response.json({ message: "Not Found" }, { status: 404 });
    };
    const runtime = createGitHubLiteRuntime(session, { fetcher });

    await expect(
      runtime.approvals.approveRegistration({
        body: "approved",
        commitTitle: "Register batch payment.daily-close (#12)",
        pullNumber: 12,
      }),
    ).resolves.toEqual({
      merged: true,
      message: "Pull Request successfully merged",
      sha: "merge-sha",
    });
    expect(requests).toEqual([
      expect.objectContaining({
        body: { body: "approved" },
        method: "POST",
        url: "https://api.github.com/repos/always0ne/batch/issues/12/comments",
      }),
      expect.objectContaining({
        body: {
          commit_title: "Register batch payment.daily-close (#12)",
          merge_method: "squash",
        },
        method: "PUT",
        url: "https://api.github.com/repos/always0ne/batch/pulls/12/merge",
      }),
    ]);
  });

  it("loads execution request comments through the ApprovalPort", async () => {
    const fetcher: typeof fetch = async (input) => {
      if (new URL(input.toString()).pathname.endsWith("/issues/101/comments")) {
        return Response.json([
          {
            body: "## BatchPlane Execution Approval",
            created_at: "2026-05-14T01:05:00.000Z",
            id: 1011,
            user: { login: "maintainer" },
          },
        ]);
      }

      return Response.json({ message: "Not Found" }, { status: 404 });
    };
    const runtime = createGitHubLiteRuntime(session, { fetcher });

    await expect(
      runtime.approvals.listExecutionRequestComments({ issueNumber: 101 }),
    ).resolves.toEqual([
      {
        author: "maintainer",
        body: "## BatchPlane Execution Approval",
        createdAt: "2026-05-14T01:05:00.000Z",
        id: 1011,
        issueNumber: 101,
        updatedAt: "2026-05-14T01:05:00.000Z",
      },
    ]);
  });

  it("loads registration request files through the ApprovalPort", async () => {
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(input.toString());

      if (
        url.pathname ===
          "/repos/always0ne/batch/contents/.github/workflows/payment.daily-close.yml" &&
        url.searchParams.get("ref") ===
          "batchplane/register/payment.daily-close-20260514010203"
      ) {
        return Response.json({
          content: btoa("name: BatchPlane - Daily Close\n"),
          encoding: "base64",
          path: ".github/workflows/payment.daily-close.yml",
          sha: "workflow-sha",
        });
      }

      return Response.json({ message: "Not Found" }, { status: 404 });
    };
    const runtime = createGitHubLiteRuntime(session, { fetcher });

    await expect(
      runtime.approvals.readRegistrationRequestFile({
        path: ".github/workflows/payment.daily-close.yml",
        ref: "batchplane/register/payment.daily-close-20260514010203",
      }),
    ).resolves.toEqual({
      content: "name: BatchPlane - Daily Close\n",
      path: ".github/workflows/payment.daily-close.yml",
      ref: "batchplane/register/payment.daily-close-20260514010203",
    });
    await expect(
      runtime.approvals.readRegistrationRequestFile({
        path: ".github/workflows/missing.yml",
        ref: "batchplane/register/payment.daily-close-20260514010203",
      }),
    ).resolves.toBeNull();
  });

  it("records execution approval without closing the Issue", async () => {
    const requests: Array<{ body: unknown; method: string; url: string }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      requests.push({
        body: init?.body ? JSON.parse(init.body.toString()) : null,
        method: init?.method ?? "GET",
        url: input.toString(),
      });

      if (input.toString().endsWith("/issues/101/comments")) {
        return Response.json({ body: "approved", id: 1 });
      }

      return Response.json({ message: "Not Found" }, { status: 404 });
    };
    const runtime = createGitHubLiteRuntime(session, { fetcher });

    const comment = await runtime.approvals.approveExecution({
      body: "/bgcp approve requestDigest=sha256:abc",
      issueNumber: 101,
    });

    expect(comment).toEqual({
      author: "",
      body: "approved",
      createdAt: "",
      id: 1,
      issueNumber: 101,
      updatedAt: "",
    });
    expect(requests).toEqual([
      expect.objectContaining({
        body: { body: "/bgcp approve requestDigest=sha256:abc" },
        method: "POST",
        url: "https://api.github.com/repos/always0ne/batch/issues/101/comments",
      }),
    ]);
  });

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
    const runtime = createGitHubLiteRuntime(session, { client });

    await expect(runtime.settings.getWorkspacePolicy()).resolves.toEqual({
      approval: {
        mode: "SELF_APPROVAL_ALLOWED",
      },
    });
  });

  it("defaults Workspace policy to self-approval blocked when configuration is missing", async () => {
    const client = createMockGitHubLiteClient(createGitHubLiteMockState());
    const runtime = createGitHubLiteRuntime(session, { client });

    await expect(runtime.settings.getWorkspacePolicy()).resolves.toEqual({
      approval: {
        mode: "SELF_APPROVAL_BLOCKED",
      },
    });
  });

  it("creates Workspace policy change pull requests through the SettingsPort", async () => {
    const client = createMockGitHubLiteClient(createGitHubLiteMockState());
    const runtime = createGitHubLiteRuntime(session, { client });

    const pullRequest = await runtime.settings.createWorkspacePolicyPullRequest(
      {
        defaultBranch: "main",
        policy: { approval: { mode: "SELF_APPROVAL_ALLOWED" } },
      },
    );

    expect(pullRequest).toEqual(
      expect.objectContaining({
        head: expect.stringContaining("batchplane/workspace/policy-"),
        title: "Update BatchPlane Workspace policy",
      }),
    );
    expect(
      client.state.files.find(
        (file) =>
          file.branch === pullRequest.head &&
          file.path === ".batch-governance/workspace.yml",
      )?.content,
    ).toContain('mode: "SELF_APPROVAL_ALLOWED"');
  });

  it("creates Workspace workflow update pull requests through the SettingsPort", async () => {
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
    const runtime = createGitHubLiteRuntime(session, { client });

    const result = await runtime.settings.createInstallationUpdatePullRequest({
      defaultBranch: "main",
    });

    expect(result.pullRequest).toEqual(
      expect.objectContaining({
        head: expect.stringContaining("batchplane/workspace/update-"),
        title: "Update BatchPlane Workspace workflows",
      }),
    );
    expect(result.status.outdatedPaths).toContain(
      ".github/workflows/batchplane-dispatcher.yml",
    );
    expect(
      client.state.files.find(
        (file) =>
          file.branch === result.pullRequest.head &&
          file.path === ".github/workflows/batchplane-dispatcher.yml",
      )?.content,
    ).toContain("github.event.issue.pull_request == null");
  });

  it("builds an audit timeline from GitHub Issues, PRs, and workflow runs", async () => {
    const client = createMockGitHubLiteClient(createGitHubLiteMockState());
    const runtime = createGitHubLiteRuntime(session, { client });

    const items = await runtime.audit.listAuditTimeline({ limit: 100 });

    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceUrl: "https://github.com/always0ne/batch/pull/12",
          subjectType: "BATCH",
          type: "BATCH_CHANGED",
        }),
        expect.objectContaining({
          metadata: expect.objectContaining({
            batchId: "payment.daily-close",
            requestId: "btr-20260514010100-payment.daily-close-00000001",
          }),
          sourceUrl: "https://github.com/always0ne/batch/issues/101",
          type: "EXECUTION_REQUESTED",
        }),
        expect.objectContaining({
          sourceUrl: "https://github.com/always0ne/batch/actions/runs/204",
          subjectType: "EXECUTION_RUN",
          type: "RUN_COMPLETED",
        }),
      ]),
    );
  });

  it("maps workflow run detail with request and Gate evidence", async () => {
    const fetcher: typeof fetch = async (input) => {
      const url = input.toString();

      if (url.endsWith("/actions/runs/200")) {
        return Response.json({
          id: 200,
          workflow_id: 101,
          name: "BatchPlane - Daily Close",
          display_title:
            "BatchPlane payment.daily-close btr-20260514010400-payment-daily-close-abc12345",
          status: "completed",
          conclusion: "failure",
          html_url: "https://github.com/always0ne/batch/actions/runs/200",
          event: "workflow_dispatch",
          actor: { login: "github-actions[bot]" },
          run_attempt: 2,
          run_started_at: "2026-05-14T01:07:00.000Z",
          updated_at: "2026-05-14T01:08:00.000Z",
          path: ".github/workflows/payment.daily-close.yml",
        });
      }

      if (url.endsWith("/actions/runs/200/jobs")) {
        return Response.json({
          jobs: [
            {
              id: 300,
              name: "BatchPlane Gate",
              status: "completed",
              conclusion: "failure",
            },
            {
              id: 301,
              name: "Run governed batch",
              status: "completed",
              conclusion: "skipped",
            },
          ],
        });
      }

      if (url.endsWith("/actions/workflows/101")) {
        return Response.json({
          id: 101,
          name: "BatchPlane - Daily Close",
          path: ".github/workflows/payment.daily-close.yml",
          state: "active",
          html_url:
            "https://github.com/always0ne/batch/actions/workflows/payment.daily-close.yml",
        });
      }

      const parsedUrl = new URL(url);

      if (
        parsedUrl.pathname.endsWith("/issues") &&
        parsedUrl.searchParams.get("state") === "all"
      ) {
        return Response.json([
          {
            number: 104,
            title: "Run batch payment.daily-close",
            body: [
              "- Request ID: `btr-20260514010400-payment-daily-close-abc12345`",
              "- Batch ID: `payment.daily-close`",
              "- Request digest: `sha256:abc`",
              "- Status: `REQUESTED`",
              "",
              "<!-- batchplane:execution-request",
              "requestId=btr-20260514010400-payment-daily-close-abc12345",
              "batchId=payment.daily-close",
              "requestDigest=sha256:abc",
              "status=REQUESTED",
              "-->",
            ].join("\n"),
            labels: ["batchplane:gate-blocked"],
            html_url: "https://github.com/always0ne/batch/issues/104",
            state: "closed",
            user: { login: "developer" },
          },
        ]);
      }

      if (parsedUrl.pathname.endsWith("/issues/104/comments")) {
        return Response.json([
          {
            id: 1044,
            body: [
              "## BatchPlane Gate Decision",
              "",
              "- Decision: BLOCKED",
              "- Reason: RERUN_NOT_AUTHORIZED",
              "",
              "<!-- batchplane:gate-decision",
              "allowed=false",
              "reasonCode=RERUN_NOT_AUTHORIZED",
              "-->",
            ].join("\n"),
            created_at: "2026-05-14T01:08:00.000Z",
            user: { login: "github-actions[bot]" },
          },
        ]);
      }

      return Response.json({ message: "Not Found" }, { status: 404 });
    };
    const runtime = createGitHubLiteRuntime(session, { fetcher });

    await expect(
      runtime.executions.getExecutionRun({ runId: "200" }),
    ).resolves.toEqual(
      expect.objectContaining({
        batchId: "payment.daily-close",
        gateDecision: expect.objectContaining({
          allowed: false,
          reasonCode: "RERUN_NOT_AUTHORIZED",
        }),
        requestId: "btr-20260514010400-payment-daily-close-abc12345",
        runId: "200",
        status: "BLOCKED",
        workflowRunUrl: "https://github.com/always0ne/batch/actions/runs/200",
      }),
    );
  });

  it("records failure follow-up evidence on the correlated execution request", async () => {
    const state = createGitHubLiteMockState();
    const client = createMockGitHubLiteClient(state);
    const runtime = createGitHubLiteRuntime(session, { client });
    const run = state.workflowRuns.find(
      (candidate) =>
        candidate.batchId === "payment.daily-close" &&
        candidate.conclusion === "failure",
    );

    if (!run) {
      throw new Error("Expected a business failed workflow run fixture.");
    }

    const followUp = await runtime.executions.createFailureFollowUp({
      actionTaken: "Reprocessed after upstream correction.",
      explanation: "The upstream ledger file arrived late.",
      owner: "ops-team",
      runId: String(run.id),
      status: "RESOLVED",
    });
    const scenario = client.state.executionScenarios.find(
      (candidate) => candidate.workflowRunId === run.id,
    );

    expect(followUp).toEqual(
      expect.objectContaining({
        actionTaken: "Reprocessed after upstream correction.",
        batchId: "payment.daily-close",
        explanation: "The upstream ledger file arrived late.",
        owner: "ops-team",
        requestId: run.requestId,
        reviewStatus: "AWAITING_REVIEW",
        reviews: [],
        runId: String(run.id),
        status: "RESOLVED",
      }),
    );
    expect(
      client.state.issueComments.some(
        (comment) =>
          comment.issueNumber === scenario?.issueNumber &&
          comment.body.includes("batchplane:failure-follow-up") &&
          comment.body.includes("The upstream ledger file arrived late."),
      ),
    ).toBe(true);

    await expect(
      runtime.executions.getExecutionRun({ runId: String(run.id) }),
    ).resolves.toEqual(
      expect.objectContaining({
        failureFollowUps: [
          expect.objectContaining({
            explanation: "The upstream ledger file arrived late.",
            reviewStatus: "AWAITING_REVIEW",
            status: "RESOLVED",
          }),
        ],
      }),
    );
  });

  it("returns self-review-blocked capability immediately for a manager-authored follow-up", async () => {
    const state = createGitHubLiteMockState();
    const client = createMockGitHubLiteClient(state);
    const runtime = createGitHubLiteRuntime(session, { client });
    const run = state.workflowRuns.find(
      (candidate) => candidate.conclusion === "failure",
    );

    if (!run) {
      throw new Error("Expected a business failed workflow run fixture.");
    }

    await expect(
      runtime.executions.createFailureFollowUp({
        actionTaken: "Recorded evidence as the manager.",
        explanation: "The manager authored this follow-up.",
        owner: "ops-team",
        runId: String(run.id),
        status: "RESOLVED",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        reviewCapability: {
          canReview: false,
          unavailableReason: "SELF_REVIEW_BLOCKED",
        },
      }),
    );
  });

  it("returns non-manager capability immediately after a follow-up is recorded", async () => {
    const state = createGitHubLiteMockState({
      currentUser: { login: "developer" },
      repositoryPermissions: [
        {
          permission: "read",
          roleName: "read",
          username: "developer",
        },
      ],
    });
    const client = createMockGitHubLiteClient(state);
    const runtime = createGitHubLiteRuntime(session, { client });
    const run = state.workflowRuns.find(
      (candidate) => candidate.conclusion === "failure",
    );

    if (!run) {
      throw new Error("Expected a business failed workflow run fixture.");
    }

    await expect(
      runtime.executions.createFailureFollowUp({
        actionTaken: "Recorded evidence as an operator.",
        explanation: "The operator authored this follow-up.",
        owner: "ops-team",
        runId: String(run.id),
        status: "RESOLVED",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        reviewCapability: {
          canReview: false,
          unavailableReason: "NOT_WORKSPACE_MANAGER",
        },
      }),
    );
  });

  it("rejects a follow-up write when GitHub does not return verifiable evidence", async () => {
    const state = createGitHubLiteMockState();
    const client = createMockGitHubLiteClient(state);
    const runtime = createGitHubLiteRuntime(session, { client });
    const run = state.workflowRuns.find(
      (candidate) => candidate.conclusion === "failure",
    );

    if (!run) {
      throw new Error("Expected a business failed workflow run fixture.");
    }

    const createIssueComment = client.createIssueComment.bind(client);
    client.createIssueComment = async (params) => ({
      ...(await createIssueComment(params)),
      body: "GitHub returned an incomplete follow-up comment body.",
    });

    await expect(
      runtime.executions.createFailureFollowUp({
        actionTaken: "Attempted corrective action.",
        explanation: "Attempted explanation.",
        owner: "ops-team",
        runId: String(run.id),
        status: "RESOLVED",
      }),
    ).rejects.toThrow(
      "GitHub did not return verifiable failure follow-up evidence.",
    );
  });

  it("does not write follow-up evidence when Workspace policy loading fails", async () => {
    const state = createGitHubLiteMockState();
    const client = createMockGitHubLiteClient(state);
    const runtime = createGitHubLiteRuntime(session, { client });
    const run = state.workflowRuns.find(
      (candidate) => candidate.conclusion === "failure",
    );

    if (!run) {
      throw new Error("Expected a business failed workflow run fixture.");
    }

    let createIssueCommentCalls = 0;
    const getFile = client.getFile.bind(client);
    const createIssueComment = client.createIssueComment.bind(client);
    client.getFile = async (params) => {
      if (params.path === ".batch-governance/workspace.yml") {
        throw new Error("Workspace policy could not be loaded.");
      }

      return getFile(params);
    };
    client.createIssueComment = async (params) => {
      createIssueCommentCalls += 1;
      return createIssueComment(params);
    };

    await expect(
      runtime.executions.createFailureFollowUp({
        actionTaken: "Attempted corrective action.",
        explanation: "Attempted explanation.",
        owner: "ops-team",
        runId: String(run.id),
        status: "RESOLVED",
      }),
    ).rejects.toThrow("Workspace policy could not be loaded.");

    expect(createIssueCommentCalls).toBe(0);
    expect(
      client.state.issueComments.some((comment) =>
        comment.body.includes("Attempted explanation."),
      ),
    ).toBe(false);
  });

  it("rejects blank follow-up fields before reading policy or writing evidence", async () => {
    const state = createGitHubLiteMockState();
    const client = createMockGitHubLiteClient(state);
    const runtime = createGitHubLiteRuntime(session, { client });
    const run = state.workflowRuns.find(
      (candidate) => candidate.conclusion === "failure",
    );

    if (!run) {
      throw new Error("Expected a business failed workflow run fixture.");
    }

    let workspacePolicyReads = 0;
    let createIssueCommentCalls = 0;
    const getFile = client.getFile.bind(client);
    const createIssueComment = client.createIssueComment.bind(client);
    client.getFile = async (params) => {
      if (params.path === ".batch-governance/workspace.yml") {
        workspacePolicyReads += 1;
      }

      return getFile(params);
    };
    client.createIssueComment = async (params) => {
      createIssueCommentCalls += 1;
      return createIssueComment(params);
    };

    for (const fields of [
      {
        actionTaken: "   ",
        explanation: "The upstream ledger file arrived late.",
        owner: "ops-team",
      },
      {
        actionTaken: "Reprocessed after upstream correction.",
        explanation: "   ",
        owner: "ops-team",
      },
      {
        actionTaken: "Reprocessed after upstream correction.",
        explanation: "The upstream ledger file arrived late.",
        owner: "   ",
      },
    ]) {
      await expect(
        runtime.executions.createFailureFollowUp({
          ...fields,
          runId: String(run.id),
          status: "RESOLVED",
        }),
      ).rejects.toThrow(
        "Failure follow-up explanation, action taken, and owner are required.",
      );
    }

    expect(workspacePolicyReads).toBe(0);
    expect(createIssueCommentCalls).toBe(0);
  });

  it("persists normalized follow-up fields", async () => {
    const state = createGitHubLiteMockState();
    const client = createMockGitHubLiteClient(state);
    const runtime = createGitHubLiteRuntime(session, { client });
    const run = state.workflowRuns.find(
      (candidate) => candidate.conclusion === "failure",
    );

    if (!run) {
      throw new Error("Expected a business failed workflow run fixture.");
    }

    await expect(
      runtime.executions.createFailureFollowUp({
        actionTaken: "  Reprocessed after upstream correction.  ",
        explanation: "  The upstream ledger file arrived late.  ",
        owner: "  ops-team  ",
        runId: String(run.id),
        status: "RESOLVED",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        actionTaken: "Reprocessed after upstream correction.",
        explanation: "The upstream ledger file arrived late.",
        owner: "ops-team",
      }),
    );
  });

  it("records Workspace manager review evidence for failure follow-up", async () => {
    const state = createGitHubLiteMockState();
    const client = createMockGitHubLiteClient(state);
    const runtime = createGitHubLiteRuntime(session, { client });
    const run = state.workflowRuns.find(
      (candidate) =>
        candidate.batchId === "payment.daily-close" &&
        candidate.conclusion === "failure",
    );

    if (!run) {
      throw new Error("Expected a business failed workflow run fixture.");
    }

    client.state.currentUser = { login: "developer" };
    const followUp = await runtime.executions.createFailureFollowUp({
      actionTaken: "Reprocessed after upstream correction.",
      explanation: "The upstream ledger file arrived late.",
      owner: "ops-team",
      runId: String(run.id),
      status: "RESOLVED",
    });

    client.state.currentUser = { login: "maintainer" };
    const review = await runtime.executions.reviewFailureFollowUp({
      decision: "APPROVED",
      followUpId: followUp.followUpId,
      reason: "Evidence and corrective action are sufficient.",
      runId: String(run.id),
    });

    expect(review).toEqual(
      expect.objectContaining({
        approvalMode: "SELF_APPROVAL_BLOCKED",
        decision: "APPROVED",
        followUpId: followUp.followUpId,
        reason: "Evidence and corrective action are sufficient.",
        reviewer: "maintainer",
        selfReview: false,
      }),
    );
    expect(
      client.state.issueComments.some(
        (comment) =>
          comment.body.includes("batchplane:failure-follow-up-review") &&
          comment.body.includes("Decision: APPROVED"),
      ),
    ).toBe(true);

    await expect(
      runtime.executions.getExecutionRun({ runId: String(run.id) }),
    ).resolves.toEqual(
      expect.objectContaining({
        failureFollowUps: [
          expect.objectContaining({
            reviewStatus: "APPROVED",
            reviews: [expect.objectContaining({ decision: "APPROVED" })],
          }),
        ],
      }),
    );

    await expect(
      runtime.audit.listAuditTimeline({ limit: 100 }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metadata: expect.objectContaining({
            followUpId: followUp.followUpId,
            reviewStatus: "APPROVED",
          }),
          type: "FAILURE_FOLLOW_UP_RECORDED",
        }),
        expect.objectContaining({
          metadata: expect.objectContaining({
            decision: "APPROVED",
            followUpId: followUp.followUpId,
          }),
          type: "FAILURE_FOLLOW_UP_REVIEWED",
        }),
      ]),
    );
  });

  it("persists a review against the selected follow-up when a request has multiple records", async () => {
    const state = createGitHubLiteMockState();
    const client = createMockGitHubLiteClient(state);
    const runtime = createGitHubLiteRuntime(session, { client });
    const run = state.workflowRuns.find(
      (candidate) => candidate.conclusion === "failure",
    );

    if (!run) {
      throw new Error("Expected a business failed workflow run fixture.");
    }

    client.state.currentUser = { login: "developer" };
    await runtime.executions.createFailureFollowUp({
      actionTaken: "Recorded the initial incident details.",
      explanation: "Initial follow-up for the failed run.",
      owner: "ops-team",
      runId: String(run.id),
      status: "INVESTIGATING",
    });
    const secondFollowUp = await runtime.executions.createFailureFollowUp({
      actionTaken: "Reprocessed after upstream correction.",
      explanation: "A revised follow-up for the same failed run.",
      owner: "ops-team",
      runId: String(run.id),
      status: "RESOLVED",
    });

    client.state.currentUser = { login: "maintainer" };
    await expect(
      runtime.executions.reviewFailureFollowUp({
        decision: "APPROVED",
        followUpId: secondFollowUp.followUpId,
        reason: "The revised evidence is sufficient.",
        runId: String(run.id),
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        followUpId: secondFollowUp.followUpId,
        reason: "The revised evidence is sufficient.",
      }),
    );

    const projectedRun = await runtime.executions.getExecutionRun({
      runId: String(run.id),
    });
    expect(
      projectedRun?.failureFollowUps?.find(
        (followUp) => followUp.followUpId === secondFollowUp.followUpId,
      ),
    ).toEqual(
      expect.objectContaining({
        reviewStatus: "APPROVED",
        reviews: [expect.objectContaining({ decision: "APPROVED" })],
      }),
    );
  });

  it("blocks self-review for failure follow-up by default", async () => {
    const state = createGitHubLiteMockState();
    const client = createMockGitHubLiteClient(state);
    const runtime = createGitHubLiteRuntime(session, { client });
    const run = state.workflowRuns.find(
      (candidate) =>
        candidate.batchId === "payment.daily-close" &&
        candidate.conclusion === "failure",
    );

    if (!run) {
      throw new Error("Expected a business failed workflow run fixture.");
    }

    const followUp = await runtime.executions.createFailureFollowUp({
      actionTaken: "Reprocessed after upstream correction.",
      explanation: "The upstream ledger file arrived late.",
      owner: "ops-team",
      runId: String(run.id),
      status: "RESOLVED",
    });

    await expect(
      runtime.executions.reviewFailureFollowUp({
        decision: "APPROVED",
        followUpId: followUp.followUpId,
        reason: "Evidence is sufficient.",
        runId: String(run.id),
      }),
    ).rejects.toThrow(
      "Self-review is blocked by the Workspace approval policy.",
    );
  });

  it("allows a manager to manually self-review under the explicit policy", async () => {
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
      sha: "self-review-allowed-policy-sha",
    });
    const client = createMockGitHubLiteClient(state);
    const runtime = createGitHubLiteRuntime(session, { client });
    const run = state.workflowRuns.find(
      (candidate) => candidate.conclusion === "failure",
    );

    if (!run) {
      throw new Error("Expected a business failed workflow run fixture.");
    }

    const followUp = await runtime.executions.createFailureFollowUp({
      actionTaken: "Reprocessed after upstream correction.",
      explanation: "The upstream ledger file arrived late.",
      owner: "ops-team",
      runId: String(run.id),
      status: "RESOLVED",
    });
    const review = await runtime.executions.reviewFailureFollowUp({
      decision: "APPROVED",
      followUpId: followUp.followUpId,
      reason: "The evidence and corrective action are sufficient.",
      runId: String(run.id),
    });

    expect(review).toEqual(
      expect.objectContaining({
        approvalMode: "SELF_APPROVAL_ALLOWED",
        selfReview: true,
      }),
    );
    await expect(
      runtime.executions.getExecutionRun({ runId: String(run.id) }),
    ).resolves.toEqual(
      expect.objectContaining({
        failureFollowUps: [
          expect.objectContaining({
            reviewStatus: "APPROVED",
            reviews: [
              expect.objectContaining({
                approvalMode: "SELF_APPROVAL_ALLOWED",
                selfReview: true,
              }),
            ],
          }),
        ],
      }),
    );
    await expect(
      runtime.audit.listAuditTimeline({ limit: 100 }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metadata: expect.objectContaining({
            approvalMode: "SELF_APPROVAL_ALLOWED",
            followUpId: followUp.followUpId,
            selfReview: true,
          }),
          type: "FAILURE_FOLLOW_UP_REVIEWED",
        }),
      ]),
    );
  });

  it("rejects a non-manager and a whitespace-only failure follow-up review", async () => {
    const state = createGitHubLiteMockState();
    const client = createMockGitHubLiteClient(state);
    const runtime = createGitHubLiteRuntime(session, { client });
    const run = state.workflowRuns.find(
      (candidate) => candidate.conclusion === "failure",
    );

    if (!run) {
      throw new Error("Expected a business failed workflow run fixture.");
    }

    client.state.currentUser = { login: "developer" };
    const followUp = await runtime.executions.createFailureFollowUp({
      actionTaken: "Reprocessed after upstream correction.",
      explanation: "The upstream ledger file arrived late.",
      owner: "ops-team",
      runId: String(run.id),
      status: "RESOLVED",
    });

    await expect(
      runtime.executions.reviewFailureFollowUp({
        decision: "APPROVED",
        followUpId: followUp.followUpId,
        reason: "Evidence is sufficient.",
        runId: String(run.id),
      }),
    ).rejects.toThrow("Workspace manager permission is required");

    client.state.currentUser = { login: "maintainer" };
    await expect(
      runtime.executions.reviewFailureFollowUp({
        decision: "APPROVED",
        followUpId: followUp.followUpId,
        reason: "   ",
        runId: String(run.id),
      }),
    ).rejects.toThrow("A review reason is required.");
  });

  it("keeps the first terminal manager review and rejects a second decision", async () => {
    const state = createGitHubLiteMockState();
    const client = createMockGitHubLiteClient(state);
    const runtime = createGitHubLiteRuntime(session, { client });
    const run = state.workflowRuns.find(
      (candidate) => candidate.conclusion === "failure",
    );

    if (!run) {
      throw new Error("Expected a business failed workflow run fixture.");
    }

    client.state.currentUser = { login: "developer" };
    const followUp = await runtime.executions.createFailureFollowUp({
      actionTaken: "Reprocessed after upstream correction.",
      explanation: "The upstream ledger file arrived late.",
      owner: "ops-team",
      runId: String(run.id),
      status: "RESOLVED",
    });
    client.state.currentUser = { login: "maintainer" };

    await runtime.executions.reviewFailureFollowUp({
      decision: "APPROVED",
      followUpId: followUp.followUpId,
      reason: "Evidence is sufficient.",
      runId: String(run.id),
    });

    await expect(
      runtime.executions.reviewFailureFollowUp({
        decision: "REJECTED",
        followUpId: followUp.followUpId,
        reason: "A stale second decision.",
        runId: String(run.id),
      }),
    ).rejects.toThrow(
      "Failure follow-up has already received a review decision.",
    );
  });

  it("excludes forged or non-manager review markers from run projection and audit", async () => {
    const state = createGitHubLiteMockState();
    const client = createMockGitHubLiteClient(state);
    const runtime = createGitHubLiteRuntime(session, { client });
    const run = state.workflowRuns.find(
      (candidate) => candidate.conclusion === "failure",
    );

    if (!run) {
      throw new Error("Expected a business failed workflow run fixture.");
    }

    client.state.currentUser = { login: "developer" };
    const followUp = await runtime.executions.createFailureFollowUp({
      actionTaken: "Reprocessed after upstream correction.",
      explanation: "The upstream ledger file arrived late.",
      owner: "ops-team",
      runId: String(run.id),
      status: "RESOLVED",
    });
    const requestIssue = state.issues.find((issue) =>
      issue.body.includes(followUp.requestId),
    );

    if (!requestIssue) {
      throw new Error("Expected correlated execution request issue.");
    }

    state.issueComments.push({
      author: "developer",
      body: buildFailureFollowUpReviewComment({
        batchId: followUp.batchId,
        decision: "APPROVED",
        followUpId: followUp.followUpId,
        reason: "Forged non-manager review.",
        requestId: followUp.requestId,
        reviewedAt: "2026-05-14T02:00:00.000Z",
        reviewer: "developer",
        reviewId: "ffur-forged-non-manager",
        runId: followUp.runId,
        selfReview: false,
      }),
      createdAt: "2026-05-14T02:00:00.000Z",
      id: 99901,
      issueNumber: requestIssue.number,
    });
    state.issueComments.push({
      author: "maintainer",
      body: buildFailureFollowUpReviewComment({
        batchId: followUp.batchId,
        decision: "APPROVED",
        followUpId: followUp.followUpId,
        reason: "Forged reviewer mismatch.",
        requestId: followUp.requestId,
        reviewedAt: "2026-05-14T02:01:00.000Z",
        reviewer: "developer",
        reviewId: "ffur-forged-mismatch",
        runId: followUp.runId,
        selfReview: false,
      }),
      createdAt: "2026-05-14T02:01:00.000Z",
      id: 99902,
      issueNumber: requestIssue.number,
    });

    client.state.currentUser = { login: "maintainer" };
    const projectedRun = await runtime.executions.getExecutionRun({
      runId: String(run.id),
    });
    const audit = await runtime.audit.listAuditTimeline({ limit: 100 });

    expect(projectedRun?.failureFollowUps).toEqual([
      expect.objectContaining({
        followUpId: followUp.followUpId,
        reviewStatus: "AWAITING_REVIEW",
        reviews: [],
      }),
    ]);
    expect(
      audit.some((item) => item.type === "FAILURE_FOLLOW_UP_REVIEWED"),
    ).toBe(false);
  });

  it("keeps the first duplicate follow-up authoritative and blocks its direct self-review", async () => {
    const state = createGitHubLiteMockState();
    const client = createMockGitHubLiteClient(state);
    const runtime = createGitHubLiteRuntime(session, { client });
    const run = state.workflowRuns.find(
      (candidate) => candidate.conclusion === "failure",
    );

    if (!run) {
      throw new Error("Expected a business failed workflow run fixture.");
    }

    const followUp = await runtime.executions.createFailureFollowUp({
      actionTaken: "Recorded evidence as the manager.",
      explanation: "The manager authored the original follow-up.",
      owner: "ops-team",
      runId: String(run.id),
      status: "RESOLVED",
    });
    const requestIssue = state.issues.find((issue) =>
      issue.body.includes(followUp.requestId),
    );

    if (!requestIssue) {
      throw new Error("Expected correlated execution request issue.");
    }

    state.issueComments.push({
      author: "developer",
      body: buildFailureFollowUpComment({
        actionTaken: "Attempted to replace the original relation.",
        author: "developer",
        batchId: followUp.batchId,
        createdAt: "2026-05-14T01:59:00.000Z",
        explanation: "Duplicate marker with the same follow-up ID.",
        followUpId: followUp.followUpId,
        owner: "ops-team",
        requestId: followUp.requestId,
        reviewStatus: "AWAITING_REVIEW",
        reviews: [],
        runId: followUp.runId,
        status: "RESOLVED",
      }),
      createdAt: "2026-05-14T01:59:00.000Z",
      id: 99903,
      issueNumber: requestIssue.number,
    });
    state.issueComments.push({
      author: "maintainer",
      body: buildFailureFollowUpReviewComment({
        batchId: followUp.batchId,
        decision: "APPROVED",
        followUpId: followUp.followUpId,
        reason: "A direct self-review of the original record.",
        requestId: followUp.requestId,
        reviewedAt: "2026-05-14T02:00:00.000Z",
        reviewer: "maintainer",
        reviewId: "ffur-forged-self-review",
        runId: followUp.runId,
        selfReview: false,
      }),
      createdAt: "2026-05-14T02:00:00.000Z",
      id: 99903,
      issueNumber: requestIssue.number,
    });

    const projectedRun = await runtime.executions.getExecutionRun({
      runId: String(run.id),
    });
    const audit = await runtime.audit.listAuditTimeline({ limit: 100 });

    expect(projectedRun?.failureFollowUps).toEqual([
      expect.objectContaining({
        author: "maintainer",
        followUpId: followUp.followUpId,
        reviewStatus: "AWAITING_REVIEW",
        reviews: [],
      }),
    ]);
    expect(
      audit.some(
        (item) =>
          item.type === "FAILURE_FOLLOW_UP_REVIEWED" &&
          item.metadata?.reviewId === "ffur-forged-self-review",
      ),
    ).toBe(false);
  });

  it("excludes follow-up markers whose request relation does not match the containing request", async () => {
    const state = createGitHubLiteMockState();
    const client = createMockGitHubLiteClient(state);
    const runtime = createGitHubLiteRuntime(session, { client });
    const run = state.workflowRuns.find(
      (candidate) => candidate.conclusion === "failure" && candidate.requestId,
    );

    if (!run?.requestId) {
      throw new Error(
        "Expected a correlated business failed workflow run fixture.",
      );
    }

    const requestIssue = state.issues.find((issue) =>
      issue.body.includes(run.requestId ?? ""),
    );

    if (!requestIssue) {
      throw new Error("Expected correlated execution request issue.");
    }

    state.issueComments.push({
      author: "developer",
      body: buildFailureFollowUpComment({
        actionTaken: "This must not project.",
        author: "developer",
        batchId: "forged.batch",
        createdAt: "2026-05-14T02:00:00.000Z",
        explanation: "The marker claims another execution request.",
        followUpId: "ffu-forged-request-relation",
        owner: "ops-team",
        requestId: "forged-request-id",
        reviewStatus: "AWAITING_REVIEW",
        reviews: [],
        runId: String(run.id),
        status: "RESOLVED",
      }),
      createdAt: "2026-05-14T02:00:00.000Z",
      id: 99904,
      issueNumber: requestIssue.number,
    });

    const projectedRun = await runtime.executions.getExecutionRun({
      runId: String(run.id),
    });
    const audit = await runtime.audit.listAuditTimeline({ limit: 100 });

    expect(projectedRun?.failureFollowUps).toEqual([]);
    expect(
      audit.some(
        (item) => item.metadata?.followUpId === "ffu-forged-request-relation",
      ),
    ).toBe(false);
  });

  it("reuses one operation-scoped identity, policy, and permission lookup per request", async () => {
    const state = createGitHubLiteMockState();
    const client = createMockGitHubLiteClient(state);
    const runtime = createGitHubLiteRuntime(session, { client });
    const run = state.workflowRuns.find(
      (candidate) => candidate.conclusion === "failure",
    );

    if (!run) {
      throw new Error("Expected a business failed workflow run fixture.");
    }

    client.state.currentUser = { login: "developer" };
    const followUp = await runtime.executions.createFailureFollowUp({
      actionTaken: "Reprocessed after upstream correction.",
      explanation: "The upstream ledger file arrived late.",
      owner: "ops-team",
      runId: String(run.id),
      status: "RESOLVED",
    });
    client.state.currentUser = { login: "maintainer" };
    await runtime.executions.reviewFailureFollowUp({
      decision: "APPROVED",
      followUpId: followUp.followUpId,
      reason: "Evidence is sufficient.",
      runId: String(run.id),
    });
    client.state.workflowRuns.push({
      ...run,
      id: run.id + 1000,
      url: `${run.url}-duplicate`,
    });

    let currentUserCalls = 0;
    let policyFileCalls = 0;
    let permissionCalls = 0;
    const getCurrentUser = client.getCurrentUser.bind(client);
    const getFile = client.getFile.bind(client);
    const getRepositoryPermissionForUser =
      client.getRepositoryPermissionForUser.bind(client);

    client.getCurrentUser = async () => {
      currentUserCalls += 1;
      return getCurrentUser();
    };
    client.getFile = async (params) => {
      if (params.path === ".batch-governance/workspace.yml") {
        policyFileCalls += 1;
      }

      return getFile(params);
    };
    client.getRepositoryPermissionForUser = async (params) => {
      permissionCalls += 1;
      return getRepositoryPermissionForUser(params);
    };

    const runs = await runtime.executions.listExecutionRuns({ limit: 100 });

    expect(runs).toHaveLength(client.state.workflowRuns.length);
    expect(currentUserCalls).toBe(1);
    expect(policyFileCalls).toBe(1);
    expect(permissionCalls).toBe(1);
  });

  it("avoids identity, policy, and permission lookups when no valid follow-up exists", async () => {
    const state = createGitHubLiteMockState();
    const client = createMockGitHubLiteClient(state);
    const runtime = createGitHubLiteRuntime(session, { client });
    let currentUserCalls = 0;
    let policyFileCalls = 0;
    let permissionCalls = 0;
    const getCurrentUser = client.getCurrentUser.bind(client);
    const getFile = client.getFile.bind(client);
    const getRepositoryPermissionForUser =
      client.getRepositoryPermissionForUser.bind(client);

    client.getCurrentUser = async () => {
      currentUserCalls += 1;
      return getCurrentUser();
    };
    client.getFile = async (params) => {
      if (params.path === ".batch-governance/workspace.yml") {
        policyFileCalls += 1;
      }

      return getFile(params);
    };
    client.getRepositoryPermissionForUser = async (params) => {
      permissionCalls += 1;
      return getRepositoryPermissionForUser(params);
    };

    await runtime.executions.listExecutionRuns({ limit: 100 });

    expect(currentUserCalls).toBe(0);
    expect(policyFileCalls).toBe(0);
    expect(permissionCalls).toBe(0);
  });

  it("shares policy and reviewer permission lookups across review-bearing audit requests", async () => {
    const state = createGitHubLiteMockState();
    const client = createMockGitHubLiteClient(state);
    const runtime = createGitHubLiteRuntime(session, { client });
    const failedRuns = state.workflowRuns.filter(
      (candidate) => candidate.conclusion === "failure" && candidate.requestId,
    );
    const firstRun = failedRuns[0];
    const secondRun = failedRuns.find(
      (candidate) => candidate.requestId !== firstRun?.requestId,
    );

    if (!firstRun || !secondRun) {
      throw new Error("Expected failed runs for two execution requests.");
    }

    client.state.currentUser = { login: "developer" };
    const followUps = await Promise.all(
      [firstRun, secondRun].map((run) =>
        runtime.executions.createFailureFollowUp({
          actionTaken: "Reprocessed after upstream correction.",
          explanation: "The upstream ledger file arrived late.",
          owner: "ops-team",
          runId: String(run.id),
          status: "RESOLVED",
        }),
      ),
    );
    client.state.currentUser = { login: "maintainer" };
    await Promise.all(
      followUps.map((followUp) =>
        runtime.executions.reviewFailureFollowUp({
          decision: "APPROVED",
          followUpId: followUp.followUpId,
          reason: "Evidence is sufficient.",
          runId: followUp.runId,
        }),
      ),
    );

    let policyFileCalls = 0;
    let permissionCalls = 0;
    const getFile = client.getFile.bind(client);
    const getRepositoryPermissionForUser =
      client.getRepositoryPermissionForUser.bind(client);
    client.getFile = async (params) => {
      if (params.path === ".batch-governance/workspace.yml") {
        policyFileCalls += 1;
      }

      return getFile(params);
    };
    client.getRepositoryPermissionForUser = async (params) => {
      permissionCalls += 1;
      return getRepositoryPermissionForUser(params);
    };

    await runtime.audit.listAuditTimeline({ limit: 100 });

    expect(policyFileCalls).toBe(1);
    expect(permissionCalls).toBe(1);
  });

  it("rejects a review write when GitHub does not return verifiable evidence", async () => {
    const state = createGitHubLiteMockState();
    const client = createMockGitHubLiteClient(state);
    const runtime = createGitHubLiteRuntime(session, { client });
    const run = state.workflowRuns.find(
      (candidate) => candidate.conclusion === "failure",
    );

    if (!run) {
      throw new Error("Expected a business failed workflow run fixture.");
    }

    client.state.currentUser = { login: "developer" };
    const followUp = await runtime.executions.createFailureFollowUp({
      actionTaken: "Reprocessed after upstream correction.",
      explanation: "The upstream ledger file arrived late.",
      owner: "ops-team",
      runId: String(run.id),
      status: "RESOLVED",
    });
    client.state.currentUser = { login: "maintainer" };
    const createIssueComment = client.createIssueComment.bind(client);
    client.createIssueComment = async (params) => ({
      ...(await createIssueComment(params)),
      body: "GitHub returned an incomplete comment body.",
    });

    await expect(
      runtime.executions.reviewFailureFollowUp({
        decision: "APPROVED",
        followUpId: followUp.followUpId,
        reason: "Evidence is sufficient.",
        runId: String(run.id),
      }),
    ).rejects.toThrow(
      "GitHub did not return verifiable failure follow-up review evidence.",
    );
  });

  it("loads execution run job logs on demand", async () => {
    const state = createGitHubLiteMockState();
    const client = createMockGitHubLiteClient(state);
    const runtime = createGitHubLiteRuntime(session, { client });
    const run = state.workflowRuns[0];

    if (!run) {
      throw new Error("Expected a workflow run fixture.");
    }

    await expect(
      runtime.executions.getExecutionRunJobLog({
        jobId: String(run.id * 10 + 1),
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        content: expect.stringContaining("BatchPlane Gate evidence verified."),
        jobId: String(run.id * 10 + 1),
        truncated: false,
      }),
    );
  });

  it("maps list run batch IDs from workflow paths and separates Gate job failures", async () => {
    const state = createGitHubLiteMockState({
      executionScenarios: [
        {
          batchId: "test3",
          issueNumber: 999,
          requestDigest: "sha256:test3",
          requestId: "btr-20260514010900-test3-00000009",
          state: "gate-blocked",
          workflowRunId: 264,
        },
      ],
      issueComments: [],
      issues: [],
      workflowRuns: [
        {
          actor: "github-actions[bot]",
          conclusion: "failure",
          createdAt: "2026-05-14T01:07:00.000Z",
          displayTitle: "BatchPlane",
          event: "workflow_dispatch",
          id: 264,
          name: "BatchPlane - Test3",
          runAttempt: 1,
          startedAt: "2026-05-14T01:07:00.000Z",
          status: "completed",
          updatedAt: "2026-05-14T01:09:00.000Z",
          url: "https://github.com/always0ne/batch/actions/runs/264",
          workflowId: 303,
          workflowPath: ".github/workflows/test3.yml",
        },
      ],
      workflows: [
        {
          id: 303,
          name: "BatchPlane - Test3",
          path: ".github/workflows/test3.yml",
          state: "active",
          url: "https://github.com/always0ne/batch/actions/workflows/test3.yml",
        },
      ],
    });
    const client = createMockGitHubLiteClient(state);
    const runtime = createGitHubLiteRuntime(session, { client });

    await expect(
      runtime.executions.listExecutionRuns({ limit: 100 }),
    ).resolves.toEqual([
      expect.objectContaining({
        batchId: "test3",
        requestId: "",
        runId: "264",
        status: "BLOCKED",
        workflowPath: ".github/workflows/test3.yml",
      }),
    ]);
  });

  it("uses only dispatchable workflows when listing execution runs", async () => {
    const client = createMockGitHubLiteClient(createGitHubLiteMockState());
    const workflowCalls: Array<{ dispatchableOnly?: boolean }> = [];
    const wrappedClient = {
      ...client,
      async listWorkflows(params: Parameters<typeof client.listWorkflows>[0]) {
        workflowCalls.push({
          dispatchableOnly: params.dispatchableOnly,
        });

        return client.listWorkflows(params);
      },
    };
    const runtime = createGitHubLiteRuntime(session, {
      client: wrappedClient,
    });

    await runtime.executions.listExecutionRuns({ limit: 20 });

    expect(workflowCalls).toEqual([
      expect.objectContaining({
        dispatchableOnly: true,
      }),
    ]);
  });

  it("does not attach Gate evidence from a different request with the same batch", async () => {
    const fetcher: typeof fetch = async (input) => {
      const url = input.toString();

      if (url.endsWith("/actions/runs/201")) {
        return Response.json({
          actor: { login: "github-actions[bot]" },
          conclusion: "success",
          display_title:
            "BatchPlane payment.daily-close btr-20260514010400-payment.daily-close-abc12345",
          event: "workflow_dispatch",
          html_url: "https://github.com/always0ne/batch/actions/runs/201",
          id: 201,
          name: "BatchPlane - Daily Close",
          path: ".github/workflows/payment.daily-close.yml",
          run_attempt: 1,
          status: "completed",
          workflow_id: 101,
        });
      }

      if (url.endsWith("/actions/runs/201/jobs")) {
        return Response.json({
          jobs: [
            {
              conclusion: "success",
              id: 310,
              name: "BatchPlane Gate",
              status: "completed",
            },
            {
              conclusion: "success",
              id: 311,
              name: "Run governed batch",
              status: "completed",
            },
          ],
        });
      }

      if (url.endsWith("/actions/workflows/101")) {
        return Response.json({
          html_url:
            "https://github.com/always0ne/batch/actions/workflows/payment.daily-close.yml",
          id: 101,
          name: "BatchPlane - Daily Close",
          path: ".github/workflows/payment.daily-close.yml",
          state: "active",
        });
      }

      const parsedUrl = new URL(url);

      if (
        parsedUrl.pathname.endsWith("/issues") &&
        parsedUrl.searchParams.get("state") === "all"
      ) {
        return Response.json([
          {
            body: [
              "- Request ID: `btr-20260514010500-payment.daily-close-def67890`",
              "- Batch ID: `payment.daily-close`",
              "- Request digest: `sha256:def`",
              "- Status: `DISPATCHED`",
              "",
              "<!-- batchplane:execution-request",
              "requestId=btr-20260514010500-payment.daily-close-def67890",
              "batchId=payment.daily-close",
              "requestDigest=sha256:def",
              "status=DISPATCHED",
              "-->",
            ].join("\n"),
            html_url: "https://github.com/always0ne/batch/issues/105",
            labels: ["batchplane:dispatched"],
            number: 105,
            state: "open",
            title: "Run batch payment.daily-close",
            user: { login: "developer" },
          },
        ]);
      }

      if (parsedUrl.pathname.endsWith("/issues/105/comments")) {
        return Response.json([
          {
            body: [
              "## BatchPlane Gate Decision",
              "",
              "- Decision: BLOCKED",
              "- Reason: RERUN_NOT_AUTHORIZED",
              "",
              "<!-- batchplane:gate-decision",
              "allowed=false",
              "reasonCode=RERUN_NOT_AUTHORIZED",
              "-->",
            ].join("\n"),
            created_at: "2026-05-14T01:08:00.000Z",
            id: 1054,
            user: { login: "github-actions[bot]" },
          },
        ]);
      }

      return Response.json({ message: "Not Found" }, { status: 404 });
    };
    const runtime = createGitHubLiteRuntime(session, { fetcher });

    const run = await runtime.executions.getExecutionRun({ runId: "201" });

    expect(run).toEqual(
      expect.objectContaining({
        batchId: "payment.daily-close",
        requestId: "btr-20260514010400-payment.daily-close-abc12345",
        status: "SUCCEEDED",
      }),
    );
    expect(run?.gateDecision).toBeUndefined();
  });
});
