import type { BatchChangeDraft } from "@batchplane/ui-client";
import { createGovernedChangeRequestDigest } from "@batchplane/domain";
import { describe, expect, it, vi } from "vitest";

import { verifyApprovedBatchRevision } from "./approved-batch-revision.js";
import { createGitHubLiteGovernedChangeClient } from "./governed-change-client.js";
import {
  buildGovernedChangeDecisionBody,
  parseGovernedChangeRequestEvidence,
} from "./governed-change-evidence.js";
import {
  getBatchArtifactPath,
  getBatchDefinitionPath,
  getBatchWorkflowPath,
  createGitHubLiteMockState,
  createMockGitHubLiteClient,
} from "./index.js";

const repository = { owner: "always0ne", repo: "batch" };

describe("approved Batch revision verification", () => {
  it("verifies the merged revision created through the normal approval flow", async () => {
    const { client, created } = await createApprovedBatchRevision();
    const revision = created.request.evidence;

    if (revision.kind !== "VERIFIED_V2")
      throw new Error("Expected verified evidence.");

    await expect(
      verifyApprovedBatchRevision({
        batchId: "payment.month-end",
        client,
        executionWorkflowSha: client.state.pullRequests.at(-1)?.mergeSha,
        expectedRevision: {
          governedChangeId: revision.governedChangeId,
          targetRevisionDigest: revision.targetRevisionDigest,
        },
        repository,
      }),
    ).resolves.toMatchObject({
      approvedRevision: {
        governedChangeId: revision.governedChangeId,
        targetRevisionDigest: revision.targetRevisionDigest,
      },
      controlStatus: "VERIFIED",
      verifiedSha: client.state.pullRequests.at(-1)?.mergeSha,
    });
  });

  it("rejects a request bound to an older approved revision after a newer Batch change merges", async () => {
    const first = await createApprovedBatchRevision();
    const firstEvidence = verifiedEvidence(first.created.request.evidence);
    const second = await approveBatchRevision(first.client, {
      ...batchDraft({
        governedChangeId: "bgc-20260901-payment-month-end-0002",
        name: "Month-end close, amended",
      }),
      mode: "change",
      targetBatchId: "payment.month-end",
    });
    const secondEvidence = verifiedEvidence(second.request.evidence);

    await expect(
      verifyApprovedBatchRevision({
        batchId: "payment.month-end",
        client: first.client,
        expectedRevision: {
          governedChangeId: firstEvidence.governedChangeId,
          targetRevisionDigest: firstEvidence.targetRevisionDigest,
        },
        repository,
      }),
    ).resolves.toEqual({
      controlStatus: "BYPASSED",
      reasonCode: "UNAPPROVED_BATCH_REVISION",
    });

    await expect(
      verifyApprovedBatchRevision({
        batchId: "payment.month-end",
        client: first.client,
        expectedRevision: {
          governedChangeId: secondEvidence.governedChangeId,
          targetRevisionDigest: secondEvidence.targetRevisionDigest,
        },
        repository,
      }),
    ).resolves.toMatchObject({ controlStatus: "VERIFIED" });
  });

  it("does not let an unrelated Batch change replace this Batch's latest lineage", async () => {
    const first = await createApprovedBatchRevision();
    const evidence = verifiedEvidence(first.created.request.evidence);
    await approveBatchRevision(first.client, {
      ...batchDraft({
        batchId: "risk.daily-close",
        governedChangeId: "bgc-20260901-risk-daily-close-0001",
        name: "Risk daily close",
      }),
      mode: "create",
    });

    await expect(
      verifyApprovedBatchRevision({
        batchId: "payment.month-end",
        client: first.client,
        expectedRevision: {
          governedChangeId: evidence.governedChangeId,
          targetRevisionDigest: evidence.targetRevisionDigest,
        },
        repository,
      }),
    ).resolves.toMatchObject({ controlStatus: "VERIFIED" });
  });

  it("fails closed when the executed workflow source differs from the approved artifact", async () => {
    const { client, created } = await createApprovedBatchRevision();
    const evidence = verifiedEvidence(created.request.evidence);

    await expect(
      verifyApprovedBatchRevision({
        batchId: "payment.month-end",
        client,
        executionWorkflowSha: "mock-main-sha",
        expectedRevision: {
          governedChangeId: evidence.governedChangeId,
          targetRevisionDigest: evidence.targetRevisionDigest,
        },
        repository,
      }),
    ).resolves.toEqual({
      controlStatus: "BYPASSED",
      reasonCode: "UNAPPROVED_BATCH_REVISION",
    });
  });

  it.each([
    ["Batch definition", getBatchDefinitionPath("payment.month-end")],
    ["workflow", getBatchWorkflowPath("payment.month-end")],
  ])(
    "fails closed when the current %s is changed outside its governed revision",
    async (_, path) => {
      const { client, created } = await createApprovedBatchRevision();
      const evidence = verifiedEvidence(created.request.evidence);

      await tamperCurrentFile(client, path);

      await expect(verifyRevision(client, evidence)).resolves.toEqual(
        bypassedRevision(),
      );
    },
  );

  it("fails closed when a registered artifact is changed outside its governed revision", async () => {
    const artifact = {
      bytes: new TextEncoder().encode("approved payload"),
      fileName: "payload.txt",
    };
    const { client, created } = await createApprovedBatchRevision({
      ...batchDraft(),
      artifact,
    });
    const evidence = verifiedEvidence(created.request.evidence);

    await tamperCurrentFile(
      client,
      getBatchArtifactPath("payment.month-end", artifact.fileName),
    );

    await expect(verifyRevision(client, evidence)).resolves.toEqual(
      bypassedRevision(),
    );
  });

  it("reports unknown when the GitHub approval history cannot be read", async () => {
    const { client, created } = await createApprovedBatchRevision();
    const evidence = verifiedEvidence(created.request.evidence);
    const unavailable = {
      ...client,
      listPullRequests: vi
        .fn()
        .mockRejectedValue(new Error("GitHub unavailable")),
    };

    await expect(
      verifyApprovedBatchRevision({
        batchId: "payment.month-end",
        client: unavailable,
        expectedRevision: {
          governedChangeId: evidence.governedChangeId,
          targetRevisionDigest: evidence.targetRevisionDigest,
        },
        repository,
      }),
    ).resolves.toEqual({
      controlStatus: "UNKNOWN",
      reasonCode: "APPROVED_BATCH_REVISION_UNAVAILABLE",
    });
  });

  it("reports unknown rather than bypassed when requester role proof cannot be read", async () => {
    const { client, created } = await createApprovedBatchRevision();
    const evidence = verifiedEvidence(created.request.evidence);
    const unavailable = {
      ...client,
      getRepositoryPermissionForUser: vi
        .fn()
        .mockRejectedValue(new Error("requester role read unavailable")),
    };

    await expect(verifyRevision(unavailable, evidence)).resolves.toEqual({
      controlStatus: "UNKNOWN",
      reasonCode: "APPROVED_BATCH_REVISION_UNAVAILABLE",
    });
  });

  it("does not resurrect an approval after a later authorized rejection before a native merge", async () => {
    const state = createGitHubLiteMockState({
      currentUser: { login: "developer" },
      executionScenarios: [],
      issueComments: [],
      issues: [],
    });
    const client = createMockGitHubLiteClient(state);
    const governedChanges = createGitHubLiteGovernedChangeClient(
      { ...repository, token: "test-token" },
      client,
    );
    const created =
      await governedChanges.createBatchChangeRequest(batchDraft());
    const pullRequest = client.state.pullRequests.find(
      (candidate) =>
        candidate.number === Number(created.request.requestLocator),
    );
    const request =
      pullRequest && parseGovernedChangeRequestEvidence(pullRequest.body);

    if (!pullRequest || !request) throw new Error("Expected governed request.");

    const requestDigest = await createGovernedChangeRequestDigest(request);
    client.state.currentUser.login = "maintainer";
    client.state.repositoryPermissions.push({
      permission: "maintain",
      roleName: "maintain",
      username: "maintainer",
    });
    const approval = {
      authorizationRevisionSha: "mock-main-sha",
      decision: "APPROVED" as const,
      decisionSource: "USER" as const,
      governedChangeId: request.governedChangeId,
      headRevisionSha: request.headRevisionSha,
      requestDigest,
      targetRevisionDigest: request.targetRevisionDigest,
      version: "batchplane.io/governed-change/v2" as const,
    };
    await client.createIssueComment({
      ...repository,
      body: buildGovernedChangeDecisionBody(approval),
      issueNumber: pullRequest.number,
    });
    await client.createIssueComment({
      ...repository,
      body: buildGovernedChangeDecisionBody({
        ...approval,
        decision: "REJECTED",
        rejectionReason: "Requires correction",
      }),
      issueNumber: pullRequest.number,
    });
    await client.mergePullRequest({
      ...repository,
      expectedHeadSha: pullRequest.headSha,
      pullNumber: pullRequest.number,
    });

    await expect(
      verifyApprovedBatchRevision({
        batchId: "payment.month-end",
        client,
        repository,
      }),
    ).resolves.toEqual({
      controlStatus: "BYPASSED",
      reasonCode: "UNAPPROVED_BATCH_REVISION",
    });
  });

  it.each([
    [
      "was edited",
      (client: ReturnType<typeof createMockGitHubLiteClient>) => {
        const comment = requiredDecisionComment(client);
        comment.updatedAt = "1970-01-01T00:00:01.000Z";
      },
    ],
    [
      "was written after the merge",
      (client: ReturnType<typeof createMockGitHubLiteClient>) => {
        const comment = requiredDecisionComment(client);
        comment.createdAt = "2999-01-01T00:00:00.000Z";
        comment.updatedAt = comment.createdAt;
      },
    ],
    [
      "was made by an actor who no longer has the approver role",
      (client: ReturnType<typeof createMockGitHubLiteClient>) => {
        client.state.repositoryPermissions =
          client.state.repositoryPermissions.map((permission) =>
            permission.username === "maintainer"
              ? { ...permission, permission: "read", roleName: "read" }
              : permission,
          );
      },
    ],
  ])("fails closed when the approval %s", async (_, mutate) => {
    const { client, created } = await createApprovedBatchRevision();
    const evidence = verifiedEvidence(created.request.evidence);

    mutate(client);

    await expect(verifyRevision(client, evidence)).resolves.toEqual(
      bypassedRevision(),
    );
  });

  it.each([
    "SELF_APPROVAL_BLOCKED",
    "SELF_APPROVAL_ALLOWED",
    "AUTO_APPROVE",
  ] as const)(
    "accepts the latest merged proof under %s policy semantics",
    async (approvalMode) => {
      const { client, created } = await createApprovedBatchRevision(
        batchDraft(),
        { approvalMode },
      );
      const evidence = verifiedEvidence(created.request.evidence);

      await expect(verifyRevision(client, evidence)).resolves.toMatchObject({
        controlStatus: "VERIFIED",
      });
    },
  );

  it("offers remediation only for a clean observed bypass, never verified, unknown, or pending control", async () => {
    const approved = await createApprovedBatchRevision();
    const approvedChanges = createGitHubLiteGovernedChangeClient(
      { ...repository, token: "test-token" },
      approved.client,
    );

    await expect(
      approvedChanges.getBatchRemediationCapability({
        batchId: "payment.month-end",
      }),
    ).resolves.toEqual({ availableKinds: [], canRequest: false });

    const unknownClient = {
      ...approved.client,
      getBranchHeadSha: vi.fn().mockRejectedValue(new Error("unavailable")),
    };
    const unknownChanges = createGitHubLiteGovernedChangeClient(
      { ...repository, token: "test-token" },
      unknownClient,
    );
    await expect(
      unknownChanges.getBatchRemediationCapability({
        batchId: "payment.month-end",
      }),
    ).resolves.toEqual({ availableKinds: [], canRequest: false });

    const pendingClient = createMockGitHubLiteClient(
      createGitHubLiteMockState(),
    );
    const pendingChanges = createGitHubLiteGovernedChangeClient(
      { ...repository, token: "test-token" },
      pendingClient,
    );
    await expect(
      pendingChanges.getBatchRemediationCapability({
        batchId: "payment.daily-close",
      }),
    ).resolves.toEqual({ availableKinds: [], canRequest: false });
  });

  it("creates a review-current remediation request without unlocking the bypass or ordinary no-ops", async () => {
    const { client, created } = await createApprovedBatchRevision();
    const approved = verifiedEvidence(created.request.evidence);
    await tamperCurrentFile(
      client,
      getBatchDefinitionPath("payment.month-end"),
    );
    const governedChanges = createGitHubLiteGovernedChangeClient(
      { ...repository, token: "test-token" },
      client,
    );

    const ordinaryDraft = await governedChanges.loadBatchChangeDraft({
      batchId: "payment.month-end",
      mode: "change",
    });
    await expect(
      governedChanges.createBatchChangeRequest(ordinaryDraft),
    ).rejects.toThrow("does not modify any file");

    client.state.currentUser.login = "developer";
    const review = await governedChanges.requestBatchRemediation({
      batchId: "payment.month-end",
      kind: "REVIEW_CURRENT",
    });
    const reviewEvidence = requestEvidence(
      client,
      review.request.requestLocator,
    );

    expect(reviewEvidence.remediation).toBe("REVIEW_CURRENT");
    await expect(verifyRevision(client, approved)).resolves.toEqual(
      bypassedRevision(),
    );
    await expect(
      governedChanges.getBatchRemediationCapability({
        batchId: "payment.month-end",
      }),
    ).resolves.toEqual({ availableKinds: [], canRequest: false });
  });

  it("requires a separately approved restoration request before the historical revision is applied", async () => {
    const { client } = await createApprovedBatchRevision();
    await tamperCurrentFile(
      client,
      getBatchDefinitionPath("payment.month-end"),
    );
    const governedChanges = createGitHubLiteGovernedChangeClient(
      { ...repository, token: "test-token" },
      client,
    );

    client.state.currentUser.login = "developer";
    const restoration = await governedChanges.requestBatchRemediation({
      batchId: "payment.month-end",
      kind: "RESTORE_LAST_APPROVED",
    });
    const restorationEvidence = requestEvidence(
      client,
      restoration.request.requestLocator,
    );

    expect(restorationEvidence.remediation).toBe("RESTORE_LAST_APPROVED");
    await expect(verifyRevision(client, restorationEvidence)).resolves.toEqual(
      bypassedRevision(),
    );

    client.state.currentUser.login = "maintainer";
    await governedChanges.approveGovernedChange({
      requestLocator: restoration.request.requestLocator,
    });

    await expect(
      verifyRevision(client, restorationEvidence),
    ).resolves.toMatchObject({
      controlStatus: "VERIFIED",
    });
  });
});

