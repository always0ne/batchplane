import { describe, expect, it } from "vitest";

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
              'apiVersion: "batchtrail.io/v1"',
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
});
