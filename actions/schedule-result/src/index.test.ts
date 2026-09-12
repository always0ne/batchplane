import { afterEach, describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  buildExecutionRequestIssue,
  type BatchDefinition,
} from "@batchplane/domain";
import {
  getNativeScheduleWorkflowJobIdentity,
  serializeBatchDefinitionYaml,
} from "@batchplane/github-lite";
import { parseExecutionGateResult } from "@batchplane/github-lite";

const sha = "a".repeat(40);
const batch: BatchDefinition = {
  batchId: "payment.daily-close",
  criticality: "HIGH",
  domain: "payments",
  environment: "production",
  execution: { command: "./close.sh", runsOn: "ubuntu-latest" },
  gateRequired: true,
  name: "Daily close",
  owner: "payments-platform",
  schedules: [
    {
      cron: "0 9 * * 1-5",
      enabled: true,
      name: "Daily close",
      scheduleId: "weekday-close",
      timezone: "Asia/Seoul",
    },
  ],
  status: "ACTIVE",
  workflow: { path: ".github/workflows/payment.daily-close.yml", ref: "main" },
};

async function createInput() {
  const identity = getNativeScheduleWorkflowJobIdentity({
    scheduleId: "weekday-close",
  });
  const issue = await buildExecutionRequestIssue({
    approvedBatchRevision: {
      governedChangeId: "GC-42",
      targetRevisionDigest: `sha256:${"b".repeat(64)}`,
    },
    batch,
    requestedAt: new Date("2026-01-02T03:04:05.000Z"),
    requestedBy: "github-actions[bot]",
    schedule: {
      definitionCommitSha: sha,
      definitionPath: ".batch-governance/batches/payment.daily-close.yml",
      repositoryId: "99",
      scheduleId: "weekday-close",
      sourceRunAttempt: 1,
      sourceRunId: "100",
    },
    triggerType: "SCHEDULE",
  });
  return {
    apiBaseUrl: "https://api.test",
    batchId: batch.batchId,
    businessJobId: identity.businessJobId,
    businessJobName: identity.businessJobName,
    businessResultHint: "success",
    controlJobId: identity.controlJobId,
    controlJobName: identity.controlJobName,
    controlResultHint: "success",
    definitionPath: ".batch-governance/batches/payment.daily-close.yml",
    eventName: "schedule",
    githubToken: "token",
    issueBody: issue.body,
    issueNumber: "10",
    repository: "acme/batch",
    repositoryId: "99",
    requestDigest: issue.request.requestDigest,
    requestId: issue.request.requestId,
    scheduleId: "weekday-close",
    sourceRunAttempt: 1,
    sourceRunId: "100",
    workflowPath: batch.workflow.path,
    workflowSha: sha,
  };
}

function gateLog({
  allowed,
  job,
  jobName,
  occurrence,
  step,
  runAttempt = 1,
  timestamp = "2026-01-02T03:04:02.000Z",
}: {
  allowed: boolean;
  job: string;
  jobName: string;
  occurrence: {
    batchId: string;
    requestDigest: string;
    requestId: string;
    scheduleId: string;
  };
  step: string;
  runAttempt?: number;
  timestamp?: string;
}): string {
  return `${timestamp} BATCHPLANE_GATE_RESULT ${JSON.stringify({
    gateJob: job,
    gateJobName: jobName,
    gateStep: step,
    ...occurrence,
    message: allowed ? "allowed" : "blocked",
    repository: "acme/batch",
    result: allowed ? "ALLOW" : "DENY",
    runAttempt,
    runId: "100",
    version: 1,
  })}`;
}

function gateOccurrence(input: Awaited<ReturnType<typeof createInput>>) {
  return {
    batchId: input.batchId,
    requestDigest: input.requestDigest,
    requestId: input.requestId,
    scheduleId: input.scheduleId,
  };
}

