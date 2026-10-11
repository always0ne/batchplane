import { Buffer } from "node:buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isWorkspaceNotConnectedError } from "@batchplane/ui-client";
import {
  createGitHubLiteBatchPlaneClient,
  createGitHubLiteMockState,
  createMockGitHubLiteClient,
} from "@batchplane/github-lite";
import { createRuntimeBatchPlaneClient } from "./runtime-batch-plane-client";
import { writeRuntimeFixtureSelection } from "./runtime-fixtures";
import { clearGitHubSession, writeGitHubSession } from "./github-session";
import { runtimeConnectionChangedEvent } from "./runtime-connection-lifecycle";

const resetListeners: Array<() => void> = [];

function createFrontendRuntime(
  dependencies: Parameters<typeof createRuntimeBatchPlaneClient>[0],
) {
  const runtime = createRuntimeBatchPlaneClient(dependencies);
  window.addEventListener(
    runtimeConnectionChangedEvent,
    runtime.resetConnection,
  );
  resetListeners.push(runtime.resetConnection);
  return runtime;
}

function workspaceConnection() {
  const transport = createMockGitHubLiteClient();
  transport.state.pullRequests = [];
  const session = {
    owner: transport.state.repository.owner,
    repo: transport.state.repository.repo,
    token: "local-test-token",
  };
  const createClient = vi.fn(() =>
    createGitHubLiteBatchPlaneClient({
      client: transport,
      repositoryRef: session,
    }),
  );
  return { transport, session, createClient };
}