async function createApprovedBatchRevision(
  draft: BatchChangeDraft = batchDraft(),
  options: {
    approvalMode?:
      | "SELF_APPROVAL_BLOCKED"
      | "SELF_APPROVAL_ALLOWED"
      | "AUTO_APPROVE";
  } = {},
) {
  const state = createGitHubLiteMockState({
    currentUser: { login: "developer" },
    executionScenarios: [],
    issueComments: [],
    issues: [],
  });
  if (
    options.approvalMode &&
    options.approvalMode !== "SELF_APPROVAL_BLOCKED"
  ) {
    state.files.push({
      branch: "main",
      content: workspaceApprovalPolicy(options.approvalMode),
      path: ".batch-governance/workspace.yml",
      sha: "mock-workspace-policy-sha",
    });
  }
  if (options.approvalMode === "SELF_APPROVAL_ALLOWED") {
    state.repositoryPermissions = state.repositoryPermissions.map(
      (permission) =>
        permission.username === "developer"
          ? { ...permission, permission: "maintain", roleName: "maintain" }
          : permission,
    );
  }
  const client = createMockGitHubLiteClient(state);
  const created = await approveBatchRevision(
    client,
    draft,
    options.approvalMode,
  );

  return { client, created };
}

async function approveBatchRevision(
  client: ReturnType<typeof createMockGitHubLiteClient>,
  draft: BatchChangeDraft,
  approvalMode:
    | "SELF_APPROVAL_BLOCKED"
    | "SELF_APPROVAL_ALLOWED"
    | "AUTO_APPROVE" = "SELF_APPROVAL_BLOCKED",
) {
  client.state.currentUser.login = "developer";
  const governedChanges = createGitHubLiteGovernedChangeClient(
    { ...repository, token: "test-token" },
    client,
  );
  const created = await governedChanges.createBatchChangeRequest(draft);
  if (approvalMode === "AUTO_APPROVE") return created;
  if (approvalMode === "SELF_APPROVAL_ALLOWED") {
    await governedChanges.approveGovernedChange({
      requestLocator: created.request.requestLocator,
    });
    return created;
  }
  client.state.currentUser.login = "maintainer";
  client.state.repositoryPermissions.push({
    permission: "maintain",
    roleName: "maintain",
    username: "maintainer",
  });
  await governedChanges.approveGovernedChange({
    requestLocator: created.request.requestLocator,
  });

  return created;
}

