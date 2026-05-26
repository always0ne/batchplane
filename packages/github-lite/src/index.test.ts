import { describe, expect, it } from "vitest";

import {
  createGitHubLiteClient,
  createGitHubLiteMockState,
  createMockGitHubLiteClient,
} from "./index";

describe("createGitHubLiteClient", () => {
  it("adds GitHub auth headers and maps the current user", async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> =
      [];
    const fetcher: typeof fetch = async (input, init) => {
      requests.push({ input, init });
      return Response.json({
        login: "always0ne",
      });
    };
    const client = createGitHubLiteClient({ token: "ghp_test", fetcher });

    await expect(client.getCurrentUser()).resolves.toEqual({
      login: "always0ne",
    });

    const request = requests[0];

    expect(request?.input.toString()).toBe("https://api.github.com/user");

    const headers = new Headers(request?.init?.headers);

    expect(headers.get("Authorization")).toBe("Bearer ghp_test");
  });

  it("returns null when a file is missing", async () => {
    const fetcher: typeof fetch = async () =>
      Response.json({ message: "Not Found" }, { status: 404 });
    const client = createGitHubLiteClient({ token: "ghp_test", fetcher });

    await expect(
      client.getFile({ owner: "always0ne", repo: "batchplane", path: "x.yml" }),
    ).resolves.toBeNull();
  });

  it("decodes base64 file content", async () => {
    const fetcher: typeof fetch = async () =>
      Response.json({
        path: "batchtrail.yml",
        encoding: "base64",
        content: btoa("name: nightly\n"),
        sha: "file-sha",
      });
    const client = createGitHubLiteClient({ token: "ghp_test", fetcher });

    await expect(
      client.getFile({
        owner: "always0ne",
        repo: "batchplane",
        path: "batchtrail.yml",
      }),
    ).resolves.toEqual({
      path: "batchtrail.yml",
      content: "name: nightly\n",
      sha: "file-sha",
    });
  });

  it("lists directory entries", async () => {
    const fetcher: typeof fetch = async () =>
      Response.json([
        {
          name: "payment.daily-close.yml",
          path: ".batch-governance/batches/payment.daily-close.yml",
          sha: "file-sha",
          type: "file",
        },
      ]);
    const client = createGitHubLiteClient({ token: "ghp_test", fetcher });

    await expect(
      client.getDirectory({
        owner: "always0ne",
        repo: "batchplane",
        path: ".batch-governance/batches",
        ref: "main",
      }),
    ).resolves.toEqual([
      {
        name: "payment.daily-close.yml",
        path: ".batch-governance/batches/payment.daily-close.yml",
        sha: "file-sha",
        type: "file",
      },
    ]);
  });

  it("creates a branch from an existing head sha", async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> =
      [];
    const fetcher: typeof fetch = async (input, init) => {
      requests.push({ input, init });
      return Response.json({ object: { sha: "new-sha" } });
    };
    const client = createGitHubLiteClient({ token: "ghp_test", fetcher });

    await expect(
      client.createBranch({
        owner: "always0ne",
        repo: "batchplane",
        branch: "batchplane/register/demo",
        sha: "base-sha",
      }),
    ).resolves.toBeUndefined();

    expect(requests[0]?.input.toString()).toBe(
      "https://api.github.com/repos/always0ne/batchplane/git/refs",
    );
    expect(JSON.parse(requests[0]?.init?.body?.toString() ?? "{}")).toEqual({
      ref: "refs/heads/batchplane/register/demo",
      sha: "base-sha",
    });
  });

  it("puts file content as base64", async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> =
      [];
    const fetcher: typeof fetch = async (input, init) => {
      requests.push({ input, init });
      return Response.json({
        content: {
          path: ".batch-governance/batches/demo.yml",
          sha: "file-sha",
        },
      });
    };
    const client = createGitHubLiteClient({ token: "ghp_test", fetcher });

    await expect(
      client.putFile({
        owner: "always0ne",
        repo: "batchplane",
        path: ".batch-governance/batches/demo.yml",
        branch: "batchplane/register/demo",
        message: "Register batch demo",
        content: "name: 데모\n",
      }),
    ).resolves.toEqual({
      path: ".batch-governance/batches/demo.yml",
      sha: "file-sha",
    });

    const body = JSON.parse(requests[0]?.init?.body?.toString() ?? "{}") as {
      content: string;
    };

    expect(new TextDecoder().decode(base64ToBytes(body.content))).toBe(
      "name: 데모\n",
    );
  });

  it("can put pre-encoded base64 file content", async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> =
      [];
    const fetcher: typeof fetch = async (input, init) => {
      requests.push({ input, init });
      return Response.json({
        content: {
          path: ".batch-governance/batches/demo/artifacts/app.bin",
          sha: "file-sha",
        },
      });
    };
    const client = createGitHubLiteClient({ token: "ghp_test", fetcher });

    await client.putFile({
      owner: "always0ne",
      repo: "batchplane",
      path: ".batch-governance/batches/demo/artifacts/app.bin",
      branch: "batchplane/register/demo",
      message: "Register batch demo",
      content: "AQID",
      encoding: "base64",
    });

    const body = JSON.parse(requests[0]?.init?.body?.toString() ?? "{}") as {
      content: string;
    };

    expect(body.content).toBe("AQID");
  });

  it("creates a pull request", async () => {
    const fetcher: typeof fetch = async () =>
      Response.json({
        number: 12,
        title: "Register batch demo",
        html_url: "https://github.com/always0ne/batchplane/pull/12",
        body: "body",
        state: "open",
        merged: false,
        user: { login: "always0ne" },
        head: { ref: "batchplane/register/demo" },
        base: { ref: "main" },
      });
    const client = createGitHubLiteClient({ token: "ghp_test", fetcher });

    await expect(
      client.createPullRequest({
        owner: "always0ne",
        repo: "batchplane",
        title: "Register batch demo",
        body: "body",
        head: "batchplane/register/demo",
        base: "main",
      }),
    ).resolves.toEqual({
      number: 12,
      title: "Register batch demo",
      url: "https://github.com/always0ne/batchplane/pull/12",
      head: "batchplane/register/demo",
      base: "main",
      state: "open",
      author: "always0ne",
      body: "body",
      merged: false,
    });
  });

  it("lists pull requests with filters", async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> =
      [];
    const fetcher: typeof fetch = async (input, init) => {
      requests.push({ input, init });
      return Response.json([
        {
          number: 12,
          title: "Register batch demo",
          html_url: "https://github.com/always0ne/batchplane/pull/12",
          body: null,
          state: "open",
          merged: false,
          user: { login: "always0ne" },
          head: { ref: "batchplane/register/demo" },
          base: { ref: "main" },
        },
      ]);
    };
    const client = createGitHubLiteClient({ token: "ghp_test", fetcher });

    await expect(
      client.listPullRequests({
        owner: "always0ne",
        repo: "batchplane",
        state: "open",
        base: "main",
      }),
    ).resolves.toEqual([
      {
        number: 12,
        title: "Register batch demo",
        url: "https://github.com/always0ne/batchplane/pull/12",
        head: "batchplane/register/demo",
        base: "main",
        state: "open",
        author: "always0ne",
        body: "",
        merged: false,
      },
    ]);

    expect(requests[0]?.input.toString()).toBe(
      "https://api.github.com/repos/always0ne/batchplane/pulls?base=main&state=open",
    );
  });

  it("merges a pull request with a squash merge", async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> =
      [];
    const fetcher: typeof fetch = async (input, init) => {
      requests.push({ input, init });
      return Response.json({
        merged: true,
        message: "Pull Request successfully merged",
        sha: "merge-sha",
      });
    };
    const client = createGitHubLiteClient({ token: "ghp_test", fetcher });

    await expect(
      client.mergePullRequest({
        owner: "always0ne",
        repo: "batchplane",
        pullNumber: 12,
        commitTitle: "Register batch demo (#12)",
      }),
    ).resolves.toEqual({
      merged: true,
      message: "Pull Request successfully merged",
      sha: "merge-sha",
    });

    expect(requests[0]?.input.toString()).toBe(
      "https://api.github.com/repos/always0ne/batchplane/pulls/12/merge",
    );
    expect(JSON.parse(requests[0]?.init?.body?.toString() ?? "{}")).toEqual({
      commit_title: "Register batch demo (#12)",
      merge_method: "squash",
    });
  });

  it("closes an issue-backed pull request", async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> =
      [];
    const fetcher: typeof fetch = async (input, init) => {
      requests.push({ input, init });
      return Response.json({
        number: 12,
        title: "Register batch demo",
        body: null,
        labels: [],
        html_url: "https://github.com/always0ne/batchplane/pull/12",
        state: "closed",
        user: { login: "always0ne" },
      });
    };
    const client = createGitHubLiteClient({ token: "ghp_test", fetcher });

    await expect(
      client.closeIssue({
        owner: "always0ne",
        repo: "batchplane",
        issueNumber: 12,
      }),
    ).resolves.toBeUndefined();

    expect(requests[0]?.input.toString()).toBe(
      "https://api.github.com/repos/always0ne/batchplane/issues/12",
    );
    expect(JSON.parse(requests[0]?.init?.body?.toString() ?? "{}")).toEqual({
      state: "closed",
    });
  });

  it("creates an issue", async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> =
      [];
    const fetcher: typeof fetch = async (input, init) => {
      requests.push({ input, init });
      return Response.json({
        number: 34,
        title: "Run batch payment.daily-close",
        body: "body",
        labels: [],
        html_url: "https://github.com/always0ne/batchplane/issues/34",
        state: "open",
        user: { login: "always0ne" },
      });
    };
    const client = createGitHubLiteClient({ token: "ghp_test", fetcher });

    await expect(
      client.createIssue({
        owner: "always0ne",
        repo: "batchplane",
        title: "Run batch payment.daily-close",
        body: "body",
        labels: [],
      }),
    ).resolves.toEqual({
      number: 34,
      title: "Run batch payment.daily-close",
      body: "body",
      labels: [],
      url: "https://github.com/always0ne/batchplane/issues/34",
      state: "open",
      author: "always0ne",
      isPullRequest: false,
    });

    expect(requests[0]?.input.toString()).toBe(
      "https://api.github.com/repos/always0ne/batchplane/issues",
    );
    expect(JSON.parse(requests[0]?.init?.body?.toString() ?? "{}")).toEqual({
      body: "body",
      labels: [],
      title: "Run batch payment.daily-close",
    });
  });

  it("lists issues", async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> =
      [];
    const fetcher: typeof fetch = async (input, init) => {
      requests.push({ input, init });
      return Response.json([
        {
          number: 34,
          title: "Run batch payment.daily-close",
          body: "body",
          labels: [],
          html_url: "https://github.com/always0ne/batchplane/issues/34",
          state: "open",
          user: { login: "always0ne" },
        },
      ]);
    };
    const client = createGitHubLiteClient({ token: "ghp_test", fetcher });

    await expect(
      client.listIssues({
        owner: "always0ne",
        repo: "batchplane",
        state: "open",
      }),
    ).resolves.toEqual([
      {
        number: 34,
        title: "Run batch payment.daily-close",
        body: "body",
        labels: [],
        url: "https://github.com/always0ne/batchplane/issues/34",
        state: "open",
        author: "always0ne",
        isPullRequest: false,
      },
    ]);

    expect(requests[0]?.input.toString()).toBe(
      "https://api.github.com/repos/always0ne/batchplane/issues?state=open",
    );
  });

  it("updates an issue", async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> =
      [];
    const fetcher: typeof fetch = async (input, init) => {
      requests.push({ input, init });
      return Response.json({
        number: 34,
        title: "Run batch payment.daily-close (updated)",
        body: "updated body",
        labels: [{ name: "batchplane:execution-request" }],
        html_url: "https://github.com/always0ne/batchplane/issues/34",
        state: "open",
        user: { login: "always0ne" },
      });
    };
    const client = createGitHubLiteClient({ token: "ghp_test", fetcher });

    await expect(
      client.updateIssue({
        owner: "always0ne",
        repo: "batchplane",
        issueNumber: 34,
        title: "Run batch payment.daily-close (updated)",
        body: "updated body",
        labels: ["batchplane:execution-request"],
      }),
    ).resolves.toEqual({
      number: 34,
      title: "Run batch payment.daily-close (updated)",
      body: "updated body",
      labels: ["batchplane:execution-request"],
      url: "https://github.com/always0ne/batchplane/issues/34",
      state: "open",
      author: "always0ne",
      isPullRequest: false,
    });

    expect(requests[0]?.input.toString()).toBe(
      "https://api.github.com/repos/always0ne/batchplane/issues/34",
    );
    expect(JSON.parse(requests[0]?.init?.body?.toString() ?? "{}")).toEqual({
      body: "updated body",
      labels: ["batchplane:execution-request"],
      title: "Run batch payment.daily-close (updated)",
    });
  });

  it("searches issues in repository scope", async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> =
      [];
    const fetcher: typeof fetch = async (input, init) => {
      requests.push({ input, init });
      return Response.json({
        items: [
          {
            number: 34,
            title: "Run batch payment.daily-close",
            body: "body",
            labels: [{ name: "batchplane:execution-request" }],
            html_url: "https://github.com/always0ne/batchplane/issues/34",
            state: "open",
            user: { login: "always0ne" },
          },
        ],
      });
    };
    const client = createGitHubLiteClient({ token: "ghp_test", fetcher });

    await expect(
      client.searchIssues({
        owner: "always0ne",
        repo: "batchplane",
        query: "daily close",
        state: "open",
        labels: ["batchplane:execution-request"],
      }),
    ).resolves.toEqual([
      {
        number: 34,
        title: "Run batch payment.daily-close",
        body: "body",
        labels: ["batchplane:execution-request"],
        url: "https://github.com/always0ne/batchplane/issues/34",
        state: "open",
        author: "always0ne",
        isPullRequest: false,
      },
    ]);

    expect(requests[0]?.input.toString()).toContain(
      "https://api.github.com/search/issues?q=",
    );
    const requestUrl = new URL(requests[0]?.input.toString() ?? "");
    expect(requestUrl.searchParams.get("q")).toBe(
      "repo:always0ne/batchplane is:issue state:open label:batchplane:execution-request daily close",
    );
  });

  it("lists issue events", async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> =
      [];
    const fetcher: typeof fetch = async (input, init) => {
      requests.push({ input, init });
      return Response.json([
        {
          id: 1,
          event: "labeled",
          created_at: "2026-05-14T01:05:00.000Z",
          actor: { login: "maintainer" },
          label: {
            name: "batchplane:dispatched",
            color: "059669",
            description: "BatchPlane request was dispatched",
          },
        },
      ]);
    };
    const client = createGitHubLiteClient({ token: "ghp_test", fetcher });

    await expect(
      client.listIssueEvents({
        owner: "always0ne",
        repo: "batchplane",
        issueNumber: 34,
      }),
    ).resolves.toEqual([
      {
        id: 1,
        event: "labeled",
        actor: "maintainer",
        createdAt: "2026-05-14T01:05:00.000Z",
        label: {
          name: "batchplane:dispatched",
          color: "059669",
          description: "BatchPlane request was dispatched",
        },
      },
    ]);

    expect(requests[0]?.input.toString()).toBe(
      "https://api.github.com/repos/always0ne/batchplane/issues/34/events",
    );
  });

  it("reads workflow runs and job summaries", async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> =
      [];
    const fetcher: typeof fetch = async (input, init) => {
      requests.push({ input, init });

      if (requests.length === 1) {
        return Response.json({
          workflows: [
            {
              id: 101,
              name: "BatchPlane - Daily Close",
              path: ".github/workflows/payment.daily-close.yml",
              state: "active",
              html_url:
                "https://github.com/always0ne/batchplane/actions/workflows/payment.daily-close.yml",
            },
          ],
        });
      }

      if (requests.length === 2) {
        return Response.json({
          workflow_runs: [
            {
              id: 200,
              workflow_id: 101,
              name: "BatchPlane - Daily Close",
              display_title:
                "BatchPlane payment.daily-close btr-20260514010400-payment-daily-close-abc12345",
              status: "completed",
              conclusion: "success",
              html_url:
                "https://github.com/always0ne/batchplane/actions/runs/200",
              event: "workflow_dispatch",
              actor: { login: "github-actions[bot]" },
              run_attempt: 1,
              created_at: "2026-05-14T01:07:00.000Z",
              run_started_at: "2026-05-14T01:07:10.000Z",
              updated_at: "2026-05-14T01:09:00.000Z",
              path: ".github/workflows/payment.daily-close.yml",
            },
          ],
        });
      }

      return Response.json({
        jobs: [
          {
            id: 300,
            name: "BatchPlane Gate",
            status: "completed",
            conclusion: "success",
            started_at: "2026-05-14T01:07:10.000Z",
            completed_at: "2026-05-14T01:07:20.000Z",
            html_url:
              "https://github.com/always0ne/batchplane/actions/runs/200/job/300",
          },
        ],
      });
    };
    const client = createGitHubLiteClient({ token: "ghp_test", fetcher });

    await expect(
      client.listWorkflows({ owner: "always0ne", repo: "batchplane" }),
    ).resolves.toEqual([
      {
        id: 101,
        name: "BatchPlane - Daily Close",
        path: ".github/workflows/payment.daily-close.yml",
        state: "active",
        url: "https://github.com/always0ne/batchplane/actions/workflows/payment.daily-close.yml",
      },
    ]);

    await expect(
      client.listWorkflowRuns({
        owner: "always0ne",
        repo: "batchplane",
        event: "workflow_dispatch",
        workflowId: 101,
      }),
    ).resolves.toEqual([
      {
        actor: "github-actions[bot]",
        conclusion: "success",
        createdAt: "2026-05-14T01:07:00.000Z",
        displayTitle:
          "BatchPlane payment.daily-close btr-20260514010400-payment-daily-close-abc12345",
        event: "workflow_dispatch",
        id: 200,
        name: "BatchPlane - Daily Close",
        runAttempt: 1,
        startedAt: "2026-05-14T01:07:10.000Z",
        status: "completed",
        updatedAt: "2026-05-14T01:09:00.000Z",
        url: "https://github.com/always0ne/batchplane/actions/runs/200",
        workflowId: 101,
        workflowPath: ".github/workflows/payment.daily-close.yml",
      },
    ]);

    await expect(
      client.listWorkflowRunJobs({
        owner: "always0ne",
        repo: "batchplane",
        runId: 200,
      }),
    ).resolves.toEqual([
      {
        completedAt: "2026-05-14T01:07:20.000Z",
        conclusion: "success",
        id: 300,
        name: "BatchPlane Gate",
        startedAt: "2026-05-14T01:07:10.000Z",
        status: "completed",
        url: "https://github.com/always0ne/batchplane/actions/runs/200/job/300",
      },
    ]);

    expect(requests[1]?.input.toString()).toBe(
      "https://api.github.com/repos/always0ne/batchplane/actions/workflows/101/runs?event=workflow_dispatch&per_page=30",
    );
    expect(requests[2]?.input.toString()).toBe(
      "https://api.github.com/repos/always0ne/batchplane/actions/runs/200/jobs",
    );
  });

  it("lists and creates labels", async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> =
      [];
    const fetcher: typeof fetch = async (input, init) => {
      requests.push({ input, init });

      if (requests.length === 1) {
        return Response.json([
          {
            name: "batchplane:execution-request",
            color: "0F766E",
            description: "BatchPlane execution request",
          },
        ]);
      }

      return Response.json({
        name: "batchplane:dispatching",
        color: "2563EB",
        description: "BatchPlane request is dispatching",
      });
    };
    const client = createGitHubLiteClient({ token: "ghp_test", fetcher });

    await expect(
      client.listLabels({ owner: "always0ne", repo: "batchplane" }),
    ).resolves.toEqual([
      {
        name: "batchplane:execution-request",
        color: "0F766E",
        description: "BatchPlane execution request",
      },
    ]);

    await expect(
      client.createLabel({
        owner: "always0ne",
        repo: "batchplane",
        name: "batchplane:dispatching",
        color: "2563EB",
        description: "BatchPlane request is dispatching",
      }),
    ).resolves.toEqual({
      name: "batchplane:dispatching",
      color: "2563EB",
      description: "BatchPlane request is dispatching",
    });

    expect(requests[0]?.input.toString()).toBe(
      "https://api.github.com/repos/always0ne/batchplane/labels",
    );
    expect(requests[1]?.input.toString()).toBe(
      "https://api.github.com/repos/always0ne/batchplane/labels",
    );
    expect(JSON.parse(requests[1]?.init?.body?.toString() ?? "{}")).toEqual({
      name: "batchplane:dispatching",
      color: "2563EB",
      description: "BatchPlane request is dispatching",
    });
  });

  it("removes an issue label", async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> =
      [];
    const fetcher: typeof fetch = async (input, init) => {
      requests.push({ input, init });
      return Response.json({});
    };
    const client = createGitHubLiteClient({ token: "ghp_test", fetcher });

    await expect(
      client.removeIssueLabel({
        owner: "always0ne",
        repo: "batchplane",
        issueNumber: 34,
        label: "batchplane:dispatching",
      }),
    ).resolves.toBeUndefined();

    expect(requests[0]?.input.toString()).toBe(
      "https://api.github.com/repos/always0ne/batchplane/issues/34/labels/batchplane%3Adispatching",
    );
    expect(requests[0]?.init?.method).toBe("DELETE");
  });

  it("reads repository permission for a collaborator", async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> =
      [];
    const fetcher: typeof fetch = async (input, init) => {
      requests.push({ input, init });
      return Response.json({
        permission: "write",
        role_name: "maintain",
        user: { login: "maintainer" },
      });
    };
    const client = createGitHubLiteClient({ token: "ghp_test", fetcher });

    await expect(
      client.getRepositoryPermissionForUser({
        owner: "always0ne",
        repo: "batchplane",
        username: "maintainer",
      }),
    ).resolves.toEqual({
      permission: "maintain",
      roleName: "maintain",
      username: "maintainer",
    });

    expect(requests[0]?.input.toString()).toBe(
      "https://api.github.com/repos/always0ne/batchplane/collaborators/maintainer/permission",
    );
  });

  it("maps missing collaborator permission lookup to none", async () => {
    const fetcher: typeof fetch = async () =>
      Response.json({ message: "Not Found" }, { status: 404 });
    const client = createGitHubLiteClient({ token: "ghp_test", fetcher });

    await expect(
      client.getRepositoryPermissionForUser({
        owner: "always0ne",
        repo: "batchplane",
        username: "contractor",
      }),
    ).resolves.toEqual({
      permission: "none",
      roleName: "none",
      username: "contractor",
    });
  });

  it("reads team membership and returns null when user is not in team", async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> =
      [];
    const fetcher: typeof fetch = async (input, init) => {
      requests.push({ input, init });

      if (requests.length === 1) {
        return Response.json({
          state: "active",
          role: "maintainer",
        });
      }

      return Response.json({ message: "Not Found" }, { status: 404 });
    };
    const client = createGitHubLiteClient({ token: "ghp_test", fetcher });

    await expect(
      client.getTeamMembershipForUser({
        org: "always0ne",
        teamSlug: "platform-ops",
        username: "maintainer",
      }),
    ).resolves.toEqual({
      org: "always0ne",
      role: "maintainer",
      state: "active",
      teamSlug: "platform-ops",
      username: "maintainer",
    });

    await expect(
      client.getTeamMembershipForUser({
        org: "always0ne",
        teamSlug: "platform-ops",
        username: "contractor",
      }),
    ).resolves.toBeNull();

    expect(requests[0]?.input.toString()).toBe(
      "https://api.github.com/orgs/always0ne/teams/platform-ops/memberships/maintainer",
    );
    expect(requests[1]?.input.toString()).toBe(
      "https://api.github.com/orgs/always0ne/teams/platform-ops/memberships/contractor",
    );
  });

  it("maps GitHub API errors", async () => {
    const fetcher: typeof fetch = async () =>
      Response.json({ message: "Bad credentials" }, { status: 401 });
    const client = createGitHubLiteClient({ token: "ghp_test", fetcher });

    await expect(client.getCurrentUser()).rejects.toMatchObject({
      code: "unauthorized",
      message: "Bad credentials",
      status: 401,
    });
  });
});

