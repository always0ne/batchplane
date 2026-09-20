import { describe, expect, it } from "vitest";

import type { ChangeRequest } from "./change-requests.js";

const requestBase = {
  batchId: "payment.daily-close",
  mode: "CHANGE" as const,
  requestLocator: "42",
  requester: "developer",
  sourceLabel: "#42",
  title: "Change batch payment.daily-close",
};

describe("change request client contract", () => {
  it("keeps verified evidence and its identifiers in one discriminated branch", () => {
    const request: ChangeRequest = {
      ...requestBase,
      evidence: {
        governedChangeId: "bgc-payment-close",
        kind: "VERIFIED_V2",
        requestDigest: "sha256:request",
        targetRevisionDigest: "sha256:target",
      },
      reviewState: "OPEN",
    };

    expect(request.evidence).toMatchObject({ kind: "VERIFIED_V2" });
  });

  it("does not allow an unverified request to claim verified identifiers", () => {
    const request: ChangeRequest = {
      ...requestBase,
      evidence: { kind: "REAPPROVAL_REQUIRED", reason: "UNVERIFIED_REQUEST" },
      reviewState: "REAPPROVAL_REQUIRED",
    };

    expect(request.evidence).toEqual({
      kind: "REAPPROVAL_REQUIRED",
      reason: "UNVERIFIED_REQUEST",
    });
  });
});