function batchDraft(
  overrides: Partial<BatchChangeDraft["batch"]> & {
    governedChangeId?: string;
  } = {},
): BatchChangeDraft {
  const { governedChangeId, ...batch } = overrides;

  return {
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
      ...batch,
    },
    governedChangeId: governedChangeId ?? "bgc-20260901-payment-month-end-0001",
    mode: "create",
    schedules: [],
  };
}

function verifiedEvidence(
  evidence: Awaited<
    ReturnType<typeof approveBatchRevision>
  >["request"]["evidence"],
) {
  if (evidence.kind !== "VERIFIED_V2")
    throw new Error("Expected verified evidence.");

  return evidence;
}

function bypassedRevision() {
  return {
    controlStatus: "BYPASSED" as const,
    reasonCode: "UNAPPROVED_BATCH_REVISION" as const,
  };
}

function verifyRevision(
  client: ReturnType<typeof createMockGitHubLiteClient>,
  evidence: { governedChangeId: string; targetRevisionDigest: string },
) {
  return verifyApprovedBatchRevision({
    batchId: "payment.month-end",
    client,
    expectedRevision: {
      governedChangeId: evidence.governedChangeId,
      targetRevisionDigest: evidence.targetRevisionDigest,
    },
    repository,
  });
}

async function tamperCurrentFile(
  client: ReturnType<typeof createMockGitHubLiteClient>,
  path: string,
) {
  const file = await client.getFile({ ...repository, path, ref: "main" });
  if (!file) throw new Error(`Expected ${path}.`);

  await client.putFile({
    ...repository,
    branch: "main",
    content: `${file.content}\n# unauthorized current revision\n`,
    message: "Unauthorized fixture mutation",
    path,
    sha: file.sha,
  });
}

function requiredDecisionComment(
  client: ReturnType<typeof createMockGitHubLiteClient>,
) {
  const comment = client.state.issueComments.find((candidate) =>
    candidate.body.includes("batchplane:governed-change-decision"),
  );
  if (!comment) throw new Error("Expected governed decision comment.");

  return comment;
}

function requestEvidence(
  client: ReturnType<typeof createMockGitHubLiteClient>,
  requestLocator: string,
) {
  const pullRequest = client.state.pullRequests.find(
    (candidate) => candidate.number === Number(requestLocator),
  );
  const evidence =
    pullRequest && parseGovernedChangeRequestEvidence(pullRequest.body);
  if (!evidence)
    throw new Error("Expected canonical governed change evidence.");

  return evidence;
}

function workspaceApprovalPolicy(
  mode: "SELF_APPROVAL_ALLOWED" | "AUTO_APPROVE",
) {
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
