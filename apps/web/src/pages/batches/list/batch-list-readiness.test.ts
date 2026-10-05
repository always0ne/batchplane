import type { BatchListItem } from "@batchplane/ui-client";
import { describe, expect, it } from "vitest";

import { getExecutionRequestBlockReason } from "./batch-list-readiness";

const messages: Record<string, string> = {
  "execution.errors.gateRequired": "Gate missing",
  "execution.errors.inactive": "Inactive",
  "execution.errors.missingCommand": "Missing command",
  "execution.errors.requestInProgress": "Request in progress",
};

const activeBatch: BatchListItem = {
  batchId: "payment.daily-close",
  control: {
    approvedRevision: {
      governedChangeId: "bgc-20260910-payment.daily-close-approved",
      targetRevisionDigest: "sha256:approved",
      verifiedSha: "abc123",
    },
    remediation: { availableKinds: [], canRequest: false },
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

describe("getExecutionRequestBlockReason", () => {
  it("returns visible request-block reasons for missing Gate evidence and command", () => {
    expect(
      getExecutionRequestBlockReason({
        batch: { ...activeBatch, gateRequired: false },
        isRequestInProgress: false,
        t,
      }),
    ).toBe("Gate missing");
    expect(
      getExecutionRequestBlockReason({
        batch: { ...activeBatch, hasExecutableCommand: false },
        isRequestInProgress: false,
        t,
      }),
    ).toBe("Missing command");
  });
});

function t(key: string): string {
  return messages[key] ?? key;
}
