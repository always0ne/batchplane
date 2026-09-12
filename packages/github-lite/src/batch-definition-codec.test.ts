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
  it("emits Gate-before-command workflow YAML and native schedule entries", () => {
    const workflow = buildBatchWorkflowYaml(definition);

    expect(workflow).toContain("uses: always0ne/batchplane/actions/gate@main");
    expect(workflow).toContain(
      "if: github.event_name == 'workflow_dispatch' && needs.batchplane-gate.outputs.verified_sha != ''",
    );
    expect(workflow).toContain(
      "ref: ${{ needs.batchplane-gate.outputs.verified_sha }}",
    );
    expect(workflow).toContain(
      "GITHUB_WORKFLOW_SHA: ${{ github.workflow_sha }}",
    );
    expect(workflow.indexOf("batchplane-gate:")).toBeLessThan(
      workflow.indexOf("run-batch:"),
    );
    expect(workflow).toContain('- cron: "0 5 * * *"');
    expect(workflow).toContain('timezone: "Asia/Seoul"');

    const businessStart = workflow.indexOf(
      "  run-schedule_64_61_69_6c_79_2d_63_6c_6f_73_65:",
    );
    const resultStart = workflow.indexOf(
      "  result-schedule_64_61_69_6c_79_2d_63_6c_6f_73_65:",
    );
    const businessBlock = workflow.slice(businessStart, resultStart);
    const resultBlock = workflow.slice(resultStart);

    expect(businessBlock).toContain(
      "issue-number: ${{ needs.schedule_64_61_69_6c_79_2d_63_6c_6f_73_65.outputs.issue-number }}",
    );
    expect(resultBlock).toContain(
      "GITHUB_WORKFLOW_SHA: ${{ github.workflow_sha }}",
    );
  });

  it("keeps timezone-aware schedule cron text native", () => {
    expect(formatGeneratedScheduleCrons(definition.schedules![0]!)).toBe(
      "0 5 * * *",
    );
  });

  it("keeps result recorders bound to their own cron while preserving same-timezone schedule IDs", () => {
    const workflow = buildBatchWorkflowYaml({
      ...definition,
      schedules: [
        {
          cron: "0 5 * * *",
          enabled: true,
          name: "First close",
          scheduleId: "first-close",
          timezone: "Asia/Seoul",
        },
        {
          cron: "30 5 * * *",
          enabled: true,
          name: "Second close",
          scheduleId: "second-close",
          timezone: "Asia/Seoul",
        },
      ],
    });

    expect(workflow).toContain(
      "if: github.event_name == 'schedule' && github.event.schedule == '0 5 * * *' && always() && needs.schedule_66_69_72_73_74_2d_63_6c_6f_73_65.outputs.issue-number != ''",
    );
    expect(workflow).toContain(
      "if: github.event_name == 'schedule' && github.event.schedule == '30 5 * * *' && always() && needs.schedule_73_65_63_6f_6e_64_2d_63_6c_6f_73_65.outputs.issue-number != ''",
    );
    expect(workflow).not.toContain(
      "if: github.event_name == 'schedule' && always()",
    );
    expect(workflow).toContain(
      "issue-number: ${{ needs.schedule_66_69_72_73_74_2d_63_6c_6f_73_65.outputs.issue-number }}",
    );
    expect(workflow).toContain(
      "GITHUB_WORKFLOW_SHA: ${{ github.workflow_sha }}",
    );
  });

  it("rejects same cron entries with different timezones by stable code", () => {
    expect(() =>
      buildBatchWorkflowYaml({
        ...definition,
        schedules: [
          {
            cron: "0 5 * * *",
            enabled: true,
            name: "Seoul",
            scheduleId: "seoul-close",
            timezone: "Asia/Seoul",
          },
          {
            cron: "0 5 * * *",
            enabled: true,
            name: "New York",
            scheduleId: "new-york-close",
            timezone: "America/New_York",
          },
        ],
      }),
    ).toThrow("SCHEDULE_TIMEZONE_AMBIGUOUS");
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
