import { loadBatchDefinitions } from "./batch-repository.js";
import { loadDeletedBatchArchive } from "./deleted-batch-archive.js";
import { createMockGitHubLiteClient } from "./mock-client.js";
import { createGitHubLiteMockState } from "./mock-state.js";
import { GitHubLiteApiError } from "./github-types.js";
import { describe, expect, it, vi } from "vitest";

import {
  createGitHubLiteBatchReadClient,
  type GitHubLiteBatchReadClientDependencies,
} from "./batch-plane-client.js";
import type { GitHubBatchDefinition } from "./github-batch-definition.js";

vi.mock("./batch-repository.js", () => ({ loadBatchDefinitions: vi.fn() }));
vi.mock("./deleted-batch-archive.js", () => ({
  loadDeletedBatchArchive: vi.fn(),
}));

const batch: GitHubBatchDefinition = {
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
  it.each([
    ["absent", undefined],
    ["whitespace-only", { command: "   ", runsOn: "ubuntu-latest" }],
  ] as const)(
    "maps a %s execution command to a non-executable list item",
    async (_description, execution) => {
      const client = createGitHubLiteBatchReadClient(
        createDependencies({
          listBatchDefinitions: vi
            .fn()
            .mockResolvedValue([{ ...batch, execution }]),
        }),
      );
      await expect(client.listBatches()).resolves.toMatchObject({
        batches: [{ hasExecutableCommand: false }],
        type: "loaded",
      });
    },
  );

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
        schedules: [{ generatedCron: "0 5 * * *" }],
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
          schedules: [{ generatedCron: "0 5 * * *" }],
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
  getDeletedBatchArchive?: typeof loadDeletedBatchArchive;
  listBatchDefinitions?: typeof loadBatchDefinitions;
} = {}): GitHubLiteBatchReadClientDependencies {
  vi.mocked(loadBatchDefinitions).mockImplementation(listBatchDefinitions);
  vi.mocked(loadDeletedBatchArchive).mockImplementation(getDeletedBatchArchive);
  return {
    client: createMockGitHubLiteClient(createGitHubLiteMockState()),
    repositoryRef: { owner: "always0ne", repo: "batch" },
    changeRequestClient: {
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
  };
}
