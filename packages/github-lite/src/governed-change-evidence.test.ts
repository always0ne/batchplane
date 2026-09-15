import { describe, expect, it } from "vitest";

import {
  buildGovernedChangeDecisionBody,
  buildGovernedChangeRequestBody,
  createGovernedChangeRequestDigest,
  createTargetRevisionDigest,
  parseGovernedChangeDecisionEvidence,
  parseGovernedChangeRequestEvidence,
} from "./governed-change-evidence";

const requestEvidence = {
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

describe("governed change evidence", () => {
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
    const digest = await createTargetRevisionDigest(artifacts);
    await expect(
      createTargetRevisionDigest([...artifacts].reverse()),
    ).resolves.toBe(digest);
    await expect(
      createTargetRevisionDigest([
        { ...artifacts[0]!, beforeDigest: "sha256:other-base" },
        artifacts[1]!,
      ]),
    ).resolves.toBe(digest);
    await expect(
      createTargetRevisionDigest([
        { ...artifacts[0]!, afterDigest: "sha256:changed" },
        artifacts[1]!,
      ]),
    ).resolves.not.toBe(digest);
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
    const empty = await createTargetRevisionDigest([
      {
        afterDigest: null,
        beforeDigest: "sha256:batch-before",
        kind: "BATCH_DEFINITION",
        path: ".batch-governance/batches/payment.yml",
      },
    ]);
    const present = await createTargetRevisionDigest([
      {
        afterDigest: "sha256:batch-after",
        beforeDigest: null,
        kind: "BATCH_DEFINITION",
        path: ".batch-governance/batches/payment.yml",
      },
    ]);
    expect(empty).not.toBe(present);
  });

  it("binds the request identity, actor, base revision, and target digest", async () => {
    const digest = await createGovernedChangeRequestDigest(requestEvidence);
    await expect(
      createGovernedChangeRequestDigest({
        ...requestEvidence,
        requester: "other",
      }),
    ).resolves.not.toBe(digest);
  });

  it("round trips request evidence through a versioned marker", () => {
    expect(
      parseGovernedChangeRequestEvidence(
        buildGovernedChangeRequestBody(requestEvidence),
      ),
    ).toEqual(requestEvidence);
  });

  it("round trips decision evidence without treating markdown as truth", () => {
    const decisionEvidence = {
      authorizationRevisionSha: "authorization-sha",
      headRevisionSha: "head-sha",
      decision: "REJECTED" as const,
      decisionSource: "USER" as const,
      governedChangeId: requestEvidence.governedChangeId,
      requestDigest: "sha256:request",
      rejectionReason: "Needs review.",
      targetRevisionDigest: requestEvidence.targetRevisionDigest,
      version: requestEvidence.version,
    };

    expect(
      parseGovernedChangeDecisionEvidence(
        buildGovernedChangeDecisionBody(decisionEvidence),
      ),
    ).toEqual(decisionEvidence);
  });

  it("does not accept an unmarked or a changed evidence version", () => {
    expect(parseGovernedChangeRequestEvidence("Decision: APPROVED")).toBeNull();
    expect(
      parseGovernedChangeRequestEvidence(
        buildGovernedChangeRequestBody(requestEvidence).replace(
          "batchplane.io/governed-change/v2",
          "batchplane.io/governed-change/v1",
        ),
      ),
    ).toBeNull();
  });
});