describe("createMockGitHubLiteClient", () => {
  it("provides execution fixtures for every BatchPlane request state", () => {
    const state = createGitHubLiteMockState();

    expect(
      new Set(state.executionScenarios.map((scenario) => scenario.state)),
    ).toEqual(
      new Set([
        "requested",
        "approved",
        "dispatching",
        "dispatched",
        "business-failed",
        "rejected",
        "failed",
        "gate-blocked",
      ]),
    );
    expect(state.issues).toHaveLength(8);
    expect(
      state.issueComments.some((comment) =>
        comment.body.startsWith("/bgcp approve "),
      ),
    ).toBe(true);
    expect(state.labels.map((label) => label.name)).toEqual(
      expect.arrayContaining([
        "batchplane:execution-request",
        "batchplane:dispatching",
        "batchplane:dispatched",
        "batchplane:dispatch-failed",
        "batchplane:gate-blocked",
      ]),
    );
    expect(state.workflows.map((workflow) => workflow.path)).toEqual(
      expect.arrayContaining([
        ".github/workflows/batchplane-dispatcher.yml",
        ".github/workflows/payment.daily-close.yml",
      ]),
    );
    expect(state.workflowRuns.map((run) => run.conclusion)).toEqual(
      expect.arrayContaining(["success", "failure", null]),
    );
  });

  it("implements repository, file, issue, pull request, label, and comment APIs in memory", async () => {
    const client = createMockGitHubLiteClient();
    const repo = { owner: "always0ne", repo: "batch" };

    await expect(client.getCurrentUser()).resolves.toEqual({
      login: "maintainer",
    });
    await expect(client.getRepository(repo)).resolves.toMatchObject({
      defaultBranch: "main",
      private: true,
    });
    await expect(
      client.getRepositoryPermissionForUser({
        ...repo,
        username: "maintainer",
      }),
    ).resolves.toEqual({
      permission: "maintain",
      roleName: "maintain",
      username: "maintainer",
    });
    await expect(
      client.getRepositoryPermissionForUser({
        ...repo,
        username: "unknown-user",
      }),
    ).resolves.toEqual({
      permission: "none",
      roleName: "none",
      username: "unknown-user",
    });
    await expect(
      client.getTeamMembershipForUser({
        org: "always0ne",
        teamSlug: "platform-ops",
        username: "maintainer",
      }),
    ).resolves.toEqual({
      org: "always0ne",
      role: "maintainer",
      state: "active",
      teamSlug: "platform-ops",
      username: "maintainer",
    });
    await expect(
      client.getTeamMembershipForUser({
        org: "always0ne",
        teamSlug: "platform-ops",
        username: "unknown-user",
      }),
    ).resolves.toBeNull();
    await expect(
      client.getDirectory({
        ...repo,
        path: ".batch-governance/batches",
        ref: "main",
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "payment.daily-close.yml",
          type: "file",
        }),
      ]),
    );
    await expect(
      client.getFile({
        ...repo,
        path: ".batch-governance/batches/payment.daily-close.yml",
        ref: "main",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        content: expect.stringContaining('kind: "BatchDefinition"'),
      }),
    );

    await client.createBranch({
      ...repo,
      branch: "batchplane/register/mock",
      sha: "mock-main-sha",
    });
    await client.putFile({
      ...repo,
      branch: "batchplane/register/mock",
      content: "mock: true\n",
      message: "Add mock file",
      path: ".batch-governance/batches/mock.yml",
    });
    await expect(
      client.getFile({
        ...repo,
        path: ".batch-governance/batches/mock.yml",
        ref: "batchplane/register/mock",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        content: "mock: true\n",
      }),
    );

    const issue = await client.createIssue({
      ...repo,
      body: "body",
      labels: ["batchplane:execution-request"],
      title: "Run batch mock",
    });

    await client.updateIssue({
      ...repo,
      issueNumber: issue.number,
      body: "updated body",
      title: "Run batch mock (updated)",
    });

    await client.createLabel({
      ...repo,
      color: "9333EA",
      description: "Custom label",
      name: "custom:one",
    });

    await client.addIssueLabels({
      ...repo,
      issueNumber: issue.number,
      labels: ["batchplane:dispatching", "custom:one"],
    });
    await client.createIssueComment({
      ...repo,
      body: "/bgcp approve requestDigest=sha256:mock",
      issueNumber: issue.number,
    });
    await expect(
      client.listIssues({ ...repo, state: "open" }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          body: "updated body",
          labels: expect.arrayContaining(["batchplane:dispatching"]),
          number: issue.number,
          title: "Run batch mock (updated)",
        }),
      ]),
    );
    await expect(
      client.searchIssues({
        ...repo,
        query: "updated body",
        labels: ["custom:one"],
        state: "open",
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          number: issue.number,
        }),
      ]),
    );
    await expect(client.listLabels(repo)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "custom:one" })]),
    );
    await expect(
      client.listIssueEvents({ ...repo, issueNumber: issue.number }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: "commented" }),
        expect.objectContaining({ event: "labeled" }),
      ]),
    );
    await client.removeIssueLabel({
      ...repo,
      issueNumber: issue.number,
      label: "custom:one",
    });
    await expect(
      client.listIssues({ ...repo, state: "open" }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          labels: expect.not.arrayContaining(["custom:one"]),
        }),
      ]),
    );
    expect(client.state.issueComments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          body: "/bgcp approve requestDigest=sha256:mock",
          issueNumber: issue.number,
        }),
      ]),
    );

    const pullRequest = await client.createPullRequest({
      ...repo,
      base: "main",
      body: "body",
      head: "batchplane/register/mock",
      title: "Register batch mock",
    });

    await expect(
      client.listPullRequests({ ...repo, base: "main", state: "open" }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          number: pullRequest.number,
          title: "Register batch mock",
        }),
      ]),
    );
    await expect(
      client.mergePullRequest({
        ...repo,
        pullNumber: pullRequest.number,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        merged: true,
      }),
    );
    await expect(
      client.listPullRequests({ ...repo, state: "closed" }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          merged: true,
          number: pullRequest.number,
        }),
      ]),
    );
  });

  it("tracks execution request approval and dispatcher transitions in memory", async () => {
    const client = createMockGitHubLiteClient(
      createGitHubLiteMockState({
        executionScenarios: [],
        issueComments: [],
        issues: [],
        workflowRuns: [],
      }),
    );
    const repo = { owner: "always0ne", repo: "batch" };
    const request = createExecutionRequestFixture();
    const issue = await client.createIssue({
      ...repo,
      body: buildExecutionRequestBody(request),
      labels: ["batchplane:execution-request"],
      title: `Run batch ${request.batchId}`,
    });

    expect(findExecutionScenario(client, issue.number)?.state).toBe(
      "requested",
    );

    const approvalComment = await client.createIssueComment({
      ...repo,
      body: buildExecutionApprovalComment(request),
      issueNumber: issue.number,
    });

    expect(approvalComment.body).toMatch(
      /^\/bgcp approve requestDigest=sha256:/,
    );
    expect(findExecutionScenario(client, issue.number)?.state).toBe("approved");

    await client.createIssueComment({
      ...repo,
      body: buildDispatcherStatusComment(request, "DISPATCHING"),
      issueNumber: issue.number,
    });

    expect(findExecutionScenario(client, issue.number)?.state).toBe(
      "dispatching",
    );
    expect(findIssue(client, issue.number)?.labels).toEqual(
      expect.arrayContaining(["batchplane:dispatching"]),
    );

    await client.createIssueComment({
      ...repo,
      body: buildDispatcherStatusComment(request, "DISPATCHED"),
      issueNumber: issue.number,
    });

    expect(findExecutionScenario(client, issue.number)?.state).toBe(
      "dispatched",
    );
    expect(findIssue(client, issue.number)).toMatchObject({
      labels: expect.arrayContaining(["batchplane:dispatched"]),
      state: "closed",
    });
    expect(findIssue(client, issue.number)?.labels).not.toContain(
      "batchplane:dispatching",
    );
    expect(
      client.state.workflowRuns.find(
        (workflowRun) => workflowRun.requestId === request.requestId,
      ),
    ).toMatchObject({
      conclusion: "success",
      status: "completed",
    });
  });

  it("tracks execution request rejection comments in memory", async () => {
    const client = createMockGitHubLiteClient(
      createGitHubLiteMockState({
        executionScenarios: [],
        issueComments: [],
        issues: [],
      }),
    );
    const repo = { owner: "always0ne", repo: "batch" };
    const request = createExecutionRequestFixture();
    const issue = await client.createIssue({
      ...repo,
      body: buildExecutionRequestBody(request),
      labels: ["batchplane:execution-request"],
      title: `Run batch ${request.batchId}`,
    });

    await client.createIssueComment({
      ...repo,
      body: buildExecutionRejectionComment(request),
      issueNumber: issue.number,
    });

    expect(findExecutionScenario(client, issue.number)?.state).toBe("rejected");
    expect(findIssue(client, issue.number)).toMatchObject({
      labels: expect.arrayContaining(["batchplane:rejected"]),
      state: "closed",
    });
  });

  it("does not treat label-only execution approval as approved", async () => {
    const client = createMockGitHubLiteClient(
      createGitHubLiteMockState({
        executionScenarios: [],
        issueComments: [],
        issues: [],
      }),
    );
    const repo = { owner: "always0ne", repo: "batch" };
    const request = createExecutionRequestFixture();
    const issue = await client.createIssue({
      ...repo,
      body: buildExecutionRequestBody(request),
      labels: ["batchplane:execution-request"],
      title: `Run batch ${request.batchId}`,
    });

    await client.addIssueLabels({
      ...repo,
      issueNumber: issue.number,
      labels: ["batchplane:approved"],
    });

    expect(findExecutionScenario(client, issue.number)?.state).toBe(
      "requested",
    );
    expect(
      client.state.issueComments.some((comment) =>
        comment.body.startsWith("/bgcp approve "),
      ),
    ).toBe(false);
  });

  it("resets mutated mock state back to the initial fixture", async () => {
    const client = createMockGitHubLiteClient();
    const repo = { owner: "always0ne", repo: "batch" };
    const initialIssueCount = client.state.issues.length;
    const issue = await client.createIssue({
      ...repo,
      body: "body",
      labels: ["batchplane:execution-request"],
      title: "Run batch reset-test",
    });

    expect(client.state.issues).toHaveLength(initialIssueCount + 1);

    client.reset();

    expect(client.state.issues).toHaveLength(initialIssueCount);
    expect(
      client.state.issues.some(
        (candidate) => candidate.number === issue.number,
      ),
    ).toBe(false);
  });

  it("loads an extended fixture when reset receives explicit state", () => {
    const client = createMockGitHubLiteClient();
    const customState = createGitHubLiteMockState({
      issueComments: [],
      issues: [],
      pullRequests: [],
    });

    client.reset(customState);

    expect(client.state.issues).toEqual([]);
    expect(client.state.issueComments).toEqual([]);
    expect(client.state.pullRequests).toEqual([]);
    expect(client.state.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ".github/workflows/batchplane-dispatcher.yml",
        }),
      ]),
    );
  });
});

