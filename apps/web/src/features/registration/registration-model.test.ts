import { describe, expect, it } from "vitest";

import {
  buildBatchWorkflowYaml,
  buildRegistrationPullRequestBody,
  createRegistrationBranchName,
  getBatchArtifactPath,
  getBatchDefinitionPath,
  getBatchWorkflowPath,
  parseBatchDefinitionYaml,
  serializeBatchDefinitionYaml,
  toBatchDefinition,
  validateBatchRegistration,
} from "./registration-model";

const definition = toBatchDefinition({
  batchId: "payment.daily-close",
  name: "Daily Close",
  owner: "ops-team",
  domain: "payments",
  environment: "PROD",
  criticality: "HIGH",
  status: "ACTIVE",
  runCommand: "./scripts/daily-close.sh",
  runnerLabel: "ubuntu-latest",
  workflowRef: "main",
});

describe("registration model", () => {
  it("serializes a batch definition as deterministic YAML", () => {
    expect(serializeBatchDefinitionYaml(definition)).toContain(
      '  id: "payment.daily-close"',
    );
    expect(serializeBatchDefinitionYaml(definition)).toContain(
      '    path: ".github/workflows/payment.daily-close.yml"',
    );
    expect(serializeBatchDefinitionYaml(definition)).toContain(
      "  gateRequired: true",
    );
  });

  it("parses a serialized batch definition", () => {
    expect(
      parseBatchDefinitionYaml(serializeBatchDefinitionYaml(definition)),
    ).toEqual(definition);
  });

  it("builds the governed repo path", () => {
    expect(getBatchDefinitionPath("payment.daily-close")).toBe(
      ".batch-governance/batches/payment.daily-close.yml",
    );
  });

  it("builds a deterministic governed workflow path", () => {
    expect(getBatchWorkflowPath("Payment Daily Close")).toBe(
      ".github/workflows/payment-daily-close.yml",
    );
  });

  it("builds a deterministic governed artifact path", () => {
    expect(getBatchArtifactPath("Payment Daily Close", "../close job.sh")).toBe(
      ".batch-governance/batches/payment-daily-close/artifacts/close-job.sh",
    );
  });

  it("always requires the BatchTrail Gate", () => {
    expect(definition.gateRequired).toBe(true);
  });

  it("builds a workflow with mandatory dispatch inputs and Gate job", () => {
    const workflowYaml = buildBatchWorkflowYaml(
      definition,
      "./scripts/daily-close.sh",
      "ubuntu-24.04",
    );

    expect(workflowYaml).toContain("workflow_dispatch:");
    expect(workflowYaml).toContain('runs-on: "ubuntu-24.04"');
    expect(workflowYaml).toContain("request_id:");
    expect(workflowYaml).toContain("request_digest:");
    expect(workflowYaml).toContain("uses: actions/checkout@v4");
    expect(workflowYaml).toContain("batchtrail-gate:");
    expect(workflowYaml).toContain(
      "uses: always0ne/batchtrail/actions/gate@main",
    );
    expect(workflowYaml).toContain("needs: batchtrail-gate");
    expect(workflowYaml).toContain("./scripts/daily-close.sh");
  });

  it("supports custom multi-label runners", () => {
    expect(
      buildBatchWorkflowYaml(
        definition,
        "./scripts/daily-close.sh",
        "self-hosted, linux, prod",
      ),
    ).toContain('runs-on: ["self-hosted", "linux", "prod"]');
  });

  it("validates required fields", () => {
    expect(
      validateBatchRegistration({ ...definition, batchId: "", owner: "" }),
    ).toEqual(["batchId", "owner"]);
  });

  it("creates a stable registration branch name", () => {
    expect(
      createRegistrationBranchName(
        "Payment Daily Close",
        new Date("2026-05-09T01:02:03.000Z"),
      ),
    ).toBe("batchtrail/register/payment-daily-close-20260509010203");
  });

  it("creates a PR body with auditable registration context", () => {
    expect(buildRegistrationPullRequestBody(definition)).toContain(
      "Batch ID: `payment.daily-close`",
    );
    expect(buildRegistrationPullRequestBody(definition)).toContain(
      "BatchTrail Gate: required",
    );
  });
});
