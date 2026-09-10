import type { BatchDefinition } from "@batchplane/domain";
import { describe, expect, it } from "vitest";
import { parseDocument } from "yaml";

import {
  getBatchArtifactPath,
  getBatchDefinitionPath,
  getBatchWorkflowPath,
  parseBatchDefinitionYaml,
  serializeBatchDefinitionYaml,
} from "./batch-definition-codec.js";
import {
  buildBatchWorkflowYaml,
  formatGeneratedScheduleCrons,
} from "./github-workflow.js";

const definition: BatchDefinition = {
  batchId: "payment.daily-close",
  criticality: "HIGH",
  domain: "payments",
  environment: "PROD",
  execution: {
    artifactPath: "vendor/release/close.jar",
    command: "java -jar close.jar",
    runsOn: "ubuntu-latest",
  },
  gateRequired: true,
  governedChangeId: "bgc-payment-close",
  name: "Daily close",
  owner: "payments-ops",
  schedules: [
    {
      cron: "0 5 * * *",
      enabled: true,
      name: "Korean business day close",
      scheduleId: "daily-close",
      timezone: "Asia/Seoul",
    },
  ],
  status: "ACTIVE",
  workflow: {
    path: ".github/workflows/payment.daily-close.yml",
    ref: "main",
  },
};

describe("BatchDefinition codec", () => {
  it("keeps governed repository paths deterministic", () => {
    expect(getBatchDefinitionPath("payment.daily-close")).toBe(
      ".batch-governance/batches/payment.daily-close.yml",
    );
    expect(getBatchWorkflowPath("payment.daily-close")).toBe(
      ".github/workflows/payment.daily-close.yml",
    );
    expect(getBatchArtifactPath("payment.daily-close", "../close.jar")).toBe(
      ".batch-governance/batches/payment.daily-close/artifacts/close.jar",
    );
  });

  it.each([
    "../../workflows/release",
    "payment/daily",
    "payment\\daily",
    "payment daily",
  ])(
    "rejects unsafe Batch ID %s instead of deriving a repository path",
    (batchId) => {
      expect(() => getBatchDefinitionPath(batchId)).toThrow("Batch ID");
      expect(() => getBatchWorkflowPath(batchId)).toThrow("Batch ID");
      expect(() => getBatchArtifactPath(batchId, "runner.jar")).toThrow(
        "Batch ID",
      );
    },
  );

  it("round trips a validated BatchDefinition without workflow generation", () => {
    expect(
      parseBatchDefinitionYaml(serializeBatchDefinitionYaml(definition)),
    ).toEqual(definition);
  });

  it("rejects malformed BatchDefinition YAML", () => {
    expect(() => parseBatchDefinitionYaml("kind: BatchDefinition\n")).toThrow(
      "Invalid BatchPlane BatchDefinition",
    );
  });
});

describe("GitHub workflow generation", () => {
  it("emits Gate-before-command workflow YAML and converted schedule entries", () => {
    const workflow = buildBatchWorkflowYaml(definition);

    expect(workflow).toContain("uses: always0ne/batchplane/actions/gate@main");
    expect(workflow.indexOf("batchplane-gate:")).toBeLessThan(
      workflow.indexOf("run-batch:"),
    );
    expect(workflow).toContain('- cron: "0 20 * * *"');
  });

  it("converts timezone-aware schedule cron text deterministically", () => {
    expect(formatGeneratedScheduleCrons(definition.schedules![0]!)).toBe(
      "0 20 * * *",
    );
  });

  it("serializes malformed custom runner labels and arrays structurally", () => {
    const literalWorkflow = buildBatchWorkflowYaml({
      ...definition,
      execution: {
        ...definition.execution!,
        runsOn: "[self-hosted",
      },
    });
    const expressionWorkflow = buildBatchWorkflowYaml({
      ...definition,
      execution: {
        ...definition.execution!,
        runsOn: "${{ github.event.inputs.runner }}",
      },
    });
    const arrayWorkflow = buildBatchWorkflowYaml({
      ...definition,
      execution: {
        ...definition.execution!,
        runsOn: ["self-hosted", "linux", "x64"],
      },
    });

    expect(literalWorkflow).toContain('runs-on: "[self-hosted"');
    expect(expressionWorkflow).toContain(
      'runs-on: "${{ github.event.inputs.runner }}"',
    );
    expect(arrayWorkflow).toContain('runs-on: ["self-hosted", "linux", "x64"]');
  });

  it("gives formerly colliding schedule IDs distinct workflow job keys", () => {
    const workflow = buildBatchWorkflowYaml({
      ...definition,
      schedules: ["a-b", "a.b", "a_b"].map((scheduleId) => ({
        cron: "0 5 * * *",
        enabled: true,
        name: scheduleId,
        scheduleId,
        timezone: "UTC",
      })),
    });
    const parsed = parseDocument(workflow, { uniqueKeys: true });

    expect(parsed.errors).toEqual([]);
    expect(workflow).toContain("schedule_61_2d_62:");
    expect(workflow).toContain("schedule_61_2e_62:");
    expect(workflow).toContain("schedule_61_5f_62:");
  });
});
