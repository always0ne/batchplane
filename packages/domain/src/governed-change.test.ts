import { describe, expect, it } from "vitest";

import {
  authorizeGovernedChangeApproval,
  authorizeGovernedChangeCreation,
  createGovernedChangeRequestDigest,
  createTargetRevisionDigest,
  resolveAutoApproval,
  validateRejectionReason,
} from "./governed-change";

describe("governed change authorization", () => {
  it("requires the requester role before a change can be created", () => {
    expect(
      authorizeGovernedChangeCreation({ actorHasRequesterRole: false }),
    ).toEqual({ allowed: false, reason: "REQUESTER_ROLE_REQUIRED" });
  });

  it("keeps approver eligibility independent from self approval mode", () => {
    expect(
      authorizeGovernedChangeApproval({
        actorHasApproverRole: false,
        actorHasRequesterRole: true,
        actorIsRequester: false,
        approvalMode: "SELF_APPROVAL_ALLOWED",
      }),
    ).toEqual({ allowed: false, reason: "APPROVER_ROLE_REQUIRED" });
  });

  it("blocks and allows self approval according to the Workspace policy", () => {
    expect(
      authorizeGovernedChangeApproval({
        actorHasApproverRole: true,
        actorHasRequesterRole: true,
        actorIsRequester: true,
        approvalMode: "SELF_APPROVAL_BLOCKED",
      }),
    ).toEqual({ allowed: false, reason: "SELF_APPROVAL_BLOCKED" });

    expect(
      authorizeGovernedChangeApproval({
        actorHasApproverRole: true,
        actorHasRequesterRole: true,
        actorIsRequester: true,
        approvalMode: "SELF_APPROVAL_ALLOWED",
      }),
    ).toEqual({ allowed: true, decisionSource: "USER" });
  });

  it("records automatic approval as Workspace policy rather than a person", () => {
    expect(
      resolveAutoApproval({
        actorHasRequesterRole: true,
        approvalMode: "AUTO_APPROVE",
      }),
    ).toEqual({ allowed: true, decisionSource: "WORKSPACE_POLICY" });
  });

  it("requires a meaningful rejection reason", () => {
    expect(validateRejectionReason("   ")).toBe(false);
    expect(validateRejectionReason("Command validation failed.")).toBe(true);
  });
});

describe("governed change digests", () => {
  it("binds the complete resulting state independently of its base", async () => {
    const artifacts = [
      {
        afterDigest: "sha256:workflow-after",
        beforeDigest: "sha256:workflow-before",
        kind: "WORKFLOW" as const,
        path: ".github/workflows/payment.yml",
      },
      {
        afterDigest: "sha256:batch-after",
        beforeDigest: null,
        kind: "BATCH_DEFINITION" as const,
        path: ".batch-governance/batches/payment.yml",
      },
    ];
    const targetDigest = await createTargetRevisionDigest(artifacts);

    await expect(
      createTargetRevisionDigest([...artifacts].reverse()),
    ).resolves.toBe(targetDigest);
    await expect(
      createTargetRevisionDigest([
        { ...artifacts[0]!, beforeDigest: "sha256:other-base" },
        artifacts[1]!,
      ]),
    ).resolves.toBe(targetDigest);
    await expect(
      createTargetRevisionDigest([
        { ...artifacts[0]!, afterDigest: "sha256:changed" },
        artifacts[1]!,
      ]),
    ).resolves.not.toBe(targetDigest);
  });

  it("does not bind an obsolete removed artifact path into target state", async () => {
    const resultingArtifacts = [
      {
        afterDigest: "sha256:batch-after",
        beforeDigest: "sha256:batch-before",
        kind: "BATCH_DEFINITION" as const,
        path: ".batch-governance/batches/payment.yml",
      },
    ];

    await expect(
      createTargetRevisionDigest([
        ...resultingArtifacts,
        {
          afterDigest: null,
          beforeDigest: "sha256:obsolete",
          kind: "ARTIFACT" as const,
          path: "old/vendor/runner.jar",
        },
      ]),
    ).resolves.toBe(await createTargetRevisionDigest(resultingArtifacts));
  });

  it("keeps an all-delete target explicitly distinct from a present state", async () => {
    const emptyTarget = await createTargetRevisionDigest([
      {
        afterDigest: null,
        beforeDigest: "sha256:batch-before",
        kind: "BATCH_DEFINITION",
        path: ".batch-governance/batches/payment.yml",
      },
    ]);
    const presentTarget = await createTargetRevisionDigest([
      {
        afterDigest: "sha256:batch-after",
        beforeDigest: null,
        kind: "BATCH_DEFINITION",
        path: ".batch-governance/batches/payment.yml",
      },
    ]);

    expect(emptyTarget).not.toBe(presentTarget);
  });

  it("binds the request identity, actor, base revision, and target digest", async () => {
    const request = {
      artifacts: [],
      baseRevisionSha: "base-sha",
      batchId: "payment.daily-close",
      governedChangeId: "bgc-payment-1",
      headRevisionSha: "head-sha",
      repository: "always0ne/batch",
      requester: "requester",
      requestedAt: "2026-09-01T00:00:00.000Z",
      targetRevisionDigest: "sha256:target",
      type: "CHANGE" as const,
      version: "batchplane.io/governed-change/v2" as const,
      workspace: "always0ne/batch",
    };

    const requestDigest = await createGovernedChangeRequestDigest(request);

    await expect(
      createGovernedChangeRequestDigest({ ...request, requester: "other" }),
    ).resolves.not.toBe(requestDigest);
  });
});
