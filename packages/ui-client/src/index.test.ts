import { type BatchListItem, type BatchListResult } from "./index";
import { describe, expect, it } from "vitest";

describe("ui client contract", () => {
  it("models connection and loaded outcomes without storage details", () => {
    const batch: BatchListItem = {
      batchId: "payment.daily-close",
      control: {
        approvedRevision: {
          governedChangeId: "bgc-20260910-payment.daily-close-approved",
          targetRevisionDigest:
            "sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          verifiedSha: "abc123",
        },
        remediation: {
          availableKinds: ["REVIEW_CURRENT", "RESTORE_LAST_APPROVED"],
          canRequest: true,
        },
        status: "VERIFIED",
      },
      criticality: "HIGH",
      environment: "PROD",
      gateRequired: true,
      hasExecutableCommand: true,
      name: "Daily Close",
      owner: "ops-team",
      status: "ACTIVE",
    };
    const disconnected: BatchListResult = { type: "workspace-not-connected" };
    const loaded: BatchListResult = {
      batches: [batch],
      sourceRevision: "main",
      type: "loaded",
    };

    expect(disconnected.type).toBe("workspace-not-connected");
    expect(loaded).toEqual({
      batches: [batch],
      sourceRevision: "main",
      type: "loaded",
    });
  });
});
