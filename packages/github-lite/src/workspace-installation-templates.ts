import type { WorkspaceApprovalMode } from "@batchplane/domain";

import {
  batchPlaneDispatcherActionRef,
  batchPlaneGateActionRef,
} from "./github-action-references.js";
import { stringifyRepositoryYaml } from "./repository-yaml.js";

export const liteDispatcherWorkflowPath =
  ".github/workflows/batchplane-dispatcher.yml";

export const legacyLiteDispatcherWorkflowPath =
  ".github/workflows/batchtrail-dispatcher.yml";

export const liteSampleTargetWorkflowPath =
  ".github/workflows/batchplane-sample-target.yml";

export const legacyLiteSampleTargetWorkflowPath =
  ".github/workflows/batchtrail-sample-target.yml";

export const liteWorkspacePolicyPath = ".batch-governance/workspace.yml";

export const liteRoleMappingPath =
  ".batch-governance/policies/role-mapping.yml";

export type LiteInstallationFile = {
  content: string;
  legacyPaths?: string[];
  path: string;
};

export function buildLiteInstallationFiles(): LiteInstallationFile[] {
  return [
    {
      path: liteDispatcherWorkflowPath,
      legacyPaths: [legacyLiteDispatcherWorkflowPath],
      content: buildDispatcherWorkflowYaml(),
    },
    {
      path: liteSampleTargetWorkflowPath,
      legacyPaths: [legacyLiteSampleTargetWorkflowPath],
      content: buildSampleTargetWorkflowYaml(),
    },
    {
      path: ".batch-governance/README.md",
      content: buildGovernanceReadme(),
    },
    {
      path: liteWorkspacePolicyPath,
      content: buildWorkspacePolicyYaml(),
    },
    {
      path: liteRoleMappingPath,
      content: buildRoleMappingYaml(),
    },
    {
      path: ".batch-governance/batches/.gitkeep",
      content: "Batch definitions created by BatchPlane Lite live here.\n",
    },
  ];
}

export function buildWorkspacePolicyYaml(
  mode: WorkspaceApprovalMode = "SELF_APPROVAL_BLOCKED",
): string {
  return stringifyRepositoryYaml({
    apiVersion: "batchplane.io/v1",
    kind: "WorkspacePolicy",
    metadata: { id: "default" },
    spec: { approval: { mode } },
  });
}

export function buildRoleMappingYaml(): string {
  return stringifyRepositoryYaml({
    apiVersion: "batchplane.io/v1",
    kind: "RoleMapping",
    metadata: { id: "default" },
    spec: {
      roles: {
        approver: { repositoryRoles: ["maintain", "admin"] },
        auditor: { repositoryRoles: ["triage"] },
        maintainer: { repositoryRoles: ["maintain", "admin"] },
        requester: { repositoryRoles: ["write", "maintain", "admin"] },
      },
    },
  });
}

export function buildDispatcherWorkflowYaml(): string {
  const dispatcherWorkflowJobCondition = [
    "github.event.issue.pull_request == null",
    "startsWith(github.event.comment.body, '/bgcp approve requestDigest=')",
    "contains(github.event.comment.body, '<!-- batchplane:execution-approval')",
    "contains(github.event.comment.body, 'decision=APPROVED')",
    "(contains(github.event.issue.labels.*.name, 'batchplane:execution-request') || contains(github.event.issue.labels.*.name, 'batchtrail:execution-request'))",
  ].join(" && ");
  return [
    "name: BatchPlane Dispatcher",
    "",
    "on:",
    "  issue_comment:",
    "    types: [created]",
    "",
    "permissions:",
    "  actions: write",
    "  contents: read",
    "  issues: write",
    "",
    "concurrency:",
    "  group: batchplane-dispatch-${{ github.event.issue.number }}",
    "  cancel-in-progress: false",
    "",
    "jobs:",
    "  dispatch-approved-request:",
    "    if: >-",
    `      ${dispatcherWorkflowJobCondition}`,
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - name: Dispatch approved BatchPlane execution",
    `        uses: ${batchPlaneDispatcherActionRef}`,
    "        with:",
    "          issue-number: ${{ github.event.issue.number }}",
    "          comment-id: ${{ github.event.comment.id }}",
    "          github-token: ${{ secrets.GITHUB_TOKEN }}",
    "",
  ].join("\n");
}

export function buildSampleTargetWorkflowYaml(): string {
  return [
    "name: BatchPlane Sample Target",
    "run-name: BatchPlane ${{ inputs.batch_id }} ${{ inputs.request_id }}",
    "",
    "on:",
    "  workflow_dispatch:",
    "    inputs:",
    "      request_id:",
    "        description: BatchPlane execution request ID",
    "        required: true",
    "        type: string",
    "      batch_id:",
    "        description: BatchPlane batch ID",
    "        required: true",
    "        type: string",
    "      request_digest:",
    "        description: BatchPlane approved request digest",
    "        required: true",
    "        type: string",
    "      schedule_id:",
    "        description: BatchPlane schedule identifier for scheduled dispatches",
    "        required: false",
    "        type: string",
    "",
    "permissions:",
    "  contents: read",
    "  issues: read",
    "",
    "jobs:",
    "  batchplane-gate:",
    "    name: BatchPlane Gate",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - name: Verify approved execution evidence",
    `        uses: ${batchPlaneGateActionRef}`,
    "        with:",
    "          mode: lite",
    "          batch-id: ${{ inputs.batch_id }}",
    "          config-path: .batch-governance",
    "          request-id: ${{ inputs.request_id }}",
    "          approval-source: issue",
    "          approval-ref: ${{ inputs.request_id }}",
    "          request-digest: ${{ inputs.request_digest }}",
    "          schedule-id: ${{ inputs.schedule_id }}",
    "          github-token: ${{ secrets.GITHUB_TOKEN }}",
    "",
    "  run-sample-batch:",
    "    name: Run sample batch command",
    "    runs-on: ubuntu-latest",
    "    needs: batchplane-gate",
    "    steps:",
    "      - name: Checkout",
    "        uses: actions/checkout@v4",
    "      - name: Sample command",
    '        run: echo "BatchPlane approved sample execution"',
    "",
  ].join("\n");
}

function buildGovernanceReadme(): string {
  return [
    "# BatchPlane Governance",
    "",
    "This directory stores BatchPlane Lite definitions and audit evidence that are reviewed through GitHub pull requests and issues.",
    "",
    "- `batches/`: approved batch definitions and optional execution artifacts",
    "- `workspace.yml`: Workspace-level approval mode. Default is `SELF_APPROVAL_BLOCKED`; use `SELF_APPROVAL_ALLOWED` for explicit requester approval or `AUTO_APPROVE` for automatic Workspace-policy approval evidence that also includes self-approval permission.",
    "- `policies/role-mapping.yml`: repository-side approver role mapping used by Gate when self-approval is not explicitly allowed.",
    "- `.github/workflows/batchplane-sample-target.yml`: sample governed target workflow",
    "",
  ].join("\n");
}
