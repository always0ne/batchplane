import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(path)
      : /\.tsx?$/.test(entry.name) && !entry.name.includes(".test.")
        ? [path]
        : [];
  });
}
describe("execution inspection dependency boundaries", () => {
  it("keeps product pages and their local hooks free of transport/session/evidence parsing", () => {
    const files = [
      "pages/execution-runs",
      "pages/audit",
      "pages/dashboard",
    ].flatMap((path) => sourceFiles(resolve("src", path)));
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(
        /from ["'][^"']*(?:runtime|github-lite|github-session|@batchplane\/domain)/,
      );
      expect(source, file).not.toMatch(
        /createRuntime|readSession|parseExecutionGateResult|BATCHPLANE_GATE_RESULT|BatchPlane Gate/,
      );
    }
  });
  it("keeps inspection adapter modules independent from app code and React", () => {
    const directory = resolve("../../packages/github-lite/src");
    const files = readdirSync(directory).filter(
      (name) =>
        /^(?:execution-(?:run|log|audit|inspection)|failure-follow-up|dashboard-client|inspection-context)/.test(
          name,
        ) &&
        name.endsWith(".ts") &&
        !name.includes(".test."),
    );
    for (const file of files)
      expect(readFileSync(resolve(directory, file), "utf8"), file).not.toMatch(
        /from ["'][^"']*(?:apps\/web|react|runtime-fixtures)/,
      );
  });
});
