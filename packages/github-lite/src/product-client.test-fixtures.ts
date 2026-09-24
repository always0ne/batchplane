import { sha256BytesHex } from "@batchplane/digest";
import type { GitHubBatchDefinition } from "./github-batch-definition.js";
import { serializeBatchDefinitionYaml } from "./batch-definition-codec.js";
import {
  buildChangeRequestBody,
  createTargetRevisionDigest,
} from "./change-request-evidence.js";
import { createGitHubLiteMockState } from "./mock-state.js";
import type { GitHubLiteMockState } from "./github-types.js";
type DeletedArchiveFixtureOptions = {
  body?: string;
  definitionContent?: string;
  evidenceDefinitionContent?: string;
  modifyEvidence?: (body: string) => string;
  omitDefinition?: boolean;
};

export async function createDeletedArchiveState(
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

  const batchDefinition: GitHubBatchDefinition = {
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
  const requestBody = buildChangeRequestBody(evidence);
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
