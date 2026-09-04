import type {
  BatchDefinition,
  BatchPlaneRuntimePorts,
} from "@batchplane/domain";
import { describe, expect, it, vi } from "vitest";

import { createRuntimeBatchPlaneClient } from "./runtime-batch-plane-client";
import { writeRuntimeFixtureSelection } from "./runtime-fixtures";

const batch: BatchDefinition = {
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

describe("runtime BatchPlane client", () => {
  it("uses the selected persistent fixture client for governed change operations", async () => {
    sessionStorage.clear();
    writeRuntimeFixtureSelection("happy-path");
    const client = createRuntimeBatchPlaneClient();

    await expect(
      client.loadBatchChangeDraft({ mode: "create" }),
    ).resolves.toMatchObject({
      governedChangeId: expect.any(String),
      mode: "create",
    });
  });

  it("resolves the current Workspace session for each batch-list query", async () => {
    const firstSession = { owner: "first", repo: "batch", token: "one" };
    const secondSession = { owner: "second", repo: "batch", token: "two" };
    const readSession = vi
      .fn()
      .mockReturnValueOnce(firstSession)
      .mockReturnValueOnce(secondSession);
    const listBatchDefinitions = vi.fn().mockResolvedValue([batch]);
    const createRuntime = vi.fn(() => createRuntimeWith(listBatchDefinitions));
    const client = createRuntimeBatchPlaneClient({
      createRuntime,
      readSession,
    });

    await expect(client.listBatches()).resolves.toEqual({
      batches: [
        {
          batchId: "payment.daily-close",
          criticality: "HIGH",
          environment: "PROD",
          gateRequired: true,
          hasExecutableCommand: true,
          name: "Daily Close",
          owner: "ops-team",
          status: "ACTIVE",
        },
      ],
      sourceRevision: "main",
      type: "loaded",
    });
    await client.listBatches();

    expect(createRuntime).toHaveBeenNthCalledWith(1, firstSession);
    expect(createRuntime).toHaveBeenNthCalledWith(2, secondSession);
    expect(listBatchDefinitions).toHaveBeenCalledWith({ ref: "main" });
  });

  it("reports an absent Workspace connection as a list outcome", async () => {
    const createRuntime = vi.fn();
    const client = createRuntimeBatchPlaneClient({
      createRuntime,
      readSession: () => null,
    });

    await expect(client.listBatches()).resolves.toEqual({
      type: "workspace-not-connected",
    });
    expect(createRuntime).not.toHaveBeenCalled();
  });

  it.each([
    ["absent", undefined],
    ["whitespace-only", { command: "   ", runsOn: "ubuntu-latest" }],
  ] as const)(
    "maps a %s execution command to a non-executable list item",
    async (_description, execution) => {
      const listBatchDefinitions = vi
        .fn()
        .mockResolvedValue([{ ...batch, execution }]);
      const client = createRuntimeBatchPlaneClient({
        createRuntime: () => createRuntimeWith(listBatchDefinitions),
        readSession: () => ({
          owner: "always0ne",
          repo: "batch",
          token: "one",
        }),
      });

      await expect(client.listBatches()).resolves.toMatchObject({
        batches: [{ hasExecutableCommand: false }],
        type: "loaded",
      });
    },
  );
});

function createRuntimeWith(
  listBatchDefinitions: () => Promise<BatchDefinition[]>,
): BatchPlaneRuntimePorts {
  return {
    batches: { listBatchDefinitions },
    settings: {
      getRepository: async () => ({
        defaultBranch: "main",
        owner: "always0ne",
        private: true,
        repo: "batch",
        url: "https://github.com/always0ne/batch",
      }),
    },
  } as unknown as BatchPlaneRuntimePorts;
}
