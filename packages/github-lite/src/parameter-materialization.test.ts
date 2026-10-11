import { beforeAll, describe, expect, it } from "vitest";
import type {
  BatchParameterDefinition,
  ParameterSelection,
} from "@batchplane/domain";
import { createRequestDigest, type CanonicalValue } from "@batchplane/digest";
import {
  parseBatchDefinitionYaml,
  serializeBatchDefinitionYaml,
} from "./batch-definition-codec.js";
import {
  buildExecutionRequestIssue,
  createExecutionRequestDigest,
  type ExecutionRequestPayload,
} from "./execution-request-evidence.js";
import type { GitHubBatchDefinition } from "./github-batch-definition.js";
import {
  decryptParameterValue,
  generateParameterEncryptionKey,
} from "./parameter-encryption.js";
import {
  materializeBatchParameters,
  materializeRequestParameters,
  resolveScheduledParameters,
  validateApprovedParameters,
} from "./parameter-materialization.js";
import {
  projectParameterSummaries,
  savedParameterReference,
  toNeutralParameterDefinitions,
  toNeutralSchedules,
  type GitHubCanonicalParameters,
} from "./parameter-storage.js";
import { validateBatchDefinitionFile } from "./repository-schema.js";
import { verifyNativeScheduleRequestIssue } from "./native-schedule-evidence.js";
import { parseExecutionRequestDetail } from "./execution-approval-legacy.js";

const scope = {
  repositoryId: "42",
  batchId: "daily-close",
  sourceRevision: "approved-merge-sha",
};
const baseBatch: GitHubBatchDefinition = {
  batchId: scope.batchId,
  name: "Daily Close",
  owner: "ops",
  domain: "payments",
  environment: "PROD",
  criticality: "HIGH",
  status: "ACTIVE",
  gateRequired: true,
  workflow: { path: ".github/workflows/daily-close.yml", ref: "main" },
  execution: { command: "echo close", runsOn: "ubuntu-latest" },
};
const originalSecret = {
  sensitive: true as const,
  encrypted: {
    version: 1 as const,
    keyId: "saved-key",
    jwe: "original-approved-ciphertext",
  },
};
const savedBatch: GitHubBatchDefinition = {
  ...baseBatch,
  parameters: [
    {
      name: "TOKEN",
      required: true,
      sensitive: true,
      defaultValue: originalSecret,
    },
    {
      name: "DATE",
      required: true,
      sensitive: false,
      defaultValue: { value: "" },
    },
    { name: "OPTIONAL", required: false, sensitive: false },
  ],
  schedules: [
    {
      scheduleId: "morning",
      name: "Morning",
      cron: "0 9 * * *",
      timezone: "UTC",
      enabled: true,
    },
    {
      scheduleId: "evening",
      name: "Evening",
      cron: "0 18 * * *",
      timezone: "UTC",
      enabled: true,
      parameters: [
        {
          name: "DATE",
          source: "VALUE",
          value: { value: "  evening\n\uD55C\uAE00  " },
        },
      ],
    },
  ],
};

async function requestWith(
  batch: GitHubBatchDefinition,
  parameters: ParameterSelection[],
) {
  return buildExecutionRequestIssue({
    approvedBatchRevision: {
      governedChangeId: "bgc-approved",
      targetRevisionDigest: "sha256:approved",
    },
    batch,
    parameters,
    parameterSourceRevision: scope.sourceRevision,
    repositoryId: scope.repositoryId,
    requestId: "request-1",
    requestedAt: new Date("2026-10-11T01:00:00Z"),
    expiresAt: new Date("2026-10-11T02:00:00Z"),
    requestedBy: "ops",
  });
}

