import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Workspace dependency boundaries", () => {
  it("keeps the shared page and hooks free of provider connection and storage ownership", () => {
    const directory = resolve("src/pages/workspace");
    for (const name of readdirSync(directory).filter(
      (name) => /\.tsx?$/.test(name) && !name.includes(".test."),
    )) {
      const source = readFileSync(resolve(directory, name), "utf8");
      expect(source, name).not.toMatch(
        /from ["'][^"']*(?:runtime|github-lite|github-session|@batchplane\/domain)/,
      );
      expect(source, name).not.toMatch(
        /sessionStorage|localStorage|createRuntime|readRuntimeSession|GitHubSession|\.batch-governance|workflow_dispatch|settings:github/,
      );
    }
    const contract = readFileSync(
      resolve("../../packages/ui-client/src/workspace.ts"),
      "utf8",
    );
    expect(contract).not.toMatch(
      /GitHub|token|sessionStorage|localStorage|RepoRef/,
    );
    expect(
      existsSync(resolve("src/features/lite-setup/LiteSetupPage.tsx")),
    ).toBe(false);
    expect(
      existsSync(resolve("src/features/lite-setup/installation-model.ts")),
    ).toBe(false);
  });

  it("keeps installation and settings adapters independent from React and app sources", () => {
    const directory = resolve("../../packages/github-lite/src");
    for (const name of readdirSync(directory).filter(
      (name) =>
        name.startsWith("workspace-") &&
        name.endsWith(".ts") &&
        !name.includes(".test."),
    )) {
      expect(readFileSync(resolve(directory, name), "utf8"), name).not.toMatch(
        /from ["'][^"']*(?:apps\/web|react|runtime-fixtures)/,
      );
    }
    const composition = readFileSync(
      resolve("src/app/LiteWorkspaceRoute.tsx"),
      "utf8",
    );
    expect(composition).toContain("<GitHubConnectionForm");
    expect(composition).not.toMatch(
      /inspectWorkspace\(|requestWorkspace(?:Installation|Update|PolicyChange)\(/,
    );
  });
});
