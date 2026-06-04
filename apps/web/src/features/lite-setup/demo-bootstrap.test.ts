import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  buildBatchWorkflowYaml,
  parseBatchDefinitionYaml,
} from "../registration/registration-model";
import {
  buildDispatcherWorkflowYaml,
  buildRoleMappingYaml,
  buildSampleTargetWorkflowYaml,
  buildWorkspacePolicyYaml,
} from "./installation-model";

const demoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../examples/github-lite-demo",
);

function readDemoFile(path: string): string {
  return readFileSync(resolve(demoRoot, path), "utf8").replace(/\r\n/g, "\n");
}

describe("GitHub Lite demo repository bootstrap", () => {
  it("keeps copyable setup files aligned with the generated installation templates", () => {
    expect(readDemoFile(".github/workflows/batchplane-dispatcher.yml")).toBe(
      buildDispatcherWorkflowYaml(),
    );
    expect(readDemoFile(".github/workflows/batchplane-sample-target.yml")).toBe(
      buildSampleTargetWorkflowYaml(),
    );
    expect(readDemoFile(".batch-governance/workspace.yml")).toBe(
      buildWorkspacePolicyYaml(),
    );
    expect(readDemoFile(".batch-governance/policies/role-mapping.yml")).toBe(
      buildRoleMappingYaml(),
    );
  });

  it("keeps the demo batch definition and workflow readable by the Lite model", () => {
    const definition = parseBatchDefinitionYaml(
      readDemoFile(".batch-governance/batches/demo.echo.yml"),
    );

    expect(definition).toMatchObject({
      batchId: "demo.echo",
      gateRequired: true,
      name: "Demo Echo",
      workflow: {
        path: ".github/workflows/demo.echo.yml",
        ref: "main",
      },
    });
    expect(definition.execution).toMatchObject({
      command: "echo BatchPlane demo batch",
      runsOn: "ubuntu-latest",
    });
    expect(readDemoFile(".github/workflows/demo.echo.yml")).toBe(
      buildBatchWorkflowYaml(
        definition,
        definition.execution?.command ?? "",
        "ubuntu-latest",
      ),
    );
  });
});