function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function createExecutionRequestFixture() {
  return {
    batchId: "payment.daily-close",
    requestDigest:
      "sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    requestId: "btr-20260514010203-payment.daily-close-abcdef12",
  };
}

function buildExecutionRequestBody({
  batchId,
  requestDigest,
  requestId,
}: ReturnType<typeof createExecutionRequestFixture>): string {
  return [
    "## BatchPlane Execution Request",
    "",
    `- Request ID: \`${requestId}\``,
    `- Batch ID: \`${batchId}\``,
    "- Requested by: @developer",
    "- Requested at: 2026-05-14T01:02:03.000Z",
    "- Expires at: 2026-05-14T02:02:03.000Z",
    `- Request digest: \`${requestDigest}\``,
    "- Status: REQUESTED",
    "",
    "<!-- batchplane:execution-request",
    `requestId=${requestId}`,
    `batchId=${batchId}`,
    `requestDigest=${requestDigest}`,
    "status=REQUESTED",
    "-->",
  ].join("\n");
}

function buildExecutionApprovalComment({
  batchId,
  requestDigest,
  requestId,
}: ReturnType<typeof createExecutionRequestFixture>): string {
  return [
    `/bgcp approve requestDigest=${requestDigest}`,
    "",
    "## BatchPlane Execution Approval",
    "",
    "- Decision: APPROVED",
    "- Approver: @maintainer",
    "- Approved at: 2026-05-14T01:05:00.000Z",
    `- Request ID: \`${requestId}\``,
    `- Batch ID: \`${batchId}\``,
    `- Request digest: \`${requestDigest}\``,
    "",
    "<!-- batchplane:execution-approval",
    "decision=APPROVED",
    `requestId=${requestId}`,
    `batchId=${batchId}`,
    `requestDigest=${requestDigest}`,
    "-->",
  ].join("\n");
}

