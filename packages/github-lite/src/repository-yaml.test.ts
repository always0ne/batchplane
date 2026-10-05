import { describe, expect, it } from "vitest";

import {
  formatRepositoryYamlDiagnostics,
  parseRepositoryYaml,
} from "./repository-yaml.js";

describe("governance YAML", () => {
  it("reports parser locations for invalid YAML", () => {
    const result = parseRepositoryYaml("metadata:\n  name: [broken\n");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(formatRepositoryYamlDiagnostics(result.diagnostics)).toContain(
        "line ",
      );
    }
  });
});
