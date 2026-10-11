import { readFileSync, writeFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createScheduledExecutionRequestId,
  serializeBatchDefinitionYaml,
  stringifyRepositoryYaml,
  type GitHubBatchDefinition,
} from "@batchplane/github-lite";

import { createNativeScheduledExecutionRequest, run } from "./index";

const sha = "a".repeat(40);
const batch: GitHubBatchDefinition = {
  batchId: "payment.daily-close",
  criticality: "HIGH",
  domain: "payments",
  environment: "PROD",
  execution: { command: "echo close payments", runsOn: "ubuntu-latest" },
  gateRequired: true,
  name: "Daily Close",
  owner: "ops-team",
  schedules: [
    {
      cron: "0 5 * * *",
      enabled: true,
      name: "Daily settlement window",
      scheduleId: "payment.daily-close-daily",
      timezone: "Asia/Seoul",
    },
  ],
  status: "ACTIVE",
  workflow: { path: ".github/workflows/payment.daily-close.yml", ref: "main" },
};
const batchYaml = stringifyRepositoryYaml({
  apiVersion: "batchplane.io/v1",
  kind: "BatchDefinition",
  metadata: { id: batch.batchId, name: batch.name },
  spec: {
    criticality: batch.criticality,
    domain: batch.domain,
    environment: batch.environment,
    execution: batch.execution,
    gateRequired: true,
    owner: batch.owner,
    schedules: batch.schedules!.map((schedule) => ({
      cron: schedule.cron,
      enabled: schedule.enabled,
      id: schedule.scheduleId,
      name: schedule.name,
      timezone: schedule.timezone,
    })),
    status: batch.status,
    workflow: batch.workflow,
  },
});
const approvedRevision = {
  governedChangeId: "GC-42",
  targetRevisionDigest: `sha256:${"b".repeat(64)}`,
};

function nativeInput(overrides: Record<string, unknown> = {}) {
  return {
    batchId: batch.batchId,
    configPath: ".batch-governance",
    cron: "0 5 * * *",
    definitionPath: ".batch-governance/batches/payment.daily-close.yml",
    eventName: "schedule",
    eventSchedule: "0 5 * * *",
    githubToken: "token",
    repository: "acme/batch",
    repositoryId: "99",
    scheduleId: "payment.daily-close-daily",
    sha,
    sourceRunAttempt: 1,
    sourceRunId: "100",
    timezone: "Asia/Seoul",
    verifyBatchRevision: async () => ({
      approvedRevision,
      controlStatus: "VERIFIED" as const,
      verifiedSha: sha,
    }),
    workflowPath: batch.workflow.path,
    workflowRef: batch.workflow.ref,
    ...overrides,
  };
}

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
  });
}

