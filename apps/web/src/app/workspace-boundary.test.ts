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
    const page = readFileSync(
      resolve("src/pages/workspace/WorkspacePage.tsx"),
      "utf8",
    );
    const router = readFileSync(resolve("src/app/router.tsx"), "utf8");
    const editor = readFileSync(
      resolve("src/runtime/GitHubConnectionForm.tsx"),
      "utf8",
    );
    const session = readFileSync(
      resolve("src/runtime/github-session.ts"),
      "utf8",
    );
    expect(router).toContain("connectionEditor={LiteGitHubConnectionEditor}");
    expect(router).not.toContain("LiteWorkspaceRoute");
    expect(existsSync(resolve("src/app/LiteWorkspaceRoute.tsx"))).toBe(false);
    expect(page).not.toMatch(
      /token|GitHubSession|connectionForm|storedConnection|prepareRequest/,
    );
    expect(editor).toContain("GitHubSessionSummary");
    expect(session).toContain("sessionStorage");
  });
});
