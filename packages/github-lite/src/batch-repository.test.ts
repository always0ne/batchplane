import { describe, expect, it } from "vitest";

import type { GitHubLiteClient } from "./github-types.js";

import {
  batchDefinitionDirectory,
  isBatchDefinitionFile,
  loadBatchDefinitions,
} from "./batch-repository.js";

describe("batch repository", () => {
  it("loads governed batch definitions from GitHub contents", async () => {
    const client: Pick<GitHubLiteClient, "getDirectory" | "getFile"> = {
      async getDirectory() {
        return [
          {
            name: "settlement.monthly.yml",
            path: ".batch-governance/batches/settlement.monthly.yml",
            sha: "b",
            type: "file",
          },
          {
            name: "payment.daily-close.yml",
            path: ".batch-governance/batches/payment.daily-close.yml",
            sha: "a",
            type: "file",
          },
          {
            name: "README.md",
            path: ".batch-governance/batches/README.md",
            sha: "c",
            type: "file",
          },
        ];
      },
      async getFile({ path }) {
        const batchId = path.includes("payment")
          ? "payment.daily-close"
          : "settlement.monthly";

        return {
          path,
          sha: "sha",
          content: [
            "apiVersion: batchplane.io/v1",
            "kind: BatchDefinition",
            "metadata:",
            `  id: "${batchId}"`,
            `  name: "${batchId}"`,
            "spec:",
            '  owner: "ops-team"',
            '  domain: "payments"',
            '  environment: "PROD"',
            '  criticality: "HIGH"',
            '  status: "ACTIVE"',
            "  workflow:",
            '    path: ".github/workflows/batch.yml"',
            '    ref: "main"',
            "  gateRequired: true",
            "",
          ].join("\n"),
        };
      },
    };

    await expect(
      loadBatchDefinitions({
        client: client as GitHubLiteClient,
        ref: "main",
        repository: { owner: "always0ne", repo: "batch" },
      }),
    ).resolves.toEqual([
      expect.objectContaining({ batchId: "payment.daily-close" }),
      expect.objectContaining({ batchId: "settlement.monthly" }),
    ]);
  });

  it("treats a missing batch directory as an empty repository", async () => {
    const client: Pick<GitHubLiteClient, "getDirectory" | "getFile"> = {
      async getDirectory() {
        return null;
      },
      async getFile() {
        return null;
      },
    };

    await expect(
      loadBatchDefinitions({
        client: client as GitHubLiteClient,
        ref: "main",
        repository: { owner: "always0ne", repo: "batch" },
      }),
    ).resolves.toEqual([]);
  });

  it("detects YAML files under the governed directory", () => {
    expect(
      isBatchDefinitionFile({
        name: "payment.yml",
        path: `${batchDefinitionDirectory}/payment.yml`,
        sha: "sha",
        type: "file",
      }),
    ).toBe(true);
    expect(
      isBatchDefinitionFile({
        name: "archive",
        path: `${batchDefinitionDirectory}/archive`,
        sha: "sha",
        type: "dir",
      }),
    ).toBe(false);
  });
});
import { createGitHubLiteClient } from "./github-client.js";
const session = { owner: "always0ne", repo: "batch" };
describe("GitHub batch directory transport", () => {
  it("loads batch definitions through encoded GitHub contents endpoints", async () => {
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
    const context = {
      client: createGitHubLiteClient({ token: "ghp_test", fetcher }),
      repositoryRef: session,
    };

    await expect(
      loadBatchDefinitions({
        client: context.client,
        repository: session,
        ref: "main",
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        batchId: "payment.daily-close",
        gateRequired: true,
        status: "ACTIVE",
      }),
    ]);
  });
});