describe("schedule request Action", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("does not retain an external cron-parser import in the bundle", () => {
    const dist = readFileSync(
      new URL("../dist/index.js", import.meta.url),
      "utf8",
    );
    expect(dist).not.toMatch(/from\s+["']cron-parser["']/u);
  });

  it("records the initial occurrence with the selected schedule's exact inputs and approved source revision", async () => {
    const scheduledBatch: GitHubBatchDefinition = {
      ...batch,
      parameters: [
        {
          name: "Mode",
          required: true,
          sensitive: false,
          defaultValue: { value: " 001 " },
        },
        { name: "Note", required: true, sensitive: false },
        { name: "Optional", required: false, sensitive: false },
      ],
      schedules: [
        {
          ...batch.schedules![0]!,
          parameters: [
            { name: "Mode", source: "DEFAULT" },
            { name: "Note", source: "VALUE", value: { value: "" } },
            { name: "Optional", source: "OMIT" },
          ],
        },
        {
          ...batch.schedules![0]!,
          scheduleId: "other-schedule",
          parameters: [
            { name: "Mode", source: "VALUE", value: { value: "other" } },
            { name: "Note", source: "VALUE", value: { value: "other note" } },
          ],
        },
      ],
    };
    let requestBody = "";
    const fetcher: typeof fetch = async (url, init) => {
      const path = String(url);
      if (path.includes("/contents/")) {
        return json({
          content: Buffer.from(
            serializeBatchDefinitionYaml(scheduledBatch),
          ).toString("base64"),
          encoding: "base64",
          path: ".batch-governance/batches/payment.daily-close.yml",
        });
      }
      if (path.includes("/issues?state=all")) return json([]);
      if (path.endsWith("/labels")) return json({});
      if (path.endsWith("/issues") && init?.method === "POST") {
        requestBody = JSON.parse(String(init.body)).body;
        return json({ body: "", number: 77, title: "Scheduled run" });
      }
      throw new Error(`Unexpected request: ${path}`);
    };
    const result = await createNativeScheduledExecutionRequest({
      ...nativeInput(),
      fetcher,
    });
    expect(result).toMatchObject({ issueNumber: 77, status: "created" });
    expect(result.requestId).toMatch(/^btr-schedule-[0-9a-f]{64}$/u);
    const payload = JSON.parse(
      requestBody.match(/```json\n([\s\S]*?)\n```/u)![1]!,
    );
    expect(payload.spec).toMatchObject({
      parameterContractVersion: "PARAMETER_DELIVERY_V1",
      parameterSourceRevision: sha,
      parameters: {
        Mode: {
          value: " 001 ",
          source: { origin: { type: "BATCH_DEFAULT" }, revision: sha },
        },
        Note: {
          value: "",
          source: {
            origin: {
              type: "SCHEDULE_VALUE",
              scheduleId: "payment.daily-close-daily",
            },
            revision: sha,
          },
        },
        Optional: { source: { origin: { type: "OMIT" } } },
      },
    });
    expect(Object.keys(payload.spec.parameters)).toEqual([
      "Mode",
      "Note",
      "Optional",
    ]);
  });

  it("fails closed for a pre-seeded occurrence instead of returning a permit", async () => {
    const requestId = await createScheduledExecutionRequestId(
      batch.batchId,
      "payment.daily-close-daily",
      "99",
      "100",
    );
    const fetcher: typeof fetch = async (url) => {
      const path = String(url);
      if (path.includes("/contents/")) {
        return json({
          content: Buffer.from(batchYaml).toString("base64"),
          encoding: "base64",
          path: ".batch-governance/batches/payment.daily-close.yml",
        });
      }
      if (path.includes("/issues?state=all")) {
        return json([
          {
            body: `<!-- batchplane:execution-request\nrequestId=${requestId}\n-->`,
            number: 77,
          },
        ]);
      }
      throw new Error(`Unexpected request: ${path}`);
    };
    await expect(
      createNativeScheduledExecutionRequest({ ...nativeInput(), fetcher }),
    ).rejects.toThrow("NATIVE_SCHEDULE_OCCURRENCE_ALREADY_RECORDED");
  });

  it("denies a partial or full rerun and missing native attempt context", async () => {
    const fetcher: typeof fetch = async (url) => {
      const path = String(url);
      if (path.includes("/contents/")) {
        return json({
          content: Buffer.from(batchYaml).toString("base64"),
          encoding: "base64",
          path: ".batch-governance/batches/payment.daily-close.yml",
        });
      }
      if (path.includes("/issues?state=all")) return json([]);
      throw new Error(`Unexpected request: ${path}`);
    };
    await expect(
      createNativeScheduledExecutionRequest({
        ...nativeInput({ sourceRunAttempt: 2 }),
        fetcher,
      }),
    ).rejects.toThrow("RERUN_NOT_AUTHORIZED");
    await expect(
      createNativeScheduledExecutionRequest({
        ...nativeInput({ sourceRunAttempt: Number.NaN }),
        fetcher,
      }),
    ).rejects.toThrow("NATIVE_SCHEDULE_RUN_REQUIRED");
  });

  it("clears all permit outputs before a full rerun can inspect or reuse an occurrence", async () => {
    const eventPath = `/tmp/batchplane-schedule-event-${Date.now()}.json`;
    const outputPath = `/tmp/batchplane-schedule-request-output-${Date.now()}.txt`;
    writeFileSync(eventPath, JSON.stringify({ schedule: "0 5 * * *" }));
    vi.stubEnv("GITHUB_OUTPUT", outputPath);
    vi.stubGlobal("fetch", (async (url: string | URL) => {
      const path = String(url);
      if (path.includes("/contents/")) {
        return json({
          content: Buffer.from(batchYaml).toString("base64"),
          encoding: "base64",
          path: ".batch-governance/batches/payment.daily-close.yml",
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    }) as typeof fetch);

    await expect(
      run({
        GITHUB_EVENT_NAME: "schedule",
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_REPOSITORY: "acme/batch",
        GITHUB_REPOSITORY_ID: "99",
        GITHUB_RUN_ATTEMPT: "2",
        GITHUB_RUN_ID: "100",
        GITHUB_WORKFLOW_REF:
          "acme/batch/.github/workflows/payment.daily-close.yml@refs/heads/main",
        GITHUB_WORKFLOW_SHA: sha,
        "INPUT_BATCH-ID": batch.batchId,
        "INPUT_CONFIG-PATH": ".batch-governance",
        INPUT_CRON: "0 5 * * *",
        "INPUT_DEFINITION-PATH":
          ".batch-governance/batches/payment.daily-close.yml",
        "INPUT_GITHUB-TOKEN": "token",
        "INPUT_SCHEDULE-ID": "payment.daily-close-daily",
        INPUT_TIMEZONE: "Asia/Seoul",
      }),
    ).rejects.toThrow("RERUN_NOT_AUTHORIZED");

    expect(readFileSync(outputPath, "utf8")).toContain("request-id=\n");
    expect(readFileSync(outputPath, "utf8")).toContain("request-digest=\n");
    expect(readFileSync(outputPath, "utf8")).toContain("issue-number=\n");
    expect(readFileSync(outputPath, "utf8")).toContain(
      "failure-reason=RERUN_NOT_AUTHORIZED",
    );
  });
});
