import { describe, expect, it } from "vitest";

import {
  formatGovernanceYamlDiagnostics,
  parseGovernanceYaml,
  stringifyGovernanceYaml,
} from "./governance-yaml.js";

describe("governance YAML", () => {
  it("reads standard quoted, list, and multiline YAML", () => {
    expect(
      parseGovernanceYaml(`
# Governance definition
metadata:
  name: 'Daily close'
spec:
  labels:
    - prod
    - close
  command: |-
    java -jar close.jar
    --date today
`),
    ).toEqual({
      ok: true,
      value: {
        metadata: { name: "Daily close" },
        spec: {
          command: "java -jar close.jar\n--date today",
          labels: ["prod", "close"],
        },
      },
    });
  });

  it("reports parser locations for invalid YAML", () => {
    const result = parseGovernanceYaml("metadata:\n  name: [broken\n");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(formatGovernanceYamlDiagnostics(result.diagnostics)).toContain(
        "line ",
      );
    }
  });

  it("writes a parseable document", () => {
    const output = stringifyGovernanceYaml({
      metadata: { id: "payment.daily-close" },
      spec: { labels: ["prod", "close"] },
    });

    expect(parseGovernanceYaml(output)).toEqual({
      ok: true,
      value: {
        metadata: { id: "payment.daily-close" },
        spec: { labels: ["prod", "close"] },
      },
    });
  });
});
