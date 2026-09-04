import { describe, expect, it } from "vitest";

import {
  buildGovernedChangeDecisionBody,
  buildGovernedChangeRequestBody,
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
