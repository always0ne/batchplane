import { describe, expect, it, vi } from "vitest";

import type { GitHubLiteClient, GitHubWorkflowJob } from "./index.js";
import { getNativeScheduleWorkflowJobIdentity } from "./github-workflow.js";
import { inspectNativeScheduleExecution } from "./native-schedule-evidence.js";

const repository = { owner: "acme", repo: "batch" };
const workflowPath = ".github/workflows/payment.daily-close.yml";
const controlJobName = "Schedule [weekday-close]";
const businessJobName = "Run [weekday-close]";
const expectedOccurrence = {
  batchId: "payment.daily-close",
  requestDigest: `sha256:${"a".repeat(64)}`,
  requestId: `btr-schedule-${"b".repeat(64)}`,
  scheduleId: "weekday-close",
};
const identity = getNativeScheduleWorkflowJobIdentity({
  scheduleId: expectedOccurrence.scheduleId,
});

function gateLog({
  allowed,
  job,
  jobName,
  occurrence = expectedOccurrence,
  runAttempt,
  step,
  timestamp = "2026-01-02T03:04:02.000Z",
}: {
  allowed: boolean;
  job: string;
  jobName: string;
  occurrence?: Partial<typeof expectedOccurrence>;
  runAttempt: number;
  step: string;
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

function job({
  id,
  name,
  steps,
}: {
  id: number;
  name: string;
  steps: GitHubWorkflowJob["steps"];
}): GitHubWorkflowJob {
  return {
    conclusion: "success",
    id,
    name,
    status: "completed",
    steps,
  };
}

function controlJob(): GitHubWorkflowJob {
  return job({
    id: 201,
    name: controlJobName,
    steps: [
      {
        completedAt: "2026-01-02T03:04:03Z",
        conclusion: "success",
        name: "Verify approved native schedule evidence",
        number: 1,
        startedAt: "2026-01-02T03:04:01Z",
        status: "completed",
      },
    ],
  });
}

function businessJob({
  denied = false,
}: { denied?: boolean } = {}): GitHubWorkflowJob {
  return job({
    id: 202,
    name: businessJobName,
    steps: [
      {
        completedAt: "2026-01-02T03:04:04Z",
        conclusion: denied ? "failure" : "success",
        name: "Reverify approved native schedule evidence",
        number: 1,
        startedAt: "2026-01-02T03:04:03Z",
        status: "completed",
      },
      {
        completedAt: "2026-01-02T03:04:06Z",
        conclusion: "success",
        name: "Run batch",
        number: 2,
        startedAt: "2026-01-02T03:04:04Z",
        status: "completed",
      },
    ],
  });
}

function clientFor({
  attempt,
  jobs,
  repositoryId = "99",
  runConclusion = "success",
  controlAllowed = true,
  controlOccurrence = expectedOccurrence,
  entryOccurrence = expectedOccurrence,
}: {
  attempt: number;
  jobs: GitHubWorkflowJob[];
  repositoryId?: string;
  runConclusion?: "success" | "cancelled";
  controlAllowed?: boolean;
  controlOccurrence?: Partial<typeof expectedOccurrence>;
  entryOccurrence?: Partial<typeof expectedOccurrence>;
}) {
  const getWorkflowRun = vi.fn(async () => ({
    actor: "github-actions[bot]",
    conclusion: runConclusion,
    event: "schedule" as const,
    id: 100,
    name: "BatchPlane",
    runAttempt: attempt,
    repositoryId,
    status: "completed" as const,
    url: "https://example.test/runs/100",
    workflowId: 1,
    workflowPath,
  }));
  const getWorkflowJobLog = vi.fn(async ({ jobId }: { jobId: number }) => ({
    content:
      jobId === 201
        ? gateLog({
            allowed: controlAllowed,
            job: identity.controlJobId,
            jobName: controlJobName,
            occurrence: controlOccurrence,
            runAttempt: attempt,
            step: "Verify approved native schedule evidence",
          })
        : gateLog({
            allowed:
              jobs.find((candidate) => candidate.id === 202)?.steps?.[0]
                ?.conclusion !== "failure",
            job: identity.businessJobId,
            jobName: businessJobName,
            occurrence: entryOccurrence,
            runAttempt: attempt,
            step: "Reverify approved native schedule evidence",
            timestamp: "2026-01-02T03:04:03.500Z",
          }),
    jobId,
    sizeBytes: 1,
    truncated: false,
  }));
  return {
    client: {
      getWorkflowJobLog,
      getWorkflowRun,
      listWorkflowRunJobs: vi.fn(async () => jobs),
    } as unknown as GitHubLiteClient,
    getWorkflowRun,
  };
}

describe("native schedule execution evidence", () => {
  it("uses the exact API attempt and unique generated jobs for success", async () => {
    const { client, getWorkflowRun } = clientFor({
      attempt: 1,
      jobs: [controlJob(), businessJob()],
    });
    await expect(
      inspectNativeScheduleExecution({
        client,
        expectedOccurrence,
        expectedRepositoryId: "99",
        expectedWorkflowPath: workflowPath,
        repository,
        runAttempt: 1,
        runId: 100,
        schedule: { scheduleId: "weekday-close" },
      }),
    ).resolves.toMatchObject({
      businessJob: { jobId: 202, status: "completed" },
      controlJob: { jobId: 201, status: "completed" },
      observation: "SUCCEEDED",
    });
    expect(getWorkflowRun).toHaveBeenCalledWith({
      ...repository,
      runAttempt: 1,
      runId: 100,
    });
  });

  it("binds a business-only rerun DENY to its original occurrence attempt", async () => {
    const { client, getWorkflowRun } = clientFor({
      attempt: 2,
      jobs: [businessJob({ denied: true })],
    });
    await expect(
      inspectNativeScheduleExecution({
        client,
        expectedOccurrence,
        expectedRepositoryId: "99",
        expectedWorkflowPath: workflowPath,
        repository,
        runAttempt: 2,
        runId: 100,
        schedule: { scheduleId: "weekday-close" },
      }),
    ).resolves.toMatchObject({
      businessJob: { jobId: 202 },
      entryGate: { allowed: false },
      observation: "BLOCKED",
    });
    expect(getWorkflowRun).toHaveBeenCalledWith({
      ...repository,
      runAttempt: 2,
      runId: 100,
    });
  });

  it("proves a full rerun controller DENY without reusing its original request", async () => {
    const { client } = clientFor({
      attempt: 2,
      controlAllowed: false,
      controlOccurrence: {
        batchId: expectedOccurrence.batchId,
        scheduleId: expectedOccurrence.scheduleId,
      },
      jobs: [controlJob()],
    });

    const proof = await inspectNativeScheduleExecution({
      client,
      expectedOccurrence,
      expectedRepositoryId: "99",
      expectedWorkflowPath: workflowPath,
      repository,
      runAttempt: 2,
      runId: 100,
      schedule: { scheduleId: "weekday-close" },
    });

    expect(proof).toMatchObject({
      controlGate: {
        allowed: false,
        batchId: expectedOccurrence.batchId,
        scheduleId: expectedOccurrence.scheduleId,
      },
      observation: "BLOCKED",
    });
    expect(proof.controlGate).not.toHaveProperty("requestId");
    expect(proof.controlGate).not.toHaveProperty("requestDigest");
  });

  it("does not inherit another schedule's Gate evidence from the same Run", async () => {
    const otherOccurrence = {
      ...expectedOccurrence,
      requestDigest: `sha256:${"c".repeat(64)}`,
      requestId: `btr-schedule-${"d".repeat(64)}`,
      scheduleId: "ledger-close",
    };
    const { client } = clientFor({
      attempt: 1,
      controlOccurrence: otherOccurrence,
      entryOccurrence: otherOccurrence,
      jobs: [controlJob(), businessJob()],
    });

    await expect(
      inspectNativeScheduleExecution({
        client,
        expectedOccurrence,
        expectedRepositoryId: "99",
        expectedWorkflowPath: workflowPath,
        repository,
        runAttempt: 1,
        runId: 100,
        schedule: { scheduleId: "weekday-close" },
      }),
    ).resolves.toMatchObject({
      observation: "UNCONFIRMED",
      reason: "GATE_EVIDENCE_UNCONFIRMED",
    });
  });

  it("does not let whole-Run cancellation rewrite a successful exact batch step", async () => {
    const { client } = clientFor({
      attempt: 1,
      jobs: [controlJob(), businessJob()],
      runConclusion: "cancelled",
    });

    await expect(
      inspectNativeScheduleExecution({
        client,
        expectedOccurrence,
        expectedRepositoryId: "99",
        expectedWorkflowPath: workflowPath,
        repository,
        runAttempt: 1,
        runId: 100,
        schedule: { scheduleId: "weekday-close" },
      }),
    ).resolves.toMatchObject({ observation: "SUCCEEDED" });
  });

  it("leaves a mismatched actual repository unconfirmed", async () => {
    const { client } = clientFor({
      attempt: 1,
      jobs: [controlJob(), businessJob()],
      repositoryId: "other",
    });
    await expect(
      inspectNativeScheduleExecution({
        client,
        expectedOccurrence,
        expectedRepositoryId: "99",
        expectedWorkflowPath: workflowPath,
        repository,
        runAttempt: 1,
        runId: 100,
        schedule: { scheduleId: "weekday-close" },
      }),
    ).resolves.toMatchObject({
      observation: "UNCONFIRMED",
      reason: "RUN_CONTEXT_MISMATCH",
    });
  });
});
