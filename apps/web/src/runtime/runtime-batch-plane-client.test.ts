import { describe, expect, it, vi } from "vitest";
import { isWorkspaceNotConnectedError } from "@batchplane/ui-client";
import {
  createGitHubLiteBatchPlaneClient,
  createGitHubLiteMockState,
  createMockGitHubLiteClient,
} from "@batchplane/github-lite";
import { createRuntimeBatchPlaneClient } from "./runtime-batch-plane-client";
import { writeRuntimeFixtureSelection } from "./runtime-fixtures";

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

  it("resolves the current Workspace session for each read and command", async () => {
    const firstSession = { owner: "first", repo: "batch", token: "one" };
    const secondSession = { owner: "second", repo: "batch", token: "two" };
    const readSession = vi
      .fn()
      .mockReturnValueOnce(firstSession)
      .mockReturnValueOnce(secondSession);
    const product = createGitHubLiteBatchPlaneClient({
      client: createMockGitHubLiteClient(createGitHubLiteMockState()),
      repositoryRef: firstSession,
    });
    const listBatches = vi.spyOn(product, "listBatches").mockResolvedValue({
      type: "loaded",
      batches: [],
      sourceRevision: "main",
    });
    const loadDraft = vi.spyOn(product, "loadBatchChangeDraft");
    const createClient = vi.fn(() => product);
    const client = createRuntimeBatchPlaneClient({ createClient, readSession });
    await expect(client.listBatches()).resolves.toEqual({
      type: "loaded",
      batches: [],
      sourceRevision: "main",
    });
    await client.loadBatchChangeDraft({ mode: "create" });
    expect(createClient).toHaveBeenNthCalledWith(1, firstSession);
    expect(createClient).toHaveBeenNthCalledWith(2, secondSession);
    expect(listBatches).toHaveBeenCalledWith();
    expect(loadDraft).toHaveBeenCalledWith({ mode: "create" });
  });

  it("reports an absent Workspace connection as a list outcome", async () => {
    const createClient = vi.fn();
    const client = createRuntimeBatchPlaneClient({
      createClient,
      readSession: () => null,
    });
    await expect(client.listBatches()).resolves.toEqual({
      type: "workspace-not-connected",
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("throws the named Workspace connection error for reads and commands", async () => {
    const createClient = vi.fn();
    const client = createRuntimeBatchPlaneClient({
      createClient,
      readSession: () => null,
    });
    await expect(
      client.loadBatchChangeDraft({ mode: "create" }),
    ).rejects.toSatisfy(isWorkspaceNotConnectedError);
    await expect(
      client.loadExecutionRequestDraft({ batchId: "payment.daily-close" }),
    ).rejects.toSatisfy(isWorkspaceNotConnectedError);
    await expect(client.listExecutionRuns()).rejects.toSatisfy(
      isWorkspaceNotConnectedError,
    );
    await expect(client.inspectWorkspace()).rejects.toSatisfy(
      isWorkspaceNotConnectedError,
    );
    expect(createClient).not.toHaveBeenCalled();
  });
});