function createFetch(
  input: Awaited<ReturnType<typeof createInput>>,
  scenario:
    | "blocked"
    | "cancelled"
    | "failed"
    | "entry-blocked"
    | "success"
    | "unknown"
    | "with-other-schedule" = "success",
): typeof fetch {
  const control = {
    completed_at: "2026-01-02T03:04:03Z",
    conclusion: scenario === "blocked" ? "failure" : "success",
    id: 201,
    name: input.controlJobName,
    started_at: "2026-01-02T03:04:01Z",
    status: "completed",
    steps: [
      {
        completed_at: "2026-01-02T03:04:03Z",
        conclusion: scenario === "blocked" ? "failure" : "success",
        name: "Verify approved native schedule evidence",
        number: 1,
        started_at: "2026-01-02T03:04:01Z",
        status: "completed",
      },
    ],
  };
  const business = {
    completed_at: "2026-01-02T03:04:06Z",
    conclusion:
      scenario === "cancelled"
        ? "cancelled"
        : scenario === "failed"
          ? "failure"
          : "success",
    id: 202,
    name: input.businessJobName,
    started_at: "2026-01-02T03:04:03Z",
    status: "completed",
    steps: [
      {
        completed_at: "2026-01-02T03:04:04Z",
        conclusion: "success",
        name: "Reverify approved native schedule evidence",
        number: 1,
        started_at: "2026-01-02T03:04:03Z",
        status: "completed",
      },
      {
        completed_at: "2026-01-02T03:04:06Z",
        conclusion:
          scenario === "cancelled"
            ? "cancelled"
            : scenario === "failed"
              ? "failure"
              : scenario === "unknown"
                ? "skipped"
                : "success",
        name: "Run batch",
        number: 2,
        started_at: "2026-01-02T03:04:04Z",
        status: "completed",
      },
    ],
  };
  return vi.fn(async (url: string | URL, init?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith("/issues/10") && init?.method !== "POST") {
      return Response.json({
        body: input.issueBody,
        html_url: "https://example.test/issues/10",
        labels: [],
        number: 10,
        title: "Scheduled run",
        user: { login: "github-actions[bot]" },
      });
    }
    if (path.includes("/contents/")) {
      return Response.json({
        content: Buffer.from(serializeBatchDefinitionYaml(batch)).toString(
          "base64",
        ),
        encoding: "base64",
        path: input.definitionPath,
      });
    }
    if (
      path.endsWith("/actions/runs/100") ||
      /\/actions\/runs\/100\/attempts\/\d+$/u.test(path)
    ) {
      return Response.json({
        actor: { login: "github-actions[bot]" },
        conclusion:
          scenario === "cancelled"
            ? "cancelled"
            : scenario === "failed"
              ? "failure"
              : "success",
        event: "schedule",
        html_url: "https://example.test/runs/100",
        id: 100,
        name: "BatchPlane",
        path: input.workflowPath,
        repository: { id: 99 },
        run_attempt: input.sourceRunAttempt,
        status: "completed",
        workflow_id: 1,
      });
    }
    if (
      path.endsWith(`/actions/runs/100/attempts/${input.sourceRunAttempt}/jobs`)
    ) {
      return Response.json({
        jobs:
          scenario === "blocked"
            ? [control]
            : scenario === "entry-blocked"
              ? [business]
              : scenario === "with-other-schedule"
                ? [
                    control,
                    business,
                    {
                      ...business,
                      id: 203,
                      name: "Run Ledger close [ledger-close]",
                    },
                  ]
                : [control, business],
      });
    }
    if (path.endsWith("/actions/jobs/201/logs")) {
      return new Response(
        gateLog({
          allowed: scenario !== "blocked",
          job: input.controlJobId,
          jobName: input.controlJobName,
          occurrence: gateOccurrence(input),
          step: "Verify approved native schedule evidence",
          runAttempt: input.sourceRunAttempt,
        }),
      );
    }
    if (path.endsWith("/actions/jobs/202/logs")) {
      return new Response(
        gateLog({
          allowed: scenario !== "entry-blocked",
          job: input.businessJobId,
          jobName: input.businessJobName,
          occurrence: gateOccurrence(input),
          step: "Reverify approved native schedule evidence",
          runAttempt: input.sourceRunAttempt,
          timestamp: "2026-01-02T03:04:03.500Z",
        }),
      );
    }
    if (path.endsWith("/issues/10/comments") && init?.method === "POST") {
      return Response.json({
        body: "recorded",
        id: 900,
        user: { login: "github-actions[bot]" },
      });
    }
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
}

describe("schedule result Action", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is import-safe when GitHub Actions is set and records API-proven success", async () => {
    vi.stubEnv("GITHUB_ACTIONS", "true");
    const module = await import("./index.js");
    const input = await createInput();
    const fetcher = createFetch(input) as unknown as {
      mock: { calls: Array<[string | URL, RequestInit | undefined]> };
    };
    await expect(
      module.recordNativeScheduleResult({
        ...input,
        fetcher: fetcher as unknown as typeof fetch,
      }),
    ).resolves.toBe("SUCCEEDED");
    expect(
      fetcher.mock.calls.some(([url]) => String(url).includes("/git/ref/")),
    ).toBe(false);
  });

  it("runs the checked-in Node24 bundle only when invoked directly", () => {
    const bundle = fileURLToPath(new URL("../dist/index.js", import.meta.url));
    const direct = spawnSync(process.execPath, [bundle], {
      env: { GITHUB_ACTIONS: "true" },
      encoding: "utf8",
    });

    expect(direct.status).toBe(1);
    expect(`${direct.stdout}${direct.stderr}`).toContain(
      "NATIVE_SCHEDULE_RESULT_CONTEXT_REQUIRED",
    );
  });

  it("records a verified control Gate denial without requiring a business job", async () => {
    const { recordNativeScheduleResult } = await import("./index.js");
    const input = await createInput();
    expect(
      parseExecutionGateResult({
        content: gateLog({
          allowed: false,
          job: input.controlJobId,
          jobName: input.controlJobName,
          occurrence: gateOccurrence(input),
          step: "Verify approved native schedule evidence",
        }),
        expected: {
          gateJob: input.controlJobId,
          gateJobName: input.controlJobName,
          gateStep: {
            completedAt: "2026-01-02T03:04:03Z",
            name: "Verify approved native schedule evidence",
            startedAt: "2026-01-02T03:04:01Z",
          },
          repository: "acme/batch",
          runAttempt: 1,
          runId: 100,
        },
      }),
    ).toMatchObject({ allowed: false });
    await expect(
      recordNativeScheduleResult({
        ...input,
        fetcher: createFetch(input, "blocked"),
      }),
    ).resolves.toBe("BLOCKED");
  });

  it("records cancellation from the actual Actions job observation", async () => {
    const { recordNativeScheduleResult } = await import("./index.js");
    const input = await createInput();
    await expect(
      recordNativeScheduleResult({
        ...input,
        fetcher: createFetch(input, "cancelled"),
      }),
    ).resolves.toBe("CANCELED");
  });

  it("records actual batch-step failure and leaves skipped terminal evidence unconfirmed", async () => {
    const { recordNativeScheduleResult } = await import("./index.js");
    const input = await createInput();
    await expect(
      recordNativeScheduleResult({
        ...input,
        fetcher: createFetch(input, "failed"),
      }),
    ).resolves.toBe("FAILED");
    await expect(
      recordNativeScheduleResult({
        ...input,
        fetcher: createFetch(input, "unknown"),
      }),
    ).resolves.toBe("UNCONFIRMED");
  });

  it("uses only exact schedule-specific jobs when another schedule shares the Run", async () => {
    const { recordNativeScheduleResult } = await import("./index.js");
    const input = await createInput();
    await expect(
      recordNativeScheduleResult({
        ...input,
        fetcher: createFetch(input, "with-other-schedule"),
      }),
    ).resolves.toBe("SUCCEEDED");
  });

  it("rejects a pre-seeded Issue body and preserves an unacknowledged evidence write", async () => {
    const { recordNativeScheduleResult } = await import("./index.js");
    const input = await createInput();
    const forgedInput = {
      ...input,
      issueBody: input.issueBody.replace("payments-platform", "attacker"),
    };
    await expect(
      recordNativeScheduleResult({
        ...input,
        fetcher: createFetch(forgedInput),
      }),
    ).rejects.toThrow("NATIVE_SCHEDULE_REQUEST_UNVERIFIED");
    const normalFetch = createFetch(input);
    const writeUnacknowledged = vi.fn(
      async (url: string | URL, init?: RequestInit) => {
        if (
          new URL(String(url)).pathname.endsWith("/issues/10/comments") &&
          init?.method === "POST"
        ) {
          return Response.json({ id: 0 });
        }
        return normalFetch(url, init);
      },
    ) as unknown as typeof fetch;
    await expect(
      recordNativeScheduleResult({ ...input, fetcher: writeUnacknowledged }),
    ).rejects.toThrow("RESULT_EVIDENCE_WRITE_UNACKNOWLEDGED");
  });

  it("records a partial rerun denial against the original attempt-one occurrence", async () => {
    const { recordNativeScheduleResult } = await import("./index.js");
    const original = await createInput();
    const rerun = { ...original, sourceRunAttempt: 2 };
    const fetcher = createFetch(rerun, "entry-blocked") as unknown as {
      mock: { calls: Array<[string | URL, RequestInit | undefined]> };
    };
    await expect(
      recordNativeScheduleResult({
        ...rerun,
        fetcher: fetcher as unknown as typeof fetch,
      }),
    ).resolves.toBe("BLOCKED");
    const comment = fetcher.mock.calls.find(
      ([url, init]) =>
        new URL(String(url)).pathname.endsWith("/issues/10/comments") &&
        init?.method === "POST",
    );
    expect(JSON.parse(String(comment?.[1]?.body))).toMatchObject({
      body: expect.stringContaining("requestSourceRunAttempt=1"),
    });
    expect(JSON.parse(String(comment?.[1]?.body))).toMatchObject({
      body: expect.stringContaining("workflowRunAttempt=2"),
    });
    expect(JSON.parse(String(comment?.[1]?.body))).toMatchObject({
      body: expect.stringContaining("entryGateAllowed=false"),
    });
  });
});