describe("runtime BatchPlane client", () => {
  beforeEach(() => {
    // Node's encoder and WebCrypto return Node-realm arrays in the DOM test environment.
    vi.stubGlobal("Uint8Array", Object.getPrototypeOf(Buffer));
    sessionStorage.clear();
    writeRuntimeFixtureSelection("live");
  });
  afterEach(() => {
    for (const reset of resetListeners.splice(0)) {
      window.removeEventListener(runtimeConnectionChangedEvent, reset);
      reset();
    }
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it("reuses the selected product client across fresh session reads but fetches each list result anew", async () => {
    const input = workspaceConnection();
    const product = input.createClient();
    input.createClient.mockClear();
    input.createClient.mockReturnValue(product);
    const list = vi
      .spyOn(product, "listBatches")
      .mockResolvedValueOnce({
        type: "loaded",
        batches: [],
        sourceRevision: "first",
      })
      .mockResolvedValueOnce({
        type: "loaded",
        batches: [],
        sourceRevision: "second",
      });
    const runtime = createRuntimeBatchPlaneClient({
      createClient: input.createClient,
      readSession: () => ({ ...input.session }),
    });
    expect(await runtime.listBatches()).toMatchObject({
      sourceRevision: "first",
    });
    expect(await runtime.listBatches()).toMatchObject({
      sourceRevision: "second",
    });
    expect(input.createClient).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("retains the transient Workspace key and request through inspection and same-session upload retry", async () => {
    const input = workspaceConnection();
    writeGitHubSession(input.session);
    const upload = vi
      .spyOn(input.transport, "putActionsSecret")
      .mockRejectedValueOnce(new Error("local upload unavailable"));
    const request = vi.spyOn(input.transport, "createPullRequest");
    const runtime = createFrontendRuntime({ createClient: input.createClient });
    const failed = await runtime.initializeWorkspaceEncryption();
    expect(failed.error).toMatchObject({ message: "local upload unavailable" });
    expect(failed).toMatchObject({
      upload: "FAILED",
      status: { canRetryUpload: true },
    });
    expect((await runtime.inspectWorkspaceEncryption()).request).toEqual(
      failed.status.request,
    );
    const retried = await runtime.initializeWorkspaceEncryption();
    expect(retried.upload).toBe("RECORDED");
    expect(retried.status.request).toEqual(failed.status.request);
    expect(input.createClient).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledTimes(2);
  });

  it.each([
    "disconnect/reconnect",
    "save the same session",
    "fixture change",
  ] as const)(
    "%s immediately releases the selected client and leaves a lost-key setup incomplete without overwriting it",
    async (transition) => {
      const input = workspaceConnection();
      writeGitHubSession(input.session);
      const upload = vi
        .spyOn(input.transport, "putActionsSecret")
        .mockRejectedValueOnce(new Error("local upload unavailable"));
      const request = vi.spyOn(input.transport, "createPullRequest");
      const runtime = createRuntimeBatchPlaneClient({
        createClient: input.createClient,
      });
      const reset = vi.spyOn(runtime, "resetConnection");
      window.addEventListener(
        runtimeConnectionChangedEvent,
        runtime.resetConnection,
      );
      resetListeners.push(runtime.resetConnection);
      const failed = await runtime.initializeWorkspaceEncryption();
      expect(failed.status.canRetryUpload).toBe(true);
      if (transition === "disconnect/reconnect") {
        clearGitHubSession();
        expect(reset).toHaveBeenCalledTimes(1);
        writeGitHubSession(input.session);
      } else if (transition === "save the same session") {
        writeGitHubSession(input.session);
      } else {
        writeRuntimeFixtureSelection("happy-path");
        expect(reset).toHaveBeenCalledTimes(1);
        writeRuntimeFixtureSelection("live");
      }
      expect(reset).toHaveBeenCalled();
      const reconnected = await runtime.initializeWorkspaceEncryption();
      expect(reconnected).toMatchObject({
        upload: "NOT_ATTEMPTED",
        status: {
          state: "INCOMPLETE",
          canInitialize: false,
          canRetryUpload: false,
        },
      });
      expect(reconnected.status.request).toEqual(failed.status.request);
      expect(input.createClient).toHaveBeenCalledTimes(2);
      expect(request).toHaveBeenCalledTimes(1);
      expect(upload).toHaveBeenCalledTimes(1);
    },
  );

  it("drops the selected client on a disconnected read before reconnecting with identical credentials", async () => {
    const input = workspaceConnection();
    const readSession = vi.fn().mockReturnValue(input.session);
    const runtime = createRuntimeBatchPlaneClient({
      createClient: input.createClient,
      readSession,
    });
    await runtime.inspectWorkspaceEncryption();
    readSession.mockReturnValueOnce(null);
    expect(await runtime.listBatches()).toEqual({
      type: "workspace-not-connected",
    });
    await runtime.inspectWorkspaceEncryption();
    expect(input.createClient).toHaveBeenCalledTimes(2);
  });

  it("uses a new selected client when the fixture changes despite identical session credentials", async () => {
    const input = workspaceConnection();
    const readFixture = vi
      .fn()
      .mockReturnValueOnce("live")
      .mockReturnValueOnce("happy-path");
    const runtime = createRuntimeBatchPlaneClient({
      createClient: input.createClient,
      readSession: () => input.session,
      readFixture,
    });
    await runtime.inspectWorkspaceEncryption();
    await runtime.inspectWorkspaceEncryption();
    expect(input.createClient).toHaveBeenCalledTimes(2);
  });

  it("uses the selected fixture client for a change-request draft read", async () => {
    sessionStorage.clear();
    writeRuntimeFixtureSelection("happy-path");
    const client = createRuntimeBatchPlaneClient();
    await expect(
      client.loadBatchChangeDraft({ mode: "create" }),
    ).resolves.toMatchObject({
      changeRequestId: expect.any(String),
      mode: "create",
    });
  });

  it("resolves the current Workspace session for successive reads", async () => {
    const firstSession = { owner: "first", repo: "batch", token: "one" };
    const secondSession = { owner: "second", repo: "batch", token: "two" };
    const readSession = vi
      .fn()
      .mockReturnValueOnce(firstSession)
      .mockReturnValueOnce(secondSession);
    const state = createGitHubLiteMockState();
    state.repository.owner = firstSession.owner;
    const product = createGitHubLiteBatchPlaneClient({
      client: createMockGitHubLiteClient(state),
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

  it("throws the named Workspace connection error for connected-client reads", async () => {
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
    expect(createClient).not.toHaveBeenCalled();
  });
});
