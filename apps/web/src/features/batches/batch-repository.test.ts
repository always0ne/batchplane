import { describe, expect, it } from "vitest";

import type { GitHubLiteClient } from "@batchplane/github-lite";

import {
  batchDefinitionDirectory,
  isBatchDefinitionFile,
  loadBatchDefinitions,
} from "./batch-repository";

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
