import type { BatchDefinition } from "@batchplane/domain";
import { GitHubLiteApiError } from "./index.js";
import { describe, expect, it, vi } from "vitest";

import {
  createGitHubLiteBatchReadClient,
  type GitHubLiteBatchReadClientDependencies,
} from "./batch-plane-client.js";

const batch: BatchDefinition = {
  batchId: "payment.daily-close",
  criticality: "HIGH",
  domain: "payments",
  environment: "PROD",
  execution: {
    command: "java -jar close.jar",
    runsOn: "ubuntu-latest",
  },
  gateRequired: true,
  name: "Daily close",
  owner: "payments-ops",
  schedules: [
    {
      cron: "0 5 * * *",
      enabled: true,
      name: "Korean business day close",
      scheduleId: "daily-close",
      timezone: "Asia/Seoul",
    },
  ],
  status: "ACTIVE",
  workflow: {
    path: ".github/workflows/payment.daily-close.yml",
    ref: "main",
  },
};

describe("GitHub Lite BatchPlane client", () => {
  it("maps a GitHub provider failure to a product list outcome", async () => {
    const listBatchDefinitions = vi
      .fn()
      .mockRejectedValue(
        new GitHubLiteApiError("bad token", "unauthorized", 401),
      );
    const client = createGitHubLiteBatchReadClient(
      createDependencies({ listBatchDefinitions }),
    );

    await expect(client.listBatches()).resolves.toEqual({
      error: { type: "authentication-required" },
      type: "error",
    });
  });

  it.each([
    [401, "authentication-required"],
    [403, "access-denied"],
    [404, "resource-unavailable"],
    [409, "conflict"],
    [422, "invalid-input"],
    [429, "temporarily-unavailable"],
  ] as const)(
    "uses GitHub status %s when the provider error code is absent",
    async (status, type) => {
      const error = new Error("provider request failed");
      error.name = "GitHubLiteApiError";
      Object.assign(error, { status });
      const client = createGitHubLiteBatchReadClient(
        createDependencies({
          listBatchDefinitions: vi.fn().mockRejectedValue(error),
        }),
      );

      await expect(client.listBatches()).resolves.toEqual({
        error: { type },
        type: "error",
      });
    },
  );

  it("preserves a meaningful non-provider batch-list failure", async () => {
    const client = createGitHubLiteBatchReadClient(
      createDependencies({
        listBatchDefinitions: vi
          .fn()
          .mockRejectedValue(new Error("Batch definition is malformed")),
      }),
    );

    await expect(client.listBatches()).resolves.toEqual({
      error: { message: "Batch definition is malformed", type: "message" },
      type: "error",
    });
  });

  it("uses the product fallback for a non-Error batch-list failure", async () => {
    const client = createGitHubLiteBatchReadClient(
      createDependencies({
        listBatchDefinitions: vi.fn().mockRejectedValue(null),
      }),
    );

    await expect(client.listBatches()).resolves.toEqual({
      error: { type: "unknown" },
      type: "error",
    });
  });

  it("projects GitHub scheduler cron metadata for active and deleted detail results", async () => {
    const activeClient = createGitHubLiteBatchReadClient(
      createDependencies({
        listBatchDefinitions: vi.fn().mockResolvedValue([batch]),
      }),
    );
    const activeResult = await activeClient.getBatchDetail({
      batchId: batch.batchId,
    });

    expect(activeResult).toMatchObject({
      batch: {
        schedules: [{ generatedCron: "0 20 * * *" }],
      },
      type: "active",
    });

    const deletedClient = createGitHubLiteBatchReadClient(
      createDependencies({
        getDeletedBatchArchive: vi.fn().mockResolvedValue({
          batch,
          sourceRequest: {
            locator: "44",
            number: 44,
            url: "https://example.test/44",
          },
          status: "VERIFIED",
        }),
      }),
    );
    const deletedResult = await deletedClient.getBatchDetail({
      batchId: batch.batchId,
    });

    expect(deletedResult).toMatchObject({
      archive: {
        batch: {
          schedules: [{ generatedCron: "0 20 * * *" }],
        },
      },
      type: "deleted",
    });
  });
});

function createDependencies({
  getDeletedBatchArchive = vi.fn().mockResolvedValue(null),
  listBatchDefinitions = vi.fn().mockResolvedValue([]),
}: {
  getDeletedBatchArchive?: ReturnType<typeof vi.fn>;
  listBatchDefinitions?: ReturnType<typeof vi.fn>;
} = {}): GitHubLiteBatchReadClientDependencies {
  return {
    governedChangeClient: {
      getBatchRemediationCapability: vi.fn().mockResolvedValue({
        availableKinds: [],
        canRequest: false,
      }),
    },
    revisionClient: {
      listRecentExecutionRequestSummaries: vi.fn().mockResolvedValue([]),
      verifyApprovedBatchRevision: vi.fn().mockResolvedValue({
        controlStatus: "UNKNOWN",
        reasonCode: "APPROVED_BATCH_REVISION_UNAVAILABLE",
      }),
    },
    runtime: {
      batches: { getDeletedBatchArchive, listBatchDefinitions },
      settings: {
        getRepository: vi.fn().mockResolvedValue({ defaultBranch: "main" }),
      },
    },
  } as unknown as GitHubLiteBatchReadClientDependencies;
}
