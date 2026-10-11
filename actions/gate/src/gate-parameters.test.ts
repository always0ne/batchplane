import { describe, expect, it } from "vitest";
import {
  buildBatchWorkflowYaml,
  buildExecutionRequestIssue,
  serializeBatchDefinitionYaml,
  type GitHubBatchDefinition,
} from "@batchplane/github-lite";
import { verifyParameterBinding } from "./gate-parameters.js";
import type { GateGitHubClient } from "./gate-github-client.js";

const revision = {
  result: "ALLOW" as const,
  message: "Verified",
  verifiedSha: "a".repeat(40),
};
const batch: GitHubBatchDefinition = {
  batchId: "daily",
  name: "Daily",
  owner: "owner",
  domain: "finance",
  environment: "test",
  criticality: "LOW",
  status: "ACTIVE",
  gateRequired: true,
  workflow: { path: ".github/workflows/daily.yml", ref: "main" },
  execution: { command: "node batch.js", runsOn: "ubuntu-latest" },
  parameters: [
    { name: "Date", required: true, sensitive: false },
    { name: "__proto__", required: true, sensitive: false },
  ],
};

async function fixture(workflow = buildBatchWorkflowYaml(batch)) {
  const issue = await buildExecutionRequestIssue({
    approvedBatchRevision: {
      governedChangeId: "change-1",
      targetRevisionDigest: `sha256:${"b".repeat(64)}`,
    },
    batch,
    expiresAt: new Date("2026-10-12T00:00:00Z"),
    requestedAt: new Date("2026-10-11T00:00:00Z"),
    requestedBy: "requester",
    requestId: "request-1",
    parameterSourceRevision: revision.verifiedSha,
    parameters: [
      {
        name: "Date",
        source: "VALUE",
        value: { kind: "VALUE", value: " 001\r\n서울 " },
      },
      {
        name: "__proto__",
        source: "VALUE",
        value: { kind: "VALUE", value: "exact-prototype-name" },
      },
    ],
  });
  const client = {
    async getFile(path: string) {
      return {
        path,
        content:
          path === batch.workflow.path
            ? workflow
            : serializeBatchDefinitionYaml(batch),
      };
    },
  } as GateGitHubClient;
  return {
    revision,
    client,
    issueBody: issue.body,
    input: {
      mode: "lite",
      batchId: batch.batchId,
      configPath: ".batch-governance",
      requestId: issue.request.requestId,
      requestDigest: issue.request.requestDigest,
      workflowSha: revision.verifiedSha,
    },
  };
}

describe("Gate parameter binding", () => {
  it("returns only verified exact inputs and denies changed values under the old approval digest", async () => {
    const input = await fixture();
    const allowed = await verifyParameterBinding(input);
    expect(allowed.result).toBe("ALLOW");
    expect(allowed.approvedParameters?.Date).toMatchObject({
      value: " 001\r\n서울 ",
    });
    expect(allowed.approvedParameters?.["__proto__"]).toMatchObject({
      value: "exact-prototype-name",
    });
    const mutations = [
      input.issueBody.replace("001", "002"),
      input.issueBody.replace("\\r\\n", "\\n"),
      input.issueBody.replace("exact-prototype-name", "changed-prototype-name"),
    ];
    for (const issueBody of mutations) {
      const changed = await verifyParameterBinding({ ...input, issueBody });
      expect(changed).toMatchObject({
        result: "DENY",
        reasonCode: "REQUEST_DIGEST_MISMATCH",
      });
      expect(changed.approvedParameters).toBeUndefined();
    }
  });

  it("blocks parameterized requests until the registered workflow actually binds preparation output to the business step", async () => {
    const workflow = buildBatchWorkflowYaml(batch);
    const input = await fixture(
      workflow.replace(
        "env: ${{ fromJSON(steps.prepare.outputs.environment) }}",
        "env: {}",
      ),
    );
    expect(await verifyParameterBinding(input)).toMatchObject({
      result: "DENY",
      reasonCode: "PARAMETER_WORKFLOW_UPDATE_REQUIRED",
    });
    const staleRequestBinding = await fixture(
      workflow.replaceAll("${{ inputs.request_digest }}", "stale-digest"),
    );
    expect(await verifyParameterBinding(staleRequestBinding)).toMatchObject({
      result: "DENY",
      reasonCode: "PARAMETER_WORKFLOW_UPDATE_REQUIRED",
    });
  });
});
