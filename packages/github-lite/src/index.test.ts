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
      client.getFile({ owner: "always0ne", repo: "batchtrail", path: "x.yml" }),
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
        repo: "batchtrail",
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
        repo: "batchtrail",
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
        repo: "batchtrail",
        branch: "batchtrail/register/demo",
        sha: "base-sha",
      }),
    ).resolves.toBeUndefined();

    expect(requests[0]?.input.toString()).toBe(
      "https://api.github.com/repos/always0ne/batchtrail/git/refs",
    );
    expect(JSON.parse(requests[0]?.init?.body?.toString() ?? "{}")).toEqual({
      ref: "refs/heads/batchtrail/register/demo",
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
        repo: "batchtrail",
        path: ".batch-governance/batches/demo.yml",
        branch: "batchtrail/register/demo",
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
      repo: "batchtrail",
      path: ".batch-governance/batches/demo/artifacts/app.bin",
      branch: "batchtrail/register/demo",
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
        html_url: "https://github.com/always0ne/batchtrail/pull/12",
        body: "body",
        state: "open",
        merged: false,
        user: { login: "always0ne" },
        head: { ref: "batchtrail/register/demo" },
        base: { ref: "main" },
      });
    const client = createGitHubLiteClient({ token: "ghp_test", fetcher });

    await expect(
      client.createPullRequest({
        owner: "always0ne",
        repo: "batchtrail",
        title: "Register batch demo",
        body: "body",
        head: "batchtrail/register/demo",
        base: "main",
      }),
    ).resolves.toEqual({
      number: 12,
      title: "Register batch demo",
      url: "https://github.com/always0ne/batchtrail/pull/12",
      head: "batchtrail/register/demo",
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
          html_url: "https://github.com/always0ne/batchtrail/pull/12",
          body: null,
          state: "open",
          merged: false,
          user: { login: "always0ne" },
          head: { ref: "batchtrail/register/demo" },
          base: { ref: "main" },
        },
      ]);
    };
    const client = createGitHubLiteClient({ token: "ghp_test", fetcher });

    await expect(
      client.listPullRequests({
        owner: "always0ne",
        repo: "batchtrail",
        state: "open",
        base: "main",
      }),
    ).resolves.toEqual([
      {
        number: 12,
        title: "Register batch demo",
        url: "https://github.com/always0ne/batchtrail/pull/12",
        head: "batchtrail/register/demo",
        base: "main",
        state: "open",
        author: "always0ne",
        body: "",
        merged: false,
      },
    ]);

    expect(requests[0]?.input.toString()).toBe(
      "https://api.github.com/repos/always0ne/batchtrail/pulls?base=main&state=open",
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
        repo: "batchtrail",
        pullNumber: 12,
        commitTitle: "Register batch demo (#12)",
      }),
    ).resolves.toEqual({
      merged: true,
      message: "Pull Request successfully merged",
      sha: "merge-sha",
    });

    expect(requests[0]?.input.toString()).toBe(
      "https://api.github.com/repos/always0ne/batchtrail/pulls/12/merge",
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
        html_url: "https://github.com/always0ne/batchtrail/pull/12",
        state: "closed",
        user: { login: "always0ne" },
      });
    };
    const client = createGitHubLiteClient({ token: "ghp_test", fetcher });

    await expect(
      client.closeIssue({
        owner: "always0ne",
        repo: "batchtrail",
        issueNumber: 12,
      }),
    ).resolves.toBeUndefined();

    expect(requests[0]?.input.toString()).toBe(
      "https://api.github.com/repos/always0ne/batchtrail/issues/12",
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
        html_url: "https://github.com/always0ne/batchtrail/issues/34",
        state: "open",
        user: { login: "always0ne" },
      });
    };
    const client = createGitHubLiteClient({ token: "ghp_test", fetcher });

    await expect(
      client.createIssue({
        owner: "always0ne",
        repo: "batchtrail",
        title: "Run batch payment.daily-close",
        body: "body",
        labels: [],
      }),
    ).resolves.toEqual({
      number: 34,
      title: "Run batch payment.daily-close",
      body: "body",
      labels: [],
      url: "https://github.com/always0ne/batchtrail/issues/34",
      state: "open",
      author: "always0ne",
      isPullRequest: false,
    });

    expect(requests[0]?.input.toString()).toBe(
      "https://api.github.com/repos/always0ne/batchtrail/issues",
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
          html_url: "https://github.com/always0ne/batchtrail/issues/34",
          state: "open",
          user: { login: "always0ne" },
        },
      ]);
    };
    const client = createGitHubLiteClient({ token: "ghp_test", fetcher });

    await expect(
      client.listIssues({
        owner: "always0ne",
        repo: "batchtrail",
        state: "open",
      }),
    ).resolves.toEqual([
      {
        number: 34,
        title: "Run batch payment.daily-close",
        body: "body",
        labels: [],
        url: "https://github.com/always0ne/batchtrail/issues/34",
        state: "open",
        author: "always0ne",
        isPullRequest: false,
      },
    ]);

    expect(requests[0]?.input.toString()).toBe(
      "https://api.github.com/repos/always0ne/batchtrail/issues?state=open",
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
  it("provides execution fixtures for every BatchTrail request state", () => {
    const state = createGitHubLiteMockState();

    expect(
      new Set(state.executionScenarios.map((scenario) => scenario.state)),
    ).toEqual(
      new Set([
        "requested",
        "approved",
        "dispatching",
        "dispatched",
        "rejected",
        "failed",
        "gate-blocked",
      ]),
    );
    expect(state.issues).toHaveLength(7);
    expect(
      state.issueComments.some((comment) =>
        comment.body.startsWith("/bgcp approve "),
      ),
    ).toBe(true);
    expect(state.labels.map((label) => label.name)).toEqual(
      expect.arrayContaining([
        "batchtrail:execution-request",
        "batchtrail:dispatching",
        "batchtrail:dispatched",
        "batchtrail:dispatch-failed",
        "batchtrail:gate-blocked",
      ]),
    );
    expect(state.workflows.map((workflow) => workflow.path)).toEqual(
      expect.arrayContaining([
        ".github/workflows/batchtrail-dispatcher.yml",
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
      branch: "batchtrail/register/mock",
      sha: "mock-main-sha",
    });
    await client.putFile({
      ...repo,
      branch: "batchtrail/register/mock",
      content: "mock: true\n",
      message: "Add mock file",
      path: ".batch-governance/batches/mock.yml",
    });
    await expect(
      client.getFile({
        ...repo,
        path: ".batch-governance/batches/mock.yml",
        ref: "batchtrail/register/mock",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        content: "mock: true\n",
      }),
    );

    const issue = await client.createIssue({
      ...repo,
      body: "body",
      labels: ["batchtrail:execution-request"],
      title: "Run batch mock",
    });

    await client.addIssueLabels({
      ...repo,
      issueNumber: issue.number,
      labels: ["batchtrail:dispatching"],
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
          labels: expect.arrayContaining(["batchtrail:dispatching"]),
          number: issue.number,
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
      head: "batchtrail/register/mock",
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
      labels: ["batchtrail:execution-request"],
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
      expect.arrayContaining(["batchtrail:dispatching"]),
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
      labels: expect.arrayContaining(["batchtrail:dispatched"]),
      state: "closed",
    });
    expect(findIssue(client, issue.number)?.labels).not.toContain(
      "batchtrail:dispatching",
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
      labels: ["batchtrail:execution-request"],
      title: `Run batch ${request.batchId}`,
    });

    await client.createIssueComment({
      ...repo,
      body: buildExecutionRejectionComment(request),
      issueNumber: issue.number,
    });

    expect(findExecutionScenario(client, issue.number)?.state).toBe("rejected");
    expect(findIssue(client, issue.number)).toMatchObject({
      labels: expect.arrayContaining(["batchtrail:rejected"]),
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
      labels: ["batchtrail:execution-request"],
      title: `Run batch ${request.batchId}`,
    });

    await client.addIssueLabels({
      ...repo,
      issueNumber: issue.number,
      labels: ["batchtrail:approved"],
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
      labels: ["batchtrail:execution-request"],
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
          path: ".github/workflows/batchtrail-dispatcher.yml",
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
    "## BatchTrail Execution Request",
    "",
    `- Request ID: \`${requestId}\``,
    `- Batch ID: \`${batchId}\``,
    "- Requested by: @developer",
    "- Requested at: 2026-05-14T01:02:03.000Z",
    "- Expires at: 2026-05-14T02:02:03.000Z",
    `- Request digest: \`${requestDigest}\``,
    "- Status: REQUESTED",
    "",
    "<!-- batchtrail:execution-request",
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
    "## BatchTrail Execution Approval",
    "",
    "- Decision: APPROVED",
    "- Approver: @maintainer",
    "- Approved at: 2026-05-14T01:05:00.000Z",
    `- Request ID: \`${requestId}\``,
    `- Batch ID: \`${batchId}\``,
    `- Request digest: \`${requestDigest}\``,
    "",
    "<!-- batchtrail:execution-approval",
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
    "## BatchTrail Execution Approval",
    "",
    "- Decision: REJECTED",
    "- Rejector: @maintainer",
    "- Rejected at: 2026-05-14T01:06:00.000Z",
    `- Request ID: \`${requestId}\``,
    `- Batch ID: \`${batchId}\``,
    `- Request digest: \`${requestDigest}\``,
    "",
    "<!-- batchtrail:execution-approval",
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
    `## BatchTrail Dispatcher ${status}`,
    "",
    `- Status: ${status}`,
    `- Request ID: \`${requestId}\``,
    `- Batch ID: \`${batchId}\``,
    `- Request digest: \`${requestDigest}\``,
    "",
    "<!-- batchtrail:bgcp:dispatcher",
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
