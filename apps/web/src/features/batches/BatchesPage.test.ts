import type { BatchDefinition } from "@batchplane/domain";
import { describe, expect, it } from "vitest";

import { getExecutionRequestBlockReason } from "./batch-list-readiness";

const messages: Record<string, string> = {
  "execution.errors.gateRequired": "Gate missing",
  "execution.errors.inactive": "Inactive",
  "execution.errors.missingCommand": "Missing command",
  "execution.errors.requestInProgress": "Request in progress",
};

const activeBatch: BatchDefinition = {
  batchId: "payment.daily-close",
  criticality: "HIGH",
  domain: "payments",
  environment: "PROD",
  execution: {
    command: "echo close payments",
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
};

describe("BatchesPage execution request readiness", () => {
  it("returns no block reason for executable batches", () => {
    expect(
      getExecutionRequestBlockReason({
        batch: activeBatch,
        isRequestInProgress: false,
        t,
      }),
    ).toBeNull();
  });

  it("returns the visible reason when execution cannot be requested", () => {
    expect(
      getExecutionRequestBlockReason({
        batch: { ...activeBatch, status: "INACTIVE" },
        isRequestInProgress: false,
        t,
      }),
    ).toBe("Inactive");
    expect(
      getExecutionRequestBlockReason({
        batch: { ...activeBatch, gateRequired: false },
        isRequestInProgress: false,
        t,
      }),
    ).toBe("Gate missing");
    expect(
      getExecutionRequestBlockReason({
        batch: {
          ...activeBatch,
          execution: { ...activeBatch.execution!, command: "" },
        },
        isRequestInProgress: false,
        t,
      }),
    ).toBe("Missing command");
    expect(
      getExecutionRequestBlockReason({
        batch: activeBatch,
        isRequestInProgress: true,
        t,
      }),
    ).toBe("Request in progress");
  });
});

function t(key: string): string {
  return messages[key] ?? key;
}
