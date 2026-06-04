import { describe, expect, it } from "vitest";
import {
  createGitHubLiteMockState,
  createMockGitHubLiteClient,
} from "@batchplane/github-lite";

import { createGitHubLiteRuntime } from "./github-lite-runtime";

const session = {
  owner: "always0ne",
  repo: "batch",
  token: "ghp_test",
};

describe("createGitHubLiteRuntime", () => {
  it("loads batch definitions through the BatchPort", async () => {
    const fetcher: typeof fetch = async (input) => {
      const url = input.toString();

      if (
        url ===
        "https://api.github.com/repos/always0ne/batch/contents/.batch-governance/batches?ref=main"
      ) {
        return Response.json([
          {
            name: "payment.daily-close.yml",
            path: ".batch-governance/batches/payment.daily-close.yml",
            sha: "dir-sha",
            type: "file",
          },
        ]);
      }

      if (
        url ===
        "https://api.github.com/repos/always0ne/batch/contents/.batch-governance/batches/payment.daily-close.yml?ref=main"
      ) {
        return Response.json({
          content: btoa(
            [
              'apiVersion: "batchplane.io/v1"',
              'kind: "BatchDefinition"',
              "metadata:",
              '  id: "payment.daily-close"',
              '  name: "Daily Close"',
              "spec:",
              '  owner: "ops-team"',
              '  domain: "payments"',
              '  environment: "PROD"',
              '  criticality: "HIGH"',
              '  status: "ACTIVE"',
              "  workflow:",
              '    path: ".github/workflows/payment.daily-close.yml"',
              '    ref: "main"',
              "  gateRequired: true",
              "",
            ].join("\n"),
          ),
          encoding: "base64",
          path: ".batch-governance/batches/payment.daily-close.yml",
          sha: "file-sha",
        });
      }

      return Response.json({ message: "Not Found" }, { status: 404 });
    };
    const runtime = createGitHubLiteRuntime(session, { fetcher });

    await expect(
      runtime.batches.listBatchDefinitions({ ref: "main" }),
    ).resolves.toEqual([
      expect.objectContaining({
        batchId: "payment.daily-close",
        gateRequired: true,
        status: "ACTIVE",
      }),
    ]);
  });

  it("loads schedule definitions through the SchedulePort", async () => {
    const client = createMockGitHubLiteClient(createGitHubLiteMockState());
    const runtime = createGitHubLiteRuntime(session, { client });

    await expect(
      runtime.schedules.listScheduleDefinitions({
        batchId: "payment.daily-close",
        ref: "main",
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        batchId: "payment.daily-close",
        cron: "0 5 * * *",
        enabled: true,
        scheduleId: "payment.daily-close-daily",
        timezone: "Asia/Seoul",
      }),
    ]);
  });

  it("updates existing governed files with file SHAs during change-mode PR creation", async () => {
    const requests: Array<{ body: unknown; method: string; url: string }> = [];
    const branch = "batchplane/change/payment.daily-close-20260514010203";
    const fetcher: typeof fetch = async (input, init) => {
      const url = input.toString();
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(init.body.toString()) : null;
      const parsedUrl = new URL(url);

      requests.push({ body, method, url });

      if (url.endsWith("/git/ref/heads/main")) {
        return Response.json({
          object: { sha: "mock-main-sha", type: "commit", url: "" },
          ref: "refs/heads/main",
        });
      }

      if (url.endsWith("/git/refs") && method === "POST") {
        return Response.json({
          object: { sha: "mock-main-sha", type: "commit", url: "" },
          ref: `refs/heads/${branch}`,
        });
      }

      if (
        parsedUrl.pathname ===
          "/repos/always0ne/batch/contents/.batch-governance/batches/payment.daily-close.yml" &&
        parsedUrl.searchParams.get("ref") === branch
      ) {
        return Response.json({
          content: btoa('metadata:\n  id: "payment.daily-close"\n'),
          encoding: "base64",
          path: ".batch-governance/batches/payment.daily-close.yml",
          sha: "existing-batch-sha",
        });
      }

      if (
        parsedUrl.pathname ===
          "/repos/always0ne/batch/contents/.github/workflows/payment.daily-close.yml" &&
        parsedUrl.searchParams.get("ref") === branch
      ) {
        return Response.json({
          content: btoa("name: Existing workflow\n"),
          encoding: "base64",
          path: ".github/workflows/payment.daily-close.yml",
          sha: "existing-workflow-sha",
        });
      }

      if (
        url.endsWith(
          "/contents/.batch-governance/batches/payment.daily-close.yml",
        ) &&
        method === "PUT"
      ) {
        return Response.json({
          content: {
            path: ".batch-governance/batches/payment.daily-close.yml",
            sha: "updated-batch-sha",
          },
        });
      }

      if (
        url.endsWith("/contents/.github/workflows/payment.daily-close.yml") &&
        method === "PUT"
      ) {
        return Response.json({
          content: {
            path: ".github/workflows/payment.daily-close.yml",
            sha: "updated-workflow-sha",
          },
        });
      }

      if (url.endsWith("/pulls") && method === "POST") {
        return Response.json({
          base: { ref: "main" },
          body: "body",
          head: { ref: branch },
          html_url: "https://github.com/always0ne/batch/pull/13",
          number: 13,
          state: "open",
          title: "Change batch payment.daily-close",
          user: { login: "maintainer" },
        });
      }

      return Response.json({ message: "Not Found" }, { status: 404 });
    };
    const runtime = createGitHubLiteRuntime(session, { fetcher });

    await expect(
      runtime.registration.createRegistrationPullRequest({
        baseBranch: "main",
        batchDefinitionPath:
          ".batch-governance/batches/payment.daily-close.yml",
        batchDefinitionYaml: 'metadata:\n  id: "payment.daily-close"\n',
        body: "body",
        branch,
        title: "Change batch payment.daily-close",
        workflowPath: ".github/workflows/payment.daily-close.yml",
        workflowYaml: "name: Updated workflow\n",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        number: 13,
        title: "Change batch payment.daily-close",
      }),
    );

    expect(requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          body: expect.objectContaining({
            branch,
            sha: "existing-batch-sha",
          }),
          method: "PUT",
          url: "https://api.github.com/repos/always0ne/batch/contents/.batch-governance/batches/payment.daily-close.yml",
        }),
        expect.objectContaining({
          body: expect.objectContaining({
            branch,
            sha: "existing-workflow-sha",
          }),
          method: "PUT",
          url: "https://api.github.com/repos/always0ne/batch/contents/.github/workflows/payment.daily-close.yml",
        }),
        expect.objectContaining({
          body: expect.objectContaining({
            branch,
          }),
          method: "PUT",
          url: "https://api.github.com/repos/always0ne/batch/contents/.github/workflows/payment.daily-close.yml",
        }),
      ]),
    );
  });

  it("creates governed delete pull requests by removing batch files from a branch", async () => {
    const requests: Array<{ body: unknown; method: string; url: string }> = [];
    const branch = "batchplane/delete/payment.daily-close-20260514010203";
    const fetcher: typeof fetch = async (input, init) => {
      const url = input.toString();
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(init.body.toString()) : null;
      const parsedUrl = new URL(url);

      requests.push({ body, method, url });

      if (url.endsWith("/git/ref/heads/main")) {
        return Response.json({
          object: { sha: "mock-main-sha", type: "commit", url: "" },
          ref: "refs/heads/main",
        });
      }

      if (
        parsedUrl.pathname ===
          "/repos/always0ne/batch/contents/.batch-governance/batches/payment.daily-close.yml" &&
        parsedUrl.searchParams.get("ref") === "main"
      ) {
        return Response.json({
          content: btoa('metadata:\n  id: "payment.daily-close"\n'),
          encoding: "base64",
          path: ".batch-governance/batches/payment.daily-close.yml",
          sha: "existing-batch-sha",
        });
      }

      if (
        parsedUrl.pathname ===
          "/repos/always0ne/batch/contents/.github/workflows/payment.daily-close.yml" &&
        parsedUrl.searchParams.get("ref") === "main"
      ) {
        return Response.json({
          content: btoa("name: Existing workflow\n"),
          encoding: "base64",
          path: ".github/workflows/payment.daily-close.yml",
          sha: "existing-workflow-sha",
        });
      }

      if (url.endsWith("/git/refs") && method === "POST") {
        return Response.json({
          object: { sha: "mock-main-sha", type: "commit", url: "" },
          ref: `refs/heads/${branch}`,
        });
      }

      if (
        url.endsWith(
          "/contents/.batch-governance/batches/payment.daily-close.yml",
        ) &&
        method === "DELETE"
      ) {
        return Response.json({
          content: {
            path: ".batch-governance/batches/payment.daily-close.yml",
            sha: "deleted-batch-sha",
          },
        });
      }

      if (
        url.endsWith("/contents/.github/workflows/payment.daily-close.yml") &&
        method === "DELETE"
      ) {
        return Response.json({
          content: {
            path: ".github/workflows/payment.daily-close.yml",
            sha: "deleted-workflow-sha",
          },
        });
      }

      if (url.endsWith("/pulls") && method === "POST") {
        return Response.json({
          base: { ref: "main" },
          body: "body",
          head: { ref: branch },
          html_url: "https://github.com/always0ne/batch/pull/14",
          number: 14,
          state: "open",
          title: "Delete batch payment.daily-close",
          user: { login: "maintainer" },
        });
      }

      return Response.json({ message: "Not Found" }, { status: 404 });
    };
    const runtime = createGitHubLiteRuntime(session, { fetcher });

    await expect(
      runtime.registration.createBatchDeletionPullRequest({
        baseBranch: "main",
        batchDefinitionPath:
          ".batch-governance/batches/payment.daily-close.yml",
        body: "body",
        branch,
        title: "Delete batch payment.daily-close",
        workflowPath: ".github/workflows/payment.daily-close.yml",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        number: 14,
        title: "Delete batch payment.daily-close",
      }),
    );

    expect(requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          body: expect.objectContaining({
            branch,
            sha: "existing-batch-sha",
          }),
          method: "DELETE",
          url: "https://api.github.com/repos/always0ne/batch/contents/.batch-governance/batches/payment.daily-close.yml",
        }),
        expect.objectContaining({
          body: expect.objectContaining({
            branch,
            sha: "existing-workflow-sha",
          }),
          method: "DELETE",
          url: "https://api.github.com/repos/always0ne/batch/contents/.github/workflows/payment.daily-close.yml",
        }),
      ]),
    );
  });

  it("updates existing schedule definitions with file SHAs during change-mode PR creation", async () => {
    const requests: Array<{ body: unknown; method: string; url: string }> = [];
    const branch =
      "batchplane/schedule/change/payment.daily-close-daily-20260514010203";
    const fetcher: typeof fetch = async (input, init) => {
      const url = input.toString();
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(init.body.toString()) : null;
      const parsedUrl = new URL(url);

      requests.push({ body, method, url });

      if (url.endsWith("/git/ref/heads/main")) {
        return Response.json({
          object: { sha: "mock-main-sha", type: "commit", url: "" },
          ref: "refs/heads/main",
        });
      }

      if (url.endsWith("/git/refs") && method === "POST") {
        return Response.json({
          object: { sha: "mock-main-sha", type: "commit", url: "" },
          ref: `refs/heads/${branch}`,
        });
      }

      if (
        parsedUrl.pathname ===
          "/repos/always0ne/batch/contents/.batch-governance/schedules/payment.daily-close-daily.yml" &&
        parsedUrl.searchParams.get("ref") === branch
      ) {
        return Response.json({
          content: btoa('metadata:\n  id: "payment.daily-close-daily"\n'),
          encoding: "base64",
          path: ".batch-governance/schedules/payment.daily-close-daily.yml",
          sha: "existing-schedule-sha",
        });
      }

      if (
        url.endsWith(
          "/contents/.batch-governance/schedules/payment.daily-close-daily.yml",
        ) &&
        method === "PUT"
      ) {
        return Response.json({
          content: {
            path: ".batch-governance/schedules/payment.daily-close-daily.yml",
            sha: "updated-schedule-sha",
          },
        });
      }

      if (url.endsWith("/pulls") && method === "POST") {
        return Response.json({
          base: { ref: "main" },
          body: "body",
          head: { ref: branch },
          html_url: "https://github.com/always0ne/batch/pull/14",
          number: 14,
          state: "open",
          title: "Change schedule payment.daily-close-daily",
          user: { login: "maintainer" },
        });
      }

      return Response.json({ message: "Not Found" }, { status: 404 });
    };
    const runtime = createGitHubLiteRuntime(session, { fetcher });

    await expect(
      runtime.schedules.createScheduleDefinitionPullRequest({
        baseBranch: "main",
        body: "body",
        branch,
        scheduleDefinitionPath:
          ".batch-governance/schedules/payment.daily-close-daily.yml",
        scheduleDefinitionYaml:
          'metadata:\n  id: "payment.daily-close-daily"\n',
        title: "Change schedule payment.daily-close-daily",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        number: 14,
        title: "Change schedule payment.daily-close-daily",
      }),
    );

    expect(requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          body: expect.objectContaining({
            branch,
            sha: "existing-schedule-sha",
          }),
          method: "PUT",
          url: "https://api.github.com/repos/always0ne/batch/contents/.batch-governance/schedules/payment.daily-close-daily.yml",
        }),
      ]),
    );
  });

  it("approves registration requests through the ApprovalPort", async () => {
    const requests: Array<{ body: unknown; method: string; url: string }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      requests.push({
        body: init?.body ? JSON.parse(init.body.toString()) : null,
        method: init?.method ?? "GET",
        url: input.toString(),
      });

      if (input.toString().endsWith("/issues/12/comments")) {
        return Response.json({ body: "approved", id: 1 });
      }

      if (input.toString().endsWith("/pulls/12/merge")) {
        return Response.json({
          merged: true,
          message: "Pull Request successfully merged",
          sha: "merge-sha",
        });
      }

      return Response.json({ message: "Not Found" }, { status: 404 });
    };
    const runtime = createGitHubLiteRuntime(session, { fetcher });

    await expect(
      runtime.approvals.approveRegistration({
        body: "approved",
        commitTitle: "Register batch payment.daily-close (#12)",
        pullNumber: 12,
      }),
    ).resolves.toEqual({
      merged: true,
      message: "Pull Request successfully merged",
      sha: "merge-sha",
    });
    expect(requests).toEqual([
      expect.objectContaining({
        body: { body: "approved" },
        method: "POST",
        url: "https://api.github.com/repos/always0ne/batch/issues/12/comments",
      }),
      expect.objectContaining({
        body: {
          commit_title: "Register batch payment.daily-close (#12)",
          merge_method: "squash",
        },
        method: "PUT",
        url: "https://api.github.com/repos/always0ne/batch/pulls/12/merge",
      }),
    ]);
  });

  it("loads execution request comments through the ApprovalPort", async () => {
    const fetcher: typeof fetch = async (input) => {
      if (new URL(input.toString()).pathname.endsWith("/issues/101/comments")) {
        return Response.json([
          {
            body: "## BatchPlane Execution Approval",
            created_at: "2026-05-14T01:05:00.000Z",
            id: 1011,
            user: { login: "maintainer" },
          },
        ]);
      }

      return Response.json({ message: "Not Found" }, { status: 404 });
    };
    const runtime = createGitHubLiteRuntime(session, { fetcher });

    await expect(
      runtime.approvals.listExecutionRequestComments({ issueNumber: 101 }),
    ).resolves.toEqual([
      {
        author: "maintainer",
        body: "## BatchPlane Execution Approval",
        createdAt: "2026-05-14T01:05:00.000Z",
        id: 1011,
        issueNumber: 101,
      },
    ]);
  });

  it("loads registration request files through the ApprovalPort", async () => {
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(input.toString());

      if (
        url.pathname ===
          "/repos/always0ne/batch/contents/.github/workflows/payment.daily-close.yml" &&
        url.searchParams.get("ref") ===
          "batchplane/register/payment.daily-close-20260514010203"
      ) {
        return Response.json({
          content: btoa("name: BatchPlane - Daily Close\n"),
          encoding: "base64",
          path: ".github/workflows/payment.daily-close.yml",
          sha: "workflow-sha",
        });
      }

      return Response.json({ message: "Not Found" }, { status: 404 });
    };
    const runtime = createGitHubLiteRuntime(session, { fetcher });

    await expect(
      runtime.approvals.readRegistrationRequestFile({
        path: ".github/workflows/payment.daily-close.yml",
        ref: "batchplane/register/payment.daily-close-20260514010203",
      }),
    ).resolves.toEqual({
      content: "name: BatchPlane - Daily Close\n",
      path: ".github/workflows/payment.daily-close.yml",
      ref: "batchplane/register/payment.daily-close-20260514010203",
    });
    await expect(
      runtime.approvals.readRegistrationRequestFile({
        path: ".github/workflows/missing.yml",
        ref: "batchplane/register/payment.daily-close-20260514010203",
      }),
    ).resolves.toBeNull();
  });

  it("records execution approval without closing the Issue", async () => {
    const requests: Array<{ body: unknown; method: string; url: string }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      requests.push({
        body: init?.body ? JSON.parse(init.body.toString()) : null,
        method: init?.method ?? "GET",
        url: input.toString(),
      });

      if (input.toString().endsWith("/issues/101/comments")) {
        return Response.json({ body: "approved", id: 1 });
      }

      return Response.json({ message: "Not Found" }, { status: 404 });
    };
    const runtime = createGitHubLiteRuntime(session, { fetcher });

    await runtime.approvals.approveExecution({
      body: "/bgcp approve requestDigest=sha256:abc",
      issueNumber: 101,
    });

    expect(requests).toEqual([
      expect.objectContaining({
        body: { body: "/bgcp approve requestDigest=sha256:abc" },
        method: "POST",
        url: "https://api.github.com/repos/always0ne/batch/issues/101/comments",
      }),
    ]);
  });

  it("reads Workspace policy from repository configuration", async () => {
    const state = createGitHubLiteMockState();
    state.files.push({
      branch: "main",
      content: [
        'apiVersion: "batchplane.io/v1"',
        'kind: "WorkspacePolicy"',
        "metadata:",
        '  id: "default"',
        "spec:",
        "  approval:",
        '    mode: "SELF_APPROVAL_ALLOWED"',
        "",
      ].join("\n"),
      path: ".batch-governance/workspace.yml",
      sha: "workspace-policy-sha",
    });
    const client = createMockGitHubLiteClient(state);
    const runtime = createGitHubLiteRuntime(session, { client });

    await expect(runtime.settings.getWorkspacePolicy()).resolves.toEqual({
      approval: {
        mode: "SELF_APPROVAL_ALLOWED",
      },
    });
  });

  it("defaults Workspace policy to self-approval blocked when configuration is missing", async () => {
    const client = createMockGitHubLiteClient(createGitHubLiteMockState());
    const runtime = createGitHubLiteRuntime(session, { client });

    await expect(runtime.settings.getWorkspacePolicy()).resolves.toEqual({
      approval: {
        mode: "SELF_APPROVAL_BLOCKED",
      },
    });
  });

  it("creates Workspace policy change pull requests through the SettingsPort", async () => {
    const client = createMockGitHubLiteClient(createGitHubLiteMockState());
    const runtime = createGitHubLiteRuntime(session, { client });

    const pullRequest = await runtime.settings.createWorkspacePolicyPullRequest(
      {
        defaultBranch: "main",
        policy: { approval: { mode: "SELF_APPROVAL_ALLOWED" } },
      },
    );

    expect(pullRequest).toEqual(
      expect.objectContaining({
        head: expect.stringContaining("batchplane/workspace/policy-"),
        title: "Update BatchPlane Workspace policy",
      }),
    );
    expect(
      client.state.files.find(
        (file) =>
          file.branch === pullRequest.head &&
          file.path === ".batch-governance/workspace.yml",
      )?.content,
    ).toContain('mode: "SELF_APPROVAL_ALLOWED"');
  });

  it("builds an audit timeline from GitHub Issues, PRs, and workflow runs", async () => {
    const client = createMockGitHubLiteClient(createGitHubLiteMockState());
    const runtime = createGitHubLiteRuntime(session, { client });

    const items = await runtime.audit.listAuditTimeline({ limit: 100 });

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

      if (url.endsWith("/actions/runs/200/jobs")) {
        return Response.json({
          jobs: [
            {
              id: 300,
              name: "BatchPlane Gate",
              status: "completed",
              conclusion: "failure",
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
    const runtime = createGitHubLiteRuntime(session, { fetcher });

    await expect(
      runtime.executions.getExecutionRun({ runId: "200" }),
    ).resolves.toEqual(
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

  it("records failure follow-up evidence on the correlated execution request", async () => {
    const state = createGitHubLiteMockState();
    const client = createMockGitHubLiteClient(state);
    const runtime = createGitHubLiteRuntime(session, { client });
    const run = state.workflowRuns.find(
      (candidate) =>
        candidate.batchId === "payment.daily-close" &&
        candidate.conclusion === "failure",
    );

    if (!run) {
      throw new Error("Expected a business failed workflow run fixture.");
    }

    const followUp = await runtime.executions.createFailureFollowUp({
      actionTaken: "Reprocessed after upstream correction.",
      explanation: "The upstream ledger file arrived late.",
      owner: "ops-team",
      runId: String(run.id),
      status: "RESOLVED",
    });
    const scenario = client.state.executionScenarios.find(
      (candidate) => candidate.workflowRunId === run.id,
    );

    expect(followUp).toEqual(
      expect.objectContaining({
        actionTaken: "Reprocessed after upstream correction.",
        batchId: "payment.daily-close",
        explanation: "The upstream ledger file arrived late.",
        owner: "ops-team",
        requestId: run.requestId,
        runId: String(run.id),
        status: "RESOLVED",
      }),
    );
    expect(
      client.state.issueComments.some(
        (comment) =>
          comment.issueNumber === scenario?.issueNumber &&
          comment.body.includes("batchplane:failure-follow-up") &&
          comment.body.includes("The upstream ledger file arrived late."),
      ),
    ).toBe(true);

    await expect(
      runtime.executions.getExecutionRun({ runId: String(run.id) }),
    ).resolves.toEqual(
      expect.objectContaining({
        failureFollowUps: [
          expect.objectContaining({
            explanation: "The upstream ledger file arrived late.",
            status: "RESOLVED",
          }),
        ],
      }),
    );
  });

  it("loads execution run job logs on demand", async () => {
    const state = createGitHubLiteMockState();
    const client = createMockGitHubLiteClient(state);
    const runtime = createGitHubLiteRuntime(session, { client });
    const run = state.workflowRuns[0];

    if (!run) {
      throw new Error("Expected a workflow run fixture.");
    }

    await expect(
      runtime.executions.getExecutionRunJobLog({
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
    const runtime = createGitHubLiteRuntime(session, { client });

    await expect(
      runtime.executions.listExecutionRuns({ limit: 100 }),
    ).resolves.toEqual([
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
    const runtime = createGitHubLiteRuntime(session, {
      client: wrappedClient,
    });

    await runtime.executions.listExecutionRuns({ limit: 20 });

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

      if (url.endsWith("/actions/runs/201/jobs")) {
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
    const runtime = createGitHubLiteRuntime(session, { fetcher });

    const run = await runtime.executions.getExecutionRun({ runId: "201" });

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
