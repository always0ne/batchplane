import { describe, expect, it } from "vitest";
import { createMockGitHubLiteClient } from "./mock-client.js";
const session = { owner: "always0ne", repo: "batch" };
import { loadDeletedBatchArchive } from "./deleted-batch-archive.js";
import { serializeBatchDefinitionYaml } from "./batch-definition-codec.js";
import { createDeletedArchiveState } from "./product-client.test-fixtures.js";
describe("deleted Batch archive verification", () => {
  it("returns a verified deleted archive from the request base revision", async () => {
    const state = await createDeletedArchiveState();
    const context = {
      client: createMockGitHubLiteClient(state),
      repositoryRef: session,
    };

    const result = await loadDeletedBatchArchive({
      client: context.client,
      repository: session,
      baseBranch: "main",
      batchId: "payment.daily-close",
    });

    expect(result).not.toBeNull();
    if (!result) return;

    expect(result.status).toBe("VERIFIED");

    if (result.status !== "VERIFIED") return;

    expect(result.sourceRequest).toEqual({
      locator: "40",
      number: 40,
      url: "https://github.com/always0ne/batch/pull/40",
    });
    expect(result.batch).toEqual(
      expect.objectContaining({
        batchId: "payment.daily-close",
        execution: expect.objectContaining({ command: "echo mock batch" }),
        name: "Daily Close",
        schedules: expect.arrayContaining([
          expect.objectContaining({
            scheduleId: "payment.daily-close-daily",
          }),
        ]),
      }),
    );
  });

  it("returns unavailable for legacy or malformed archive evidence", async () => {
    const state = await createDeletedArchiveState({
      body: [
        "## BatchPlane Deletion",
        "",
        "- Batch ID: `payment.daily-close`",
        "- Name: `Forged from an old PR body`",
      ].join("\n"),
    });
    const context = {
      client: createMockGitHubLiteClient(state),
      repositoryRef: session,
    };

    const result = await loadDeletedBatchArchive({
      client: context.client,
      repository: session,
      baseBranch: "main",
      batchId: "payment.daily-close",
    });

    expect(result).not.toBeNull();
    if (!result) return;

    expect(result).toEqual({
      sourceRequest: {
        locator: "40",
        number: 40,
        url: "https://github.com/always0ne/batch/pull/40",
      },
      status: "UNAVAILABLE",
      unavailableReason: "LEGACY_OR_MALFORMED_EVIDENCE",
    });
    expect(result).not.toHaveProperty("batch");
  });

  it("returns unavailable when governed evidence does not describe a delete", async () => {
    const state = await createDeletedArchiveState({
      modifyEvidence: (body) =>
        body.replace('"type":"DELETE"', '"type":"CHANGE"'),
    });
    const context = {
      client: createMockGitHubLiteClient(state),
      repositoryRef: session,
    };

    const result = await loadDeletedBatchArchive({
      client: context.client,
      repository: session,
      baseBranch: "main",
      batchId: "payment.daily-close",
    });

    expect(result).not.toBeNull();
    if (!result) return;

    expect(result).toEqual({
      sourceRequest: {
        locator: "40",
        number: 40,
        url: "https://github.com/always0ne/batch/pull/40",
      },
      status: "UNAVAILABLE",
      unavailableReason: "REQUEST_EVIDENCE_MISMATCH",
    });
    expect(result).not.toHaveProperty("batch");
  });

  it("returns unavailable when the deletion base definition is missing", async () => {
    const state = await createDeletedArchiveState({ omitDefinition: true });
    const context = {
      client: createMockGitHubLiteClient(state),
      repositoryRef: session,
    };

    const result = await loadDeletedBatchArchive({
      client: context.client,
      repository: session,
      baseBranch: "main",
      batchId: "payment.daily-close",
    });

    expect(result).not.toBeNull();
    if (!result) return;

    expect(result).toEqual({
      sourceRequest: {
        locator: "40",
        number: 40,
        url: "https://github.com/always0ne/batch/pull/40",
      },
      status: "UNAVAILABLE",
      unavailableReason: "BATCH_DEFINITION_NOT_FOUND",
    });
    expect(result).not.toHaveProperty("batch");
  });

  it("returns unavailable when the deletion base revision cannot be loaded", async () => {
    const state = await createDeletedArchiveState();
    delete state.branches["archive-base"];
    const context = {
      client: createMockGitHubLiteClient(state),
      repositoryRef: session,
    };

    const result = await loadDeletedBatchArchive({
      client: context.client,
      repository: session,
      baseBranch: "main",
      batchId: "payment.daily-close",
    });

    expect(result).not.toBeNull();
    if (!result) return;

    expect(result).toEqual({
      sourceRequest: {
        locator: "40",
        number: 40,
        url: "https://github.com/always0ne/batch/pull/40",
      },
      status: "UNAVAILABLE",
      unavailableReason: "BASE_REVISION_UNAVAILABLE",
    });
    expect(result).not.toHaveProperty("batch");
  });

  it("returns unavailable when the archived base definition is malformed", async () => {
    const malformedDefinition = "apiVersion: [\n";
    const state = await createDeletedArchiveState({
      definitionContent: malformedDefinition,
      evidenceDefinitionContent: malformedDefinition,
    });
    const context = {
      client: createMockGitHubLiteClient(state),
      repositoryRef: session,
    };

    const result = await loadDeletedBatchArchive({
      client: context.client,
      repository: session,
      baseBranch: "main",
      batchId: "payment.daily-close",
    });

    expect(result).not.toBeNull();
    if (!result) return;

    expect(result).toEqual({
      sourceRequest: {
        locator: "40",
        number: 40,
        url: "https://github.com/always0ne/batch/pull/40",
      },
      status: "UNAVAILABLE",
      unavailableReason: "BATCH_DEFINITION_MALFORMED",
    });
    expect(result).not.toHaveProperty("batch");
  });

  it("returns unavailable when the base definition digest differs from evidence", async () => {
    const state = await createDeletedArchiveState({
      definitionContent: `${serializeBatchDefinitionYaml({
        batchId: "payment.daily-close",
        criticality: "HIGH",
        domain: "payments",
        environment: "PROD",
        execution: {
          command: "echo changed batch",
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
      })}`,
    });
    const context = {
      client: createMockGitHubLiteClient(state),
      repositoryRef: session,
    };

    const result = await loadDeletedBatchArchive({
      client: context.client,
      repository: session,
      baseBranch: "main",
      batchId: "payment.daily-close",
    });

    expect(result).not.toBeNull();
    if (!result) return;

    expect(result).toEqual({
      sourceRequest: {
        locator: "40",
        number: 40,
        url: "https://github.com/always0ne/batch/pull/40",
      },
      status: "UNAVAILABLE",
      unavailableReason: "BATCH_DEFINITION_DIGEST_MISMATCH",
    });
    expect(result).not.toHaveProperty("batch");
  });

  it("returns unavailable when authoritative request verification fails", async () => {
    const state = await createDeletedArchiveState();
    state.repositoryPermissions = state.repositoryPermissions.filter(
      (permission) => permission.username !== "developer",
    );
    const context = {
      client: createMockGitHubLiteClient(state),
      repositoryRef: session,
    };

    const result = await loadDeletedBatchArchive({
      client: context.client,
      repository: session,
      baseBranch: "main",
      batchId: "payment.daily-close",
    });

    expect(result).not.toBeNull();
    if (!result) return;

    expect(result).toEqual({
      sourceRequest: {
        locator: "40",
        number: 40,
        url: "https://github.com/always0ne/batch/pull/40",
      },
      status: "UNAVAILABLE",
      unavailableReason: "REQUEST_EVIDENCE_UNVERIFIED",
    });
    expect(result).not.toHaveProperty("batch");
  });

  it("uses the newest merged delete request as the archive source", async () => {
    const state = await createDeletedArchiveState();
    const newestRequest = {
      ...state.pullRequests[0]!,
      body: "Legacy delete request body",
      head: "batchplane/delete/payment.daily-close-20260904000001-delete-2",
      number: 41,
      title: "Delete batch payment.daily-close",
      url: "https://github.com/always0ne/batch/pull/41",
    };

    state.pullRequests = [state.pullRequests[0]!, newestRequest];
    state.pullRequestFiles[41] = [];

    const context = {
      client: createMockGitHubLiteClient(state),
      repositoryRef: session,
    };

    const result = await loadDeletedBatchArchive({
      client: context.client,
      repository: session,
      baseBranch: "main",
      batchId: "payment.daily-close",
    });

    expect(result).not.toBeNull();
    if (!result) return;

    expect(result).toEqual({
      sourceRequest: {
        locator: "41",
        number: 41,
        url: "https://github.com/always0ne/batch/pull/41",
      },
      status: "UNAVAILABLE",
      unavailableReason: "LEGACY_OR_MALFORMED_EVIDENCE",
    });
  });
});