describe("approved parameter storage and materialization", () => {
  let key: Awaited<ReturnType<typeof generateParameterEncryptionKey>>;
  beforeAll(async () => {
    key = await generateParameterEncryptionKey();
  });

  it("round-trips exact defaults and per-schedule inputs, encrypting each sensitive value for its origin", async () => {
    const exact = " \n\uD55C\uAE00\r\n";
    const definitions: BatchParameterDefinition[] = [
      {
        name: "EMPTY",
        required: true,
        sensitive: false,
        defaultValue: { kind: "VALUE", value: "" },
      },
      {
        name: "TOKEN",
        required: true,
        sensitive: true,
        defaultValue: { kind: "VALUE", value: exact },
      },
    ];
    const schedules = [
      {
        ...savedBatch.schedules![0]!,
        parameters: [
          {
            name: "TOKEN",
            source: "VALUE" as const,
            value: { kind: "VALUE" as const, value: "" },
          },
        ],
      },
    ];
    const stored = await materializeBatchParameters(definitions, schedules, {
      ...scope,
      configuration: key.configuration,
    });
    const batch = parseBatchDefinitionYaml(
      serializeBatchDefinitionYaml({ ...baseBatch, ...stored }),
    );
    expect(batch.parameters?.[0]?.defaultValue).toEqual({ value: "" });
    const defaults = batch.parameters?.[1]?.defaultValue;
    const override = batch.schedules?.[0]?.parameters?.[0];
    if (
      !defaults?.sensitive ||
      override?.source !== "VALUE" ||
      !override.value.sensitive
    )
      throw new Error("Test requires encrypted inputs");
    await expect(
      decryptParameterValue(defaults, key.privateKey, key.configuration, {
        repositoryId: scope.repositoryId,
        batchId: scope.batchId,
        parameterName: "TOKEN",
        origin: { type: "BATCH_DEFAULT" },
      }),
    ).resolves.toBe(exact);
    await expect(
      decryptParameterValue(override.value, key.privateKey, key.configuration, {
        repositoryId: scope.repositoryId,
        batchId: scope.batchId,
        parameterName: "TOKEN",
        origin: { type: "SCHEDULE_VALUE", scheduleId: "morning" },
      }),
    ).resolves.toBe("");
    const neutral = toNeutralParameterDefinitions(batch, scope);
    expect(neutral?.[1]?.defaultValue?.kind).toBe("SAVED");
    expect(JSON.stringify(neutral)).not.toContain(defaults.encrypted.jwe);
    expect(
      toNeutralSchedules(batch, scope)?.[0]?.parameters?.[0],
    ).toMatchObject({ value: { kind: "SAVED" } });
  });

  it("reuses only the approved immutable saved value and rejects changed scope, sensitivity and caller ciphertext", async () => {
    const definitions = toNeutralParameterDefinitions(savedBatch, scope)!;
    const context = { ...scope, approvedSource: savedBatch };
    const result = await materializeBatchParameters(
      definitions,
      toNeutralSchedules(savedBatch, scope)!,
      context,
    );
    expect(result.parameters?.[0]?.defaultValue).toEqual(originalSecret);
    expect(result.parameters?.[0]?.defaultValue).not.toBe(originalSecret);
    for (const mismatch of [
      { repositoryId: "other-repository" },
      { batchId: "other-batch" },
      { sourceRevision: "other-revision" },
    ]) {
      await expect(
        materializeBatchParameters(definitions, [], {
          ...context,
          ...mismatch,
        }),
      ).rejects.toThrow("PARAMETER_SAVED_REFERENCE_INVALID");
    }
    await expect(
      materializeBatchParameters(
        [{ ...definitions[0]!, sensitive: false }],
        [],
        context,
      ),
    ).rejects.toThrow("PARAMETER_SENSITIVITY_MISMATCH");
    const forged = {
      ...definitions[0]!,
      defaultValue: {
        kind: "SAVED" as const,
        reference: savedParameterReference(scope, "TOKEN", {
          type: "BATCH_DEFAULT",
        }),
        encrypted: { ...originalSecret.encrypted, jwe: "forged" },
      },
    };
    await expect(
      materializeBatchParameters([forged], [], context),
    ).rejects.toThrow("PARAMETER_SAVED_REFERENCE_INVALID");
    await expect(
      materializeBatchParameters(
        [{ ...definitions[0]!, name: "OTHER" }],
        [],
        context,
      ),
    ).rejects.toThrow("PARAMETER_SAVED_REFERENCE_INVALID");
  });

  it("keeps required empty values present and optional default, explicit empty and omit distinct", async () => {
    const batch: GitHubBatchDefinition = {
      ...baseBatch,
      parameters: [
        { name: "REQUIRED", required: true, sensitive: false },
        {
          name: "OPTIONAL",
          required: false,
          sensitive: false,
          defaultValue: { value: "fallback" },
        },
      ],
    };
    const required: ParameterSelection = {
      name: "REQUIRED",
      source: "VALUE",
      value: { kind: "VALUE", value: "" },
    };
    const baseline = { name: "OPTIONAL", source: "DEFAULT" as const };
    const omitted = await requestWith(batch, [
      required,
      { name: "OPTIONAL", source: "OMIT" },
    ]);
    expect(
      validateApprovedParameters(omitted.payload, batch, scope.sourceRevision),
    ).toEqual({
      REQUIRED: {
        value: "",
        source: { origin: { type: "REQUEST_VALUE", requestId: "request-1" } },
      },
    });
    expect(omitted.payload.spec.parameters?.OPTIONAL).toEqual({
      sensitive: false,
      source: { origin: { type: "OMIT" } },
    });
    const inherited = await requestWith(batch, [required, baseline]);
    const empty = await requestWith(batch, [
      required,
      {
        name: "OPTIONAL",
        source: "VALUE",
        value: { kind: "VALUE", value: "" },
      },
    ]);
    expect(inherited.payload.spec.parameters?.OPTIONAL).toMatchObject({
      value: "fallback",
      source: {
        origin: { type: "BATCH_DEFAULT" },
        revision: scope.sourceRevision,
      },
    });
    expect(empty.payload.spec.parameters?.OPTIONAL).toMatchObject({
      value: "",
      source: { origin: { type: "REQUEST_VALUE" } },
    });
    await expect(requestWith(batch, [baseline])).rejects.toThrow(
      "PARAMETER_SELECTION_REQUIRED",
    );
    await expect(
      requestWith(batch, [{ name: "REQUIRED", source: "OMIT" }, baseline]),
    ).rejects.toThrow("PARAMETER_REQUIRED");
    const allOptional = {
      ...batch,
      parameters: batch.parameters!.map((definition) => ({
        ...definition,
        required: false,
      })),
    };
    const allOmitted = await requestWith(
      allOptional,
      allOptional.parameters.map((definition) => ({
        name: definition.name,
        source: "OMIT",
      })),
    );
    expect(Object.keys(allOmitted.payload.spec.parameters!)).toEqual([
      "REQUIRED",
      "OPTIONAL",
    ]);
    expect(
      validateApprovedParameters(
        allOmitted.payload,
        allOptional,
        scope.sourceRevision,
      ),
    ).toEqual({});
  });

  it("freezes default ciphertext and revision in the existing digest and rejects definition, ciphertext and source tampering", async () => {
    const issue = await requestWith(savedBatch, [
      { name: "TOKEN", source: "DEFAULT" },
      { name: "DATE", source: "DEFAULT" },
      { name: "OPTIONAL", source: "OMIT" },
    ]);
    const frozen = structuredClone(issue.payload);
    const verified = validateApprovedParameters(
      issue.payload,
      savedBatch,
      scope.sourceRevision,
    );
    expect(verified.TOKEN).toMatchObject({
      ...originalSecret,
      source: {
        origin: { type: "BATCH_DEFAULT" },
        revision: scope.sourceRevision,
      },
    });
    const mutations: Array<(payload: ExecutionRequestPayload) => void> = [
      (payload) => {
        (payload.spec.parameters as GitHubCanonicalParameters).TOKEN = {
          sensitive: true,
          encrypted: { ...originalSecret.encrypted, jwe: "changed" },
          source: {
            origin: { type: "BATCH_DEFAULT" },
            revision: scope.sourceRevision,
          },
        };
      },
      (payload) => {
        (payload.spec.parameters as GitHubCanonicalParameters).TOKEN = {
          ...originalSecret,
          source: {
            origin: { type: "BATCH_DEFAULT" },
            revision: "changed-revision",
          },
        };
      },
      (payload) => {
        payload.spec.parameterSourceRevision = "changed-revision";
      },
      (payload) => {
        payload.metadata.batchId = "other-batch";
      },
      (payload) => {
        delete payload.spec.parameters!.TOKEN;
      },
    ];
    for (const mutate of mutations) {
      const tampered = structuredClone(frozen);
      mutate(tampered);
      expect(() =>
        validateApprovedParameters(tampered, savedBatch, scope.sourceRevision),
      ).toThrow(/PARAMETER_/u);
      expect(await createExecutionRequestDigest(tampered)).not.toBe(
        issue.request.requestDigest,
      );
    }
    const later = structuredClone(savedBatch);
    later.parameters![0]!.defaultValue = {
      ...originalSecret,
      encrypted: { ...originalSecret.encrypted, jwe: "later-default" },
    };
    expect(() =>
      validateApprovedParameters(frozen, later, scope.sourceRevision),
    ).toThrow("PARAMETER_DEFAULT_SOURCE_MISMATCH");
    expect(issue.payload).toEqual(frozen);
    const lineBatch: GitHubBatchDefinition = {
      ...baseBatch,
      parameters: [
        {
          name: "TEXT",
          required: true,
          sensitive: false,
          defaultValue: { value: "a\r\nb" },
        },
      ],
    };
    const lineIssue = await requestWith(lineBatch, [
      { name: "TEXT", source: "DEFAULT" },
    ]);
    const changedLine = structuredClone(lineIssue.payload);
    (changedLine.spec.parameters!.TEXT as { value: string }).value = "a\nb";
    expect(() =>
      validateApprovedParameters(changedLine, lineBatch, scope.sourceRevision),
    ).toThrow("PARAMETER_DEFAULT_SOURCE_MISMATCH");
    const changedSensitivity = structuredClone(savedBatch);
    changedSensitivity.parameters![0]!.sensitive = false;
    expect(() =>
      validateApprovedParameters(
        frozen,
        changedSensitivity,
        scope.sourceRevision,
      ),
    ).toThrow("PARAMETER_SENSITIVITY_MISMATCH");
    expect(projectParameterSummaries(issue.payload.spec.parameters)).toEqual([
      { name: "TOKEN", sensitive: true, source: "DEFAULT" },
      { name: "DATE", sensitive: false, source: "DEFAULT", value: "" },
      { name: "OPTIONAL", sensitive: false, source: "OMIT" },
    ]);
  });

  it("resolves each native schedule from its approved snapshot without decrypting or using the workflow SHA as the value source", async () => {
    const morning = resolveScheduledParameters(
      savedBatch,
      "morning",
      scope.sourceRevision,
    );
    const evening = resolveScheduledParameters(
      savedBatch,
      "evening",
      scope.sourceRevision,
    );
    expect(morning.DATE).toMatchObject({
      value: "",
      source: {
        origin: { type: "BATCH_DEFAULT" },
        revision: scope.sourceRevision,
      },
    });
    expect(evening.DATE).toMatchObject({
      value: "  evening\n\uD55C\uAE00  ",
      source: {
        origin: { type: "SCHEDULE_VALUE", scheduleId: "evening" },
        revision: scope.sourceRevision,
      },
    });
    const issue = await buildExecutionRequestIssue({
      approvedBatchRevision: {
        governedChangeId: "bgc-approved",
        targetRevisionDigest: "sha256:approved",
      },
      batch: savedBatch,
      parameterPayload: evening,
      parameterSourceRevision: scope.sourceRevision,
      requestedAt: new Date("2026-10-11T01:00:00Z"),
      requestedBy: "scheduler",
      triggerType: "SCHEDULE",
      schedule: {
        scheduleId: "evening",
        definitionPath: ".batch-governance/batches/daily-close.yml",
        definitionCommitSha: "different-workflow-sha",
        repositoryId: scope.repositoryId,
        sourceRunId: "100",
        sourceRunAttempt: 1,
      },
    });
    expect(
      validateApprovedParameters(
        issue.payload,
        savedBatch,
        scope.sourceRevision,
      ).DATE,
    ).toEqual(evening.DATE);
    const expected = {
      approvedBatchRevision: issue.payload.spec.approvedBatchRevision,
      batch: savedBatch,
      occurrence: issue.payload.spec.schedule!,
      requestDigest: issue.request.requestDigest,
      requestId: issue.request.requestId,
      parameterSourceRevision: scope.sourceRevision,
    };
    await expect(
      verifyNativeScheduleRequestIssue(issue.body, expected),
    ).resolves.toMatchObject({ requestDigest: issue.request.requestDigest });
    await expect(
      verifyNativeScheduleRequestIssue(issue.body, {
        ...expected,
        parameterSourceRevision: "different-workflow-sha",
      }),
    ).resolves.toBeNull();
    const swapped = structuredClone(issue.payload);
    swapped.spec.parameters = morning;
    expect(() =>
      validateApprovedParameters(swapped, savedBatch, scope.sourceRevision),
    ).toThrow("PARAMETER_SCHEDULE_SOURCE_MISMATCH");
    expect(() =>
      resolveScheduledParameters(savedBatch, "unknown", scope.sourceRevision),
    ).toThrow("PARAMETER_SCHEDULE_UNKNOWN");
  });

  it("rejects invalid exact names, case collisions, NUL, unknown values and hash-only execution while retaining protected history display", async () => {
    for (const names of [[" BAD"], ["BAD-NAME"], ["date", "DATE"]]) {
      await expect(
        materializeBatchParameters(
          names.map((name) => ({ name, required: false, sensitive: false })),
          [],
          scope,
        ),
      ).rejects.toThrow(/PARAMETER_NAME_/u);
    }
    const batch = {
      ...baseBatch,
      parameters: [{ name: "INPUT", required: false, sensitive: false }],
    };
    await expect(
      materializeRequestParameters(
        batch,
        [
          {
            name: "INPUT",
            source: "VALUE",
            value: { kind: "VALUE", value: "\0" },
          },
        ],
        "request-1",
        scope,
      ),
    ).rejects.toThrow("PARAMETER_NUL_UNSUPPORTED");
    await expect(
      requestWith(batch, [{ name: "UNKNOWN", source: "OMIT" }]),
    ).rejects.toThrow("PARAMETER_NAME_UNKNOWN");
    const issue = await requestWith(baseBatch, []);
    expect(issue.payload.spec.parameters).toBeUndefined();
    expect(issue.payload.spec.parameterContractVersion).toBeUndefined();
    expect(validateApprovedParameters(issue.payload, baseBatch, "")).toEqual(
      {},
    );
    const originalPayload = JSON.stringify(issue.payload, null, 2);
    issue.payload.spec.parameters = {
      TOKEN: { sensitive: true, valueDigest: "sha256:historical" },
    };
    expect(() =>
      validateApprovedParameters(
        issue.payload,
        baseBatch,
        scope.sourceRevision,
      ),
    ).toThrow("PARAMETER_CONTRACT_INVALID");
    expect(projectParameterSummaries(issue.payload.spec.parameters)).toEqual([
      { name: "TOKEN", sensitive: true, source: "VALUE" },
    ]);
    const historicalDigest = await createRequestDigest(
      issue.payload as unknown as CanonicalValue,
    );
    const historicalBody = issue.body
      .replace(originalPayload, JSON.stringify(issue.payload, null, 2))
      .replaceAll(issue.request.requestDigest, historicalDigest);
    const historical = parseExecutionRequestDetail(
      {
        author: "ops",
        body: historicalBody,
        isPullRequest: false,
        labels: [],
        number: 1,
        state: "closed",
        title: "Historical request",
        url: "https://example.test/issues/1",
      },
      [],
    );
    expect(historical?.canonicalPayload?.spec.parameters).toEqual(
      issue.payload.spec.parameters,
    );
    const invalidFile = {
      apiVersion: "batchplane.io/v1",
      kind: "BatchDefinition",
      metadata: { id: "daily-close", name: "Daily" },
      spec: {
        ...baseBatch,
        parameters: [
          {
            name: "TOKEN",
            required: true,
            sensitive: true,
            defaultValue: { value: "must-not-appear-in-diagnostics" },
          },
        ],
      },
    };
    expect(validateBatchDefinitionFile(invalidFile)).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: "PARAMETER_SENSITIVITY_MISMATCH",
          field: "spec.parameters",
          message: "PARAMETER_SENSITIVITY_MISMATCH",
        },
      ],
    });
    expect(
      JSON.stringify(validateBatchDefinitionFile(invalidFile)),
    ).not.toContain("must-not-appear-in-diagnostics");
  });
});
