// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  createGitHubLiteBatchPlaneClient,
  createMockGitHubLiteClient,
} from "@batchplane/github-lite";
import {
  createRuntimeFixtureMockState,
  prepareRuntimeFixtureClient,
} from "./runtime-fixtures";

describe("approved parameter runtime fixture", () => {
  it("provides approved parameters, protected defaults and independent schedule overrides offline", async () => {
    const client = createMockGitHubLiteClient(
      createRuntimeFixtureMockState("approved-parameters"),
    );
    await prepareRuntimeFixtureClient(client, "approved-parameters");
    const runtime = createGitHubLiteBatchPlaneClient({
      client,
      repositoryRef: { owner: "always0ne", repo: "batch" },
    });
    const changeDraft = await runtime.loadBatchChangeDraft({
      batchId: "payment.daily-close",
      mode: "change",
    });
    expect(changeDraft.sensitiveInputsAvailable).toBe(true);
    expect(changeDraft.parameters).toEqual([
      {
        name: "REPORT_SCOPE",
        required: true,
        sensitive: false,
        defaultValue: { kind: "VALUE", value: "payments\nsettlements" },
      },
      {
        name: "EMPTY_MARKER",
        required: false,
        sensitive: false,
        defaultValue: { kind: "VALUE", value: "" },
      },
      { name: "OPTIONAL_NOTE", required: false, sensitive: false },
      {
        name: "SERVICE_TOKEN",
        required: true,
        sensitive: true,
        defaultValue: { kind: "SAVED", reference: expect.any(String) },
      },
    ]);
    expect(changeDraft.schedules).toMatchObject([
      {
        scheduleId: "weekday-close",
        parameters: [
          {
            name: "REPORT_SCOPE",
            source: "VALUE",
            value: { kind: "VALUE", value: "weekday\nclose" },
          },
          { name: "EMPTY_MARKER", source: "DEFAULT" },
          { name: "OPTIONAL_NOTE", source: "OMIT" },
          { name: "SERVICE_TOKEN", source: "DEFAULT" },
        ],
      },
      {
        scheduleId: "weekend-close",
        parameters: [
          { name: "REPORT_SCOPE", source: "DEFAULT" },
          { name: "EMPTY_MARKER", source: "OMIT" },
          {
            name: "OPTIONAL_NOTE",
            source: "VALUE",
            value: { kind: "VALUE", value: "" },
          },
          {
            name: "SERVICE_TOKEN",
            source: "VALUE",
            value: { kind: "SAVED", reference: expect.any(String) },
          },
        ],
      },
    ]);
    expect(JSON.stringify(changeDraft)).not.toContain(
      "synthetic-default-token",
    );
    expect(JSON.stringify(changeDraft)).not.toContain(
      "synthetic-weekend-token",
    );
    await expect(runtime.inspectWorkspaceEncryption()).resolves.toMatchObject({
      configurationPublished: true,
      privateKeyStored: "PRESENT",
    });
    await expect(
      runtime.getBatchDetail({ batchId: "payment.daily-close" }),
    ).resolves.toMatchObject({
      type: "active",
      control: { status: "VERIFIED" },
      batch: { parameters: changeDraft.parameters },
    });
    const loaded = await runtime.loadExecutionRequestDraft({
      batchId: "payment.daily-close",
    });
    if (loaded.type !== "ready") throw new Error("Expected parameter draft");
    expect(loaded.draft).toMatchObject({
      sensitiveInputsAvailable: true,
      creationCapability: { canCreate: true },
      parameters: changeDraft.parameters,
    });
    const input = {
      draft: loaded.draft,
      expiresAt: new Date(
        Date.parse(loaded.draft.requestedAt) + 3_600_000,
      ).toISOString(),
      parameters: [
        { name: "REPORT_SCOPE", source: "DEFAULT" as const },
        { name: "EMPTY_MARKER", source: "DEFAULT" as const },
        { name: "OPTIONAL_NOTE", source: "OMIT" as const },
        { name: "SERVICE_TOKEN", source: "DEFAULT" as const },
      ],
      reason: "Offline parameter browser acceptance",
      targetRevision: "main",
    };
    const preview = await runtime.previewExecutionRequest(input);
    const created = await runtime.createExecutionRequest(input);
    expect(created.request.parameters).toEqual(preview.request.parameters);
    expect(created.request.parameters).toEqual([
      {
        name: "REPORT_SCOPE",
        sensitive: false,
        source: "DEFAULT",
        value: "payments\nsettlements",
      },
      { name: "EMPTY_MARKER", sensitive: false, source: "DEFAULT", value: "" },
      { name: "OPTIONAL_NOTE", sensitive: false, source: "OMIT" },
      { name: "SERVICE_TOKEN", sensitive: true, source: "DEFAULT" },
    ]);
    await runtime.listBatches();
    const detail = await runtime.getExecutionRequest({
      requestLocator: created.request.requestLocator,
    });
    expect(detail?.parameters).toEqual(created.request.parameters);
  });
});
