import { describe, expect, it } from "vitest";

import {
  authorizeGovernedChangeApproval,
  authorizeGovernedChangeCreation,
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
