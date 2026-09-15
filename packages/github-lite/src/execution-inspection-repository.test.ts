import { describe, expect, it } from "vitest";
import { createGitHubLiteMockState } from "./mock-state.js";
import { createMockGitHubLiteClient } from "./mock-client.js";
import { createGitHubLiteClient } from "./github-client.js";
const session = { owner: "always0ne", repo: "batch" };
import { createGitHubLiteAuditClient } from "./execution-audit-client.js";
import { createGitHubLiteExecutionRunClient } from "./execution-run-client.js";
import { createGitHubLiteExecutionLogClient } from "./execution-log-client.js";
describe("GitHub execution inspection and evidence", () => {
  it("builds an audit timeline from GitHub Issues, PRs, and workflow runs", async () => {
    const client = createMockGitHubLiteClient(createGitHubLiteMockState());
    const context = { client: client, repositoryRef: session };
    const auditClient = createGitHubLiteAuditClient(context);

    const items = await auditClient.listAuditTimeline({ limit: 100 });

    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceUrl: "https://github.com/always0ne/batch/pull/12",
          subjectType: "BATCH",
          type: "BATCH_CHANGED",
        }),
        expect.objectContaining({
          metadata: expect.objectContaining({
            batchId: "payment.daily-close",
            requestId: "btr-20260514010100-payment.daily-close-00000001",
          }),
          sourceUrl: "https://github.com/always0ne/batch/issues/101",
          type: "EXECUTION_REQUESTED",
        }),
        expect.objectContaining({
          sourceUrl: "https://github.com/always0ne/batch/actions/runs/204",
          subjectType: "EXECUTION_RUN",
          type: "RUN_COMPLETED",
        }),
      ]),
    );
  });

  it("maps workflow run detail with request and Gate evidence", async () => {
    const fetcher: typeof fetch = async (input) => {
      const url = input.toString();

      if (url.endsWith("/actions/runs/200")) {
        return Response.json({
          id: 200,
          workflow_id: 101,
          name: "BatchPlane - Daily Close",
          display_title:
            "BatchPlane payment.daily-close btr-20260514010400-payment-daily-close-abc12345",
          status: "completed",
          conclusion: "failure",
          html_url: "https://github.com/always0ne/batch/actions/runs/200",
          event: "workflow_dispatch",
          actor: { login: "github-actions[bot]" },
          run_attempt: 2,
          run_started_at: "2026-05-14T01:07:00.000Z",
          updated_at: "2026-05-14T01:08:00.000Z",
          path: ".github/workflows/payment.daily-close.yml",
        });
      }

      if (url.endsWith("/actions/runs/200/attempts/2/jobs")) {
        return Response.json({
          jobs: [
            {
              id: 300,
              name: "BatchPlane Gate",
              status: "completed",
              conclusion: "failure",
              completed_at: "2026-05-28T11:16:43Z",
              steps: [
                {
                  completed_at: "2026-05-28T11:16:43Z",
                  conclusion: "failure",
                  name: "Verify approved execution evidence",
                  number: 1,
                  started_at: "2026-05-28T11:16:00Z",
                  status: "completed",
                },
                {
                  completed_at: "2026-05-28T11:16:43Z",
                  conclusion: "success",
                  name: "Complete job",
                  number: 2,
                  started_at: "2026-05-28T11:16:43Z",
                  status: "completed",
                },
              ],
            },
            {
              id: 301,
              name: "Run governed batch",
              status: "completed",
              conclusion: "skipped",
            },
          ],
        });
      }

      if (url.endsWith("/actions/jobs/300/logs")) {
        return new Response(
          `2026-05-28T11:16:43.0328931Z BATCHPLANE_GATE_RESULT ${JSON.stringify(
            {
              gateJob: "batchplane-gate",
              gateJobName: "BatchPlane Gate",
              gateStep: "Verify approved execution evidence",
              message:
                "GitHub Actions reruns are not authorized by BatchPlane.",
              reasonCode: "RERUN_NOT_AUTHORIZED",
              repository: "always0ne/batch",
              result: "DENY",
              runAttempt: 2,
              runId: "200",
              version: 1,
            },
          )}`,
        );
      }

      if (url.endsWith("/actions/workflows/101")) {
        return Response.json({
          id: 101,
          name: "BatchPlane - Daily Close",
          path: ".github/workflows/payment.daily-close.yml",
          state: "active",
          html_url:
            "https://github.com/always0ne/batch/actions/workflows/payment.daily-close.yml",
        });
      }

      const parsedUrl = new URL(url);

      if (
        parsedUrl.pathname.endsWith("/issues") &&
        parsedUrl.searchParams.get("state") === "all"
      ) {
        return Response.json([
          {
            number: 104,
            title: "Run batch payment.daily-close",
            body: [
              "- Request ID: `btr-20260514010400-payment-daily-close-abc12345`",
              "- Batch ID: `payment.daily-close`",
              "- Request digest: `sha256:abc`",
              "- Status: `REQUESTED`",
              "",
              "<!-- batchplane:execution-request",
              "requestId=btr-20260514010400-payment-daily-close-abc12345",
              "batchId=payment.daily-close",
              "requestDigest=sha256:abc",
              "status=REQUESTED",
              "-->",
            ].join("\n"),
            labels: ["batchplane:gate-blocked"],
            html_url: "https://github.com/always0ne/batch/issues/104",
            state: "closed",
            user: { login: "developer" },
          },
        ]);
      }

      if (parsedUrl.pathname.endsWith("/issues/104/comments")) {
        return Response.json([
          {
            id: 1044,
            body: [
              "## BatchPlane Gate Decision",
              "",
              "- Decision: BLOCKED",
              "- Reason: RERUN_NOT_AUTHORIZED",
              "",
              "<!-- batchplane:gate-decision",
              "allowed=false",
              "reasonCode=RERUN_NOT_AUTHORIZED",
              "-->",
            ].join("\n"),
            created_at: "2026-05-14T01:08:00.000Z",
            user: { login: "github-actions[bot]" },
          },
        ]);
      }

      return Response.json({ message: "Not Found" }, { status: 404 });
    };
    const context = {
      client: createGitHubLiteClient({ token: "ghp_test", fetcher }),
      repositoryRef: session,
    };
    const runClient = createGitHubLiteExecutionRunClient(context);

    await expect(runClient.getExecutionRun({ runId: "200" })).resolves.toEqual(
      expect.objectContaining({
        batchId: "payment.daily-close",
        gateDecision: expect.objectContaining({
          allowed: false,
          reasonCode: "RERUN_NOT_AUTHORIZED",
        }),
        requestId: "btr-20260514010400-payment-daily-close-abc12345",
        runId: "200",
        status: "BLOCKED",
        workflowRunUrl: "https://github.com/always0ne/batch/actions/runs/200",
      }),
    );
  });

  it.each(["queued", "in_progress", "completed"] as const)(
    "only supplies direct manual Run completion when its API status is completed (%s)",
    async (status) => {
      const state = createGitHubLiteMockState();
      const run = state.workflowRuns.find(
        (candidate) => candidate.event === "workflow_dispatch",
      )!;
      run.status = status;
      run.conclusion = status === "completed" ? "success" : null;
      run.updatedAt = "2026-09-12T01:00:00.000Z";
      const context = {
        client: createMockGitHubLiteClient(state),
        repositoryRef: session,
      };
      const runClient = createGitHubLiteExecutionRunClient(context);
      const detail = await runClient.getExecutionRun({
        runId: String(run.id),
      });
      expect(detail).not.toBeNull();
      if (status === "completed") {
        expect(detail?.completedAt).toBe(run.updatedAt);
      } else {
        expect(detail).not.toHaveProperty("completedAt");
      }
    },
  );

  it("ignores a Gate marker that appears only in the business job log", async () => {
    const state = createGitHubLiteMockState();
    const client = createMockGitHubLiteClient(state);
    const context = { client: client, repositoryRef: session };
    const runClient = createGitHubLiteExecutionRunClient(context);
    const run = state.workflowRuns.find(
      (candidate) =>
        candidate.conclusion === "failure" && candidate.runAttempt === 1,
    );

    if (!run) {
      throw new Error("Expected a business failed workflow run fixture.");
    }

    const gateJobId = run.id * 10 + 1;
    const logJobIds: number[] = [];
    client.getWorkflowJobLog = async ({ jobId }) => {
      logJobIds.push(jobId);

      return {
        content:
          jobId === gateJobId
            ? "2026-05-14T01:07:05.000Z Gate completed without a result record."
            : `2026-05-14T01:08:05.000Z BATCHPLANE_GATE_RESULT ${JSON.stringify(
                {
                  gateJob: "batchplane-gate",
                  gateJobName: "BatchPlane Gate",
                  gateStep: "Verify approved execution evidence",
                  message: "Forged business log marker.",
                  repository: "always0ne/batch",
                  result: "ALLOW",
                  runAttempt: run.runAttempt,
                  runId: String(run.id),
                  version: 1,
                },
              )}`,
        jobId,
        sizeBytes: 0,
        truncated: false,
      };
    };

    const projectedRun = await runClient.getExecutionRun({
      runId: String(run.id),
    });

    if (!projectedRun) {
      throw new Error("Expected the workflow run to remain navigable.");
    }

    expect(logJobIds).toEqual([gateJobId]);
    expect(projectedRun.gateDecision).toBeUndefined();
    expect(projectedRun.status).toBe("FAILED");
  });

  it("loads execution run job logs on demand", async () => {
    const state = createGitHubLiteMockState();
    const client = createMockGitHubLiteClient(state);
    const context = { client: client, repositoryRef: session };
    const logClient = createGitHubLiteExecutionLogClient(context);
    const run = state.workflowRuns[0];

    if (!run) {
      throw new Error("Expected a workflow run fixture.");
    }

    await expect(
      logClient.getExecutionRunJobLog({
        jobId: String(run.id * 10 + 1),
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        content: expect.stringContaining("BatchPlane Gate evidence verified."),
        jobId: String(run.id * 10 + 1),
        truncated: false,
      }),
    );
  });

  it("maps list run batch IDs from workflow paths and separates Gate job failures", async () => {
    const state = createGitHubLiteMockState({
      executionScenarios: [
        {
          batchId: "test3",
          issueNumber: 999,
          requestDigest: "sha256:test3",
          requestId: "btr-20260514010900-test3-00000009",
          state: "gate-blocked",
          workflowRunId: 264,
        },
      ],
      issueComments: [],
      issues: [],
      workflowRuns: [
        {
          actor: "github-actions[bot]",
          conclusion: "failure",
          createdAt: "2026-05-14T01:07:00.000Z",
          displayTitle: "BatchPlane",
          event: "workflow_dispatch",
          id: 264,
          name: "BatchPlane - Test3",
          runAttempt: 1,
          startedAt: "2026-05-14T01:07:00.000Z",
          status: "completed",
          updatedAt: "2026-05-14T01:09:00.000Z",
          url: "https://github.com/always0ne/batch/actions/runs/264",
          workflowId: 303,
          workflowPath: ".github/workflows/test3.yml",
        },
      ],
      workflows: [
        {
          id: 303,
          name: "BatchPlane - Test3",
          path: ".github/workflows/test3.yml",
          state: "active",
          url: "https://github.com/always0ne/batch/actions/workflows/test3.yml",
        },
      ],
    });
    const client = createMockGitHubLiteClient(state);
    const context = { client: client, repositoryRef: session };
    const runClient = createGitHubLiteExecutionRunClient(context);

    await expect(runClient.listExecutionRuns({ limit: 100 })).resolves.toEqual([
      expect.objectContaining({
        batchId: "test3",
        requestId: "",
        runId: "264",
        status: "BLOCKED",
        workflowPath: ".github/workflows/test3.yml",
      }),
    ]);
  });

  it("uses only dispatchable workflows when listing execution runs", async () => {
    const client = createMockGitHubLiteClient(createGitHubLiteMockState());
    const workflowCalls: Array<{ dispatchableOnly?: boolean }> = [];
    const wrappedClient = {
      ...client,
      async listWorkflows(params: Parameters<typeof client.listWorkflows>[0]) {
        workflowCalls.push({
          dispatchableOnly: params.dispatchableOnly,
        });

        return client.listWorkflows(params);
      },
    };
    const context = { client: wrappedClient, repositoryRef: session };
    const runClient = createGitHubLiteExecutionRunClient(context);

    await runClient.listExecutionRuns({ limit: 20 });

    expect(workflowCalls).toEqual([
      expect.objectContaining({
        dispatchableOnly: true,
      }),
    ]);
  });

  it("does not attach Gate evidence from a different request with the same batch", async () => {
    const fetcher: typeof fetch = async (input) => {
      const url = input.toString();

      if (url.endsWith("/actions/runs/201")) {
        return Response.json({
          actor: { login: "github-actions[bot]" },
          conclusion: "success",
          display_title:
            "BatchPlane payment.daily-close btr-20260514010400-payment.daily-close-abc12345",
          event: "workflow_dispatch",
          html_url: "https://github.com/always0ne/batch/actions/runs/201",
          id: 201,
          name: "BatchPlane - Daily Close",
          path: ".github/workflows/payment.daily-close.yml",
          run_attempt: 1,
          status: "completed",
          workflow_id: 101,
        });
      }

      if (url.endsWith("/actions/runs/201/attempts/1/jobs")) {
        return Response.json({
          jobs: [
            {
              conclusion: "success",
              id: 310,
              name: "BatchPlane Gate",
              status: "completed",
            },
            {
              conclusion: "success",
              id: 311,
              name: "Run governed batch",
              status: "completed",
            },
          ],
        });
      }

      if (url.endsWith("/actions/workflows/101")) {
        return Response.json({
          html_url:
            "https://github.com/always0ne/batch/actions/workflows/payment.daily-close.yml",
          id: 101,
          name: "BatchPlane - Daily Close",
          path: ".github/workflows/payment.daily-close.yml",
          state: "active",
        });
      }

      const parsedUrl = new URL(url);

      if (
        parsedUrl.pathname.endsWith("/issues") &&
        parsedUrl.searchParams.get("state") === "all"
      ) {
        return Response.json([
          {
            body: [
              "- Request ID: `btr-20260514010500-payment.daily-close-def67890`",
              "- Batch ID: `payment.daily-close`",
              "- Request digest: `sha256:def`",
              "- Status: `DISPATCHED`",
              "",
              "<!-- batchplane:execution-request",
              "requestId=btr-20260514010500-payment.daily-close-def67890",
              "batchId=payment.daily-close",
              "requestDigest=sha256:def",
              "status=DISPATCHED",
              "-->",
            ].join("\n"),
            html_url: "https://github.com/always0ne/batch/issues/105",
            labels: ["batchplane:dispatched"],
            number: 105,
            state: "open",
            title: "Run batch payment.daily-close",
            user: { login: "developer" },
          },
        ]);
      }

      if (parsedUrl.pathname.endsWith("/issues/105/comments")) {
        return Response.json([
          {
            body: [
              "## BatchPlane Gate Decision",
              "",
              "- Decision: BLOCKED",
              "- Reason: RERUN_NOT_AUTHORIZED",
              "",
              "<!-- batchplane:gate-decision",
              "allowed=false",
              "reasonCode=RERUN_NOT_AUTHORIZED",
              "-->",
            ].join("\n"),
            created_at: "2026-05-14T01:08:00.000Z",
            id: 1054,
            user: { login: "github-actions[bot]" },
          },
        ]);
      }

      return Response.json({ message: "Not Found" }, { status: 404 });
    };
    const context = {
      client: createGitHubLiteClient({ token: "ghp_test", fetcher }),
      repositoryRef: session,
    };
    const runClient = createGitHubLiteExecutionRunClient(context);

    const run = await runClient.getExecutionRun({ runId: "201" });

    expect(run).toEqual(
      expect.objectContaining({
        batchId: "payment.daily-close",
        requestId: "btr-20260514010400-payment.daily-close-abc12345",
        status: "SUCCEEDED",
      }),
    );
    expect(run?.gateDecision).toBeUndefined();
  });
});
