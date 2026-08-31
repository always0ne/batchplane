import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  buildExecutionRequestIssue,
  serializeYamlDocument,
  type BatchDefinition,
} from "@batchplane/domain";

import { createOrReuseScheduledExecutionRequest } from "./index";

const batchDefinition: BatchDefinition = {
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
  workflow: {
    path: ".github/workflows/payment.daily-close.yml",
    ref: "main",
  },
};

const batchYaml = serializeYamlDocument({
  apiVersion: "batchplane.io/v1",
  kind: "BatchDefinition",
  metadata: {
    id: batchDefinition.batchId,
    name: batchDefinition.name,
  },
  spec: {
    criticality: batchDefinition.criticality,
    domain: batchDefinition.domain,
    environment: batchDefinition.environment,
    execution: batchDefinition.execution,
    gateRequired: true,
    owner: batchDefinition.owner,
    schedules: [
      {
        cron: "0 5 * * *",
        enabled: true,
        id: "payment.daily-close-daily",
        name: "Daily settlement window",
        timezone: "Asia/Seoul",
      },
    ],
    status: batchDefinition.status,
    workflow: batchDefinition.workflow,
  },
});

describe("schedule request action", () => {
  it("ships a self-contained dist bundle for runtime dependencies", () => {
    const dist = readFileSync(
      new URL("../dist/index.js", import.meta.url),
      "utf-8",
    );

    expect(dist).toContain("cron-parser");
    expect(dist).not.toMatch(/from\s+["']cron-parser["']/u);
  });

  it("runs the bundled Action when Node invokes it as the direct entrypoint", () => {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("../dist/index.js", import.meta.url))],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          GITHUB_REPOSITORY: "invalid-repository",
        },
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "GITHUB_REPOSITORY must be in owner/repo format.",
    );
  });

  it("creates a new delegated scheduled request and approval comment", async () => {
    const calls: Array<{ method: string; url: string }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ method, url });

      if (
        url.includes(
          "/contents/.batch-governance/batches/payment.daily-close.yml",
        )
      ) {
        return jsonResponse({
          content: Buffer.from(batchYaml, "utf-8").toString("base64"),
          encoding: "base64",
          path: ".batch-governance/batches/payment.daily-close.yml",
        });
      }

      if (url.includes("/issues?state=all&per_page=100&page=1")) {
        return jsonResponse([]);
      }

      if (url.endsWith("/labels")) {
        return jsonResponse({});
      }

      if (url.endsWith("/issues")) {
        return jsonResponse({
          body: null,
          number: 77,
          state: "open",
          title: "Scheduled run payment.daily-close",
        });
      }

      if (url.endsWith("/issues/77/comments")) {
        return jsonResponse({ body: "ok", id: 88 });
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    };

    const result = await createOrReuseScheduledExecutionRequest({
      batchId: "payment.daily-close",
      configPath: ".batch-governance",
      cron: "0 5 * * *",
      definitionPath: ".batch-governance/batches/payment.daily-close.yml",
      fetcher,
      githubToken: "token",
      now: new Date("2026-06-02T05:01:00.000Z"),
      repository: "always0ne/batchplane",
      scheduleId: "payment.daily-close-daily",
      sha: "abc123",
      timezone: "Asia/Seoul",
    });

    expect(result.status).toBe("created");
    expect(result.issueNumber).toBe(77);
    expect(result.approvalCommentId).toBe(88);
    expect(result.scheduledAt).toBe("2026-06-01T20:00:00.000Z");
    expect(result.requestId).toBe(
      "btr-20260601200000-payment.daily-close-payment.daily-close-dail",
    );
    expect(calls.some((call) => call.url.endsWith("/issues"))).toBe(true);
  });

  it("reuses existing scheduled request approval when the occurrence already exists", async () => {
    const existingIssue = await buildExecutionRequestIssue({
      batch: batchDefinition,
      expiresAt: new Date("2026-06-03T05:01:00.000Z"),
      requestedAt: new Date("2026-06-02T05:01:00.000Z"),
      requestedBy: "github-actions[bot]",
      requestId:
        "btr-20260601200000-payment.daily-close-payment.daily-close-dail",
      schedule: {
        definitionCommitSha: "abc123",
        definitionPath: ".batch-governance/batches/payment.daily-close.yml",
        scheduleId: "payment.daily-close-daily",
        scheduledAt: "2026-06-01T20:00:00.000Z",
      },
      triggerType: "SCHEDULE",
      workflowRef: "main",
    });
    const approvalBody = [
      `/bgcp approve requestDigest=${existingIssue.request.requestDigest}`,
      "",
      "## BatchPlane Execution Approval",
      "",
      "- Decision: APPROVED",
      "- Approver: @github-actions[bot]",
      "- Approved at: 2026-06-02T05:01:30.000Z",
      "- Approval type: SCHEDULE_DELEGATED",
      `- Request ID: \`${existingIssue.request.requestId}\``,
      `- Batch ID: \`${existingIssue.request.batchId}\``,
      `- Request digest: \`${existingIssue.request.requestDigest}\``,
      "",
      "<!-- batchplane:execution-approval",
      "decision=APPROVED",
      `requestId=${existingIssue.request.requestId}`,
      `batchId=${existingIssue.request.batchId}`,
      `requestDigest=${existingIssue.request.requestDigest}`,
      "approvalType=SCHEDULE_DELEGATED",
      "-->",
    ].join("\n");

    const fetcher: typeof fetch = async (input) => {
      const url = String(input);

      if (
        url.includes(
          "/contents/.batch-governance/batches/payment.daily-close.yml",
        )
      ) {
        return jsonResponse({
          content: Buffer.from(batchYaml, "utf-8").toString("base64"),
          encoding: "base64",
          path: ".batch-governance/batches/payment.daily-close.yml",
        });
      }

      if (url.includes("/issues?state=all&per_page=100&page=1")) {
        return jsonResponse([
          {
            body: existingIssue.body,
            number: 77,
            state: "open",
            title: existingIssue.title,
          },
        ]);
      }

      if (url.includes("/issues/77/comments?per_page=100&page=1")) {
        return jsonResponse([
          {
            body: approvalBody,
            created_at: "2026-06-02T05:01:30.000Z",
            id: 88,
            user: { login: "github-actions[bot]" },
          },
        ]);
      }

      if (url.includes("/issues/77/comments?per_page=100&page=2")) {
        return jsonResponse([]);
      }

      throw new Error(`Unexpected request: ${url}`);
    };

    const result = await createOrReuseScheduledExecutionRequest({
      batchId: "payment.daily-close",
      configPath: ".batch-governance",
      cron: "0 5 * * *",
      definitionPath: ".batch-governance/batches/payment.daily-close.yml",
      fetcher,
      githubToken: "token",
      now: new Date("2026-06-02T05:01:00.000Z"),
      repository: "always0ne/batchplane",
      scheduleId: "payment.daily-close-daily",
      sha: "abc123",
      timezone: "Asia/Seoul",
    });

    expect(result.status).toBe("reused");
    expect(result.issueNumber).toBe(77);
    expect(result.approvalCommentId).toBe(88);
    expect(result.requestDigest).toBe(existingIssue.request.requestDigest);
  });

  it("does not redispatch when the occurrence is already dispatching or dispatched", async () => {
    const existingIssue = await buildExecutionRequestIssue({
      batch: batchDefinition,
      expiresAt: new Date("2026-06-03T05:01:00.000Z"),
      requestedAt: new Date("2026-06-02T05:01:00.000Z"),
      requestedBy: "github-actions[bot]",
      requestId:
        "btr-20260601200000-payment.daily-close-payment.daily-close-dail",
      schedule: {
        definitionCommitSha: "abc123",
        definitionPath: ".batch-governance/batches/payment.daily-close.yml",
        scheduleId: "payment.daily-close-daily",
        scheduledAt: "2026-06-01T20:00:00.000Z",
      },
      triggerType: "SCHEDULE",
      workflowRef: "main",
    });
    const dispatchBody = [
      "## BatchPlane Dispatcher",
      "",
      "- Status: DISPATCHED",
      `- Request ID: \`${existingIssue.request.requestId}\``,
      `- Batch ID: \`${existingIssue.request.batchId}\``,
      `- Request digest: \`${existingIssue.request.requestDigest}\``,
      "",
      "<!-- batchplane:bgcp:dispatcher",
      "status=DISPATCHED",
      `requestId=${existingIssue.request.requestId}`,
      `batchId=${existingIssue.request.batchId}`,
      `requestDigest=${existingIssue.request.requestDigest}`,
      "-->",
    ].join("\n");

    const fetcher: typeof fetch = async (input) => {
      const url = String(input);

      if (
        url.includes(
          "/contents/.batch-governance/batches/payment.daily-close.yml",
        )
      ) {
        return jsonResponse({
          content: Buffer.from(batchYaml, "utf-8").toString("base64"),
          encoding: "base64",
          path: ".batch-governance/batches/payment.daily-close.yml",
        });
      }

      if (url.includes("/issues?state=all&per_page=100&page=1")) {
        return jsonResponse([
          {
            body: existingIssue.body,
            number: 77,
            state: "open",
            title: existingIssue.title,
          },
        ]);
      }

      if (url.includes("/issues/77/comments?per_page=100&page=1")) {
        return jsonResponse([
          {
            body: dispatchBody,
            created_at: "2026-06-02T05:02:00.000Z",
            id: 89,
            user: { login: "github-actions[bot]" },
          },
        ]);
      }

      if (url.includes("/issues/77/comments?per_page=100&page=2")) {
        return jsonResponse([]);
      }

      throw new Error(`Unexpected request: ${url}`);
    };

    const result = await createOrReuseScheduledExecutionRequest({
      batchId: "payment.daily-close",
      configPath: ".batch-governance",
      cron: "0 5 * * *",
      definitionPath: ".batch-governance/batches/payment.daily-close.yml",
      fetcher,
      githubToken: "token",
      now: new Date("2026-06-02T05:01:00.000Z"),
      repository: "always0ne/batchplane",
      scheduleId: "payment.daily-close-daily",
      sha: "abc123",
      timezone: "Asia/Seoul",
    });

    expect(result.status).toBe("already-dispatched");
    expect(result.issueNumber).toBe(77);
    expect(result.approvalCommentId).toBeUndefined();
    expect(result.requestDigest).toBe(existingIssue.request.requestDigest);
  });
});

function jsonResponse(value: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
    status: 200,
    ...init,
  });
}