function buildExecutionRejectionComment({
  batchId,
  requestDigest,
  requestId,
}: ReturnType<typeof createExecutionRequestFixture>): string {
  return [
    "## BatchPlane Execution Approval",
    "",
    "- Decision: REJECTED",
    "- Rejector: @maintainer",
    "- Rejected at: 2026-05-14T01:06:00.000Z",
    `- Request ID: \`${requestId}\``,
    `- Batch ID: \`${batchId}\``,
    `- Request digest: \`${requestDigest}\``,
    "",
    "<!-- batchplane:execution-approval",
    "decision=REJECTED",
    `requestId=${requestId}`,
    `batchId=${batchId}`,
    `requestDigest=${requestDigest}`,
    "-->",
  ].join("\n");
}

function buildDispatcherStatusComment(
  {
    batchId,
    requestDigest,
    requestId,
  }: ReturnType<typeof createExecutionRequestFixture>,
  status: "DISPATCHING" | "DISPATCHED" | "DISPATCH_FAILED",
): string {
  return [
    `## BatchPlane Dispatcher ${status}`,
    "",
    `- Status: ${status}`,
    `- Request ID: \`${requestId}\``,
    `- Batch ID: \`${batchId}\``,
    `- Request digest: \`${requestDigest}\``,
    "",
    "<!-- batchplane:bgcp:dispatcher",
    `status=${status}`,
    `requestId=${requestId}`,
    `batchId=${batchId}`,
    `requestDigest=${requestDigest}`,
    "-->",
  ].join("\n");
}

function findExecutionScenario(
  client: ReturnType<typeof createMockGitHubLiteClient>,
  issueNumber: number,
) {
  return client.state.executionScenarios.find(
    (scenario) => scenario.issueNumber === issueNumber,
  );
}

function findIssue(
  client: ReturnType<typeof createMockGitHubLiteClient>,
  issueNumber: number,
) {
  return client.state.issues.find((issue) => issue.number === issueNumber);
}
