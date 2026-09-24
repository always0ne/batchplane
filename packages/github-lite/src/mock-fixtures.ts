import {
  type GitHubIssue,
  type GitHubIssueComment,
  type GitHubLiteMockExecutionScenario,
  type GitHubLiteMockExecutionState,
  type GitHubLiteMockState,
  type GitHubPullRequestFile,
  type GitHubRepository,
  type GitHubWorkflowJob,
  type GitHubWorkflowRun,
  type GitHubWorkflowRunConclusion,
  type GitHubWorkflowRunStatus,
} from "./github-types.js";

export function createMockExecutionScenarios(
  batchId: string,
): GitHubLiteMockExecutionScenario[] {
  const states: GitHubLiteMockExecutionState[] = [
    "requested",
    "approved",
    "dispatching",
    "dispatched",
    "business-failed",
    "rejected",
    "failed",
    "gate-blocked",
  ];

  return states.map((state, index) => {
    const sequence = index + 1;

    return {
      batchId,
      issueNumber: 100 + sequence,
      requestDigest: createMockDigest(sequence),
      requestId: `btr-20260514010${sequence}00-${batchId}-${String(
        sequence,
      ).padStart(8, "0")}`,
      state,
      workflowRunId:
        state === "requested" ||
        state === "approved" ||
        state === "rejected" ||
        state === "failed"
          ? undefined
          : 200 + sequence,
    };
  });
}

export function buildMockExecutionIssue(
  repository: GitHubRepository,
  scenario: GitHubLiteMockExecutionScenario,
): GitHubIssue {
  const labels = ["batchplane:execution-request"];

  if (scenario.state === "dispatching") {
    labels.push("batchplane:dispatching");
  }

  if (scenario.state === "dispatched") {
    labels.push("batchplane:dispatched");
  }

  if (scenario.state === "business-failed") {
    labels.push("batchplane:dispatched");
  }

  if (scenario.state === "failed") {
    labels.push("batchplane:dispatch-failed");
  }

  if (scenario.state === "gate-blocked") {
    labels.push("batchplane:gate-blocked");
  }

  if (scenario.state === "rejected") {
    labels.push("batchplane:rejected");
  }

  return {
    author: "developer",
    body: buildMockExecutionIssueBody(scenario),
    createdAt: "2026-05-14T01:02:03.000Z",
    isPullRequest: false,
    labels,
    number: scenario.issueNumber,
    state:
      scenario.state === "dispatched" ||
      scenario.state === "business-failed" ||
      scenario.state === "rejected"
        ? "closed"
        : "open",
    title: `Run batch ${scenario.batchId} (${scenario.state})`,
    url: `${repository.url}/issues/${scenario.issueNumber}`,
  };
}

export function buildMockExecutionIssueBody(
  scenario: GitHubLiteMockExecutionScenario,
): string {
  const requestedAt = "2026-05-14T01:02:03.000Z";
  const expiresAt = "2026-05-14T02:02:03.000Z";
  const requestStatus =
    scenario.state === "rejected" ? "REJECTED" : "REQUESTED";

  return [
    "## BatchPlane Execution Request",
    "",
    `- Request ID: \`${scenario.requestId}\``,
    `- Batch ID: \`${scenario.batchId}\``,
    "- Requested by: @developer",
    `- Requested at: ${requestedAt}`,
    `- Expires at: ${expiresAt}`,
    `- Request digest: \`${scenario.requestDigest}\``,
    `- Status: ${requestStatus}`,
    "",
    "### Canonical payload",
    "",
    "```json",
    JSON.stringify(
      {
        apiVersion: "batchplane.io/v1",
        kind: "ExecutionRequest",
        metadata: {
          batchId: scenario.batchId,
          requestId: scenario.requestId,
        },
        spec: {
          batch: {
            criticality: "HIGH",
            domain: "payments",
            environment: "PROD",
            name: "Daily Close",
            owner: "ops-team",
          },
          execution: {
            command: "echo mock batch",
            gateRequired: true,
            runsOn: "ubuntu-latest",
          },
          expiresAt,
          reason: "Manual request from BatchPlane Lite.",
          requestedAt,
          requestedBy: "developer",
          workflow: {
            path: `.github/workflows/${scenario.batchId}.yml`,
            ref: "main",
          },
        },
      },
      null,
      2,
    ),
    "```",
    "",
    "<!-- batchplane:execution-request",
    `requestId=${scenario.requestId}`,
    `batchId=${scenario.batchId}`,
    `requestDigest=${scenario.requestDigest}`,
    `status=${requestStatus}`,
    "-->",
  ].join("\n");
}

export function buildMockExecutionComments(
  scenario: GitHubLiteMockExecutionScenario,
  approver: string,
): GitHubIssueComment[] {
  const comments: GitHubIssueComment[] = [];

  if (
    scenario.state === "approved" ||
    scenario.state === "dispatching" ||
    scenario.state === "dispatched" ||
    scenario.state === "business-failed" ||
    scenario.state === "failed" ||
    scenario.state === "gate-blocked"
  ) {
    comments.push({
      author: approver,
      body: [
        `/bgcp approve requestDigest=${scenario.requestDigest}`,
        "",
        "## BatchPlane Execution Approval",
        "",
        "- Decision: APPROVED",
        `- Approver: @${approver}`,
        "- Approved at: 2026-05-14T01:05:00.000Z",
        `- Request ID: \`${scenario.requestId}\``,
        `- Batch ID: \`${scenario.batchId}\``,
        `- Request digest: \`${scenario.requestDigest}\``,
        "",
        "<!-- batchplane:execution-approval",
        "decision=APPROVED",
        `requestId=${scenario.requestId}`,
        `batchId=${scenario.batchId}`,
        `requestDigest=${scenario.requestDigest}`,
        "-->",
      ].join("\n"),
      createdAt: "2026-05-14T01:05:00.000Z",
      id: scenario.issueNumber * 10 + 1,
      issueNumber: scenario.issueNumber,
    });
  }

  if (scenario.state === "dispatching") {
    comments.push(buildMockDispatcherComment(scenario, "DISPATCHING"));
  }

  if (scenario.state === "dispatched") {
    comments.push(buildMockDispatcherComment(scenario, "DISPATCHED"));
  }

  if (scenario.state === "business-failed") {
    comments.push(buildMockDispatcherComment(scenario, "DISPATCHED"));
  }

  if (scenario.state === "failed") {
    comments.push(buildMockDispatcherComment(scenario, "DISPATCH_FAILED"));
  }

  if (scenario.state === "gate-blocked") {
    comments.push({
      author: "github-actions[bot]",
      body: [
        "## BatchPlane Gate Decision",
        "",
        "- Decision: BLOCKED",
        "- Reason: RERUN_NOT_AUTHORIZED",
        `- Request ID: \`${scenario.requestId}\``,
        `- Batch ID: \`${scenario.batchId}\``,
        `- Request digest: \`${scenario.requestDigest}\``,
        "",
        "<!-- batchplane:gate-decision",
        "allowed=false",
        "reasonCode=RERUN_NOT_AUTHORIZED",
        `requestId=${scenario.requestId}`,
        `batchId=${scenario.batchId}`,
        `requestDigest=${scenario.requestDigest}`,
        "-->",
      ].join("\n"),
      createdAt: "2026-05-14T01:08:00.000Z",
      id: scenario.issueNumber * 10 + 4,
      issueNumber: scenario.issueNumber,
    });
  }

  if (scenario.state === "rejected") {
    comments.push({
      author: approver,
      body: [
        "## BatchPlane Execution Approval",
        "",
        "- Decision: REJECTED",
        `- Rejector: @${approver}`,
        "- Rejected at: 2026-05-14T01:06:00.000Z",
        `- Request ID: \`${scenario.requestId}\``,
        `- Batch ID: \`${scenario.batchId}\``,
        `- Request digest: \`${scenario.requestDigest}\``,
        "",
        "<!-- batchplane:execution-approval",
        "decision=REJECTED",
        `requestId=${scenario.requestId}`,
        `batchId=${scenario.batchId}`,
        `requestDigest=${scenario.requestDigest}`,
        "-->",
      ].join("\n"),
      createdAt: "2026-05-14T01:06:00.000Z",
      id: scenario.issueNumber * 10 + 5,
      issueNumber: scenario.issueNumber,
    });
  }

  return comments;
}

export function buildMockDispatcherComment(
  scenario: GitHubLiteMockExecutionScenario,
  status: "DISPATCHING" | "DISPATCHED" | "DISPATCH_FAILED",
): GitHubIssueComment {
  return {
    author: "github-actions[bot]",
    body: [
      `## BatchPlane Dispatcher ${status}`,
      "",
      `- Status: ${status}`,
      `- Request ID: \`${scenario.requestId}\``,
      `- Batch ID: \`${scenario.batchId}\``,
      `- Request digest: \`${scenario.requestDigest}\``,
      "",
      "<!-- batchplane:bgcp:dispatcher",
      `status=${status}`,
      `requestId=${scenario.requestId}`,
      `batchId=${scenario.batchId}`,
      `requestDigest=${scenario.requestDigest}`,
      "-->",
    ].join("\n"),
    createdAt: "2026-05-14T01:07:00.000Z",
    id:
      scenario.issueNumber * 10 +
      (status === "DISPATCHING" ? 2 : status === "DISPATCHED" ? 3 : 6),
    issueNumber: scenario.issueNumber,
  };
}

export function buildMockWorkflowRuns(
  repository: GitHubRepository,
  workflowId: number,
  scenario: GitHubLiteMockExecutionScenario,
): GitHubWorkflowRun[] {
  if (!scenario.workflowRunId) {
    return [];
  }

  const status: GitHubWorkflowRunStatus =
    scenario.state === "dispatching" ? "in_progress" : "completed";
  const conclusion: GitHubWorkflowRunConclusion =
    scenario.state === "dispatched"
      ? "success"
      : scenario.state === "dispatching"
        ? null
        : "failure";

  return [
    {
      actor: "github-actions[bot]",
      batchId: scenario.batchId,
      conclusion,
      createdAt: "2026-05-14T01:07:00.000Z",
      displayTitle: `BatchPlane ${scenario.batchId} ${scenario.requestId}`,
      event: "workflow_dispatch",
      id: scenario.workflowRunId,
      name: `Run ${scenario.batchId}`,
      requestId: scenario.requestId,
      runAttempt: scenario.state === "gate-blocked" ? 2 : 1,
      startedAt: "2026-05-14T01:07:00.000Z",
      status,
      updatedAt:
        scenario.state === "dispatching" ? "" : "2026-05-14T01:09:00.000Z",
      url: `${repository.url}/actions/runs/${scenario.workflowRunId}`,
      workflowId,
      workflowPath: `.github/workflows/${scenario.batchId}.yml`,
    },
  ];
}

export function buildMockWorkflowRunJobs(
  state: GitHubLiteMockState,
  runId: number,
): GitHubWorkflowJob[] {
  const run = state.workflowRuns.find((candidate) => candidate.id === runId);

  if (!run) {
    return [];
  }

  const scenario = state.executionScenarios.find(
    (candidate) => candidate.workflowRunId === runId,
  );
  const gateBlocked = scenario?.state === "gate-blocked";
  const businessFailure = run.conclusion === "failure" && !gateBlocked;

  return [
    {
      completedAt:
        run.status === "queued" ? undefined : "2026-05-14T01:08:00.000Z",
      conclusion:
        run.status === "completed"
          ? gateBlocked
            ? "failure"
            : "success"
          : null,
      id: runId * 10 + 1,
      name: "BatchPlane Gate",
      startedAt: run.startedAt,
      status: run.status === "queued" ? "queued" : "completed",
      steps:
        run.status === "queued"
          ? []
          : [
              {
                completedAt: "2026-05-14T01:08:00.000Z",
                conclusion: gateBlocked ? "failure" : "success",
                name: "Verify approved execution evidence",
                number: 1,
                startedAt: "2026-05-14T01:07:00.000Z",
                status: "completed",
              },
            ],
      url: `${state.repository.url}/actions/runs/${runId}/job/${runId * 10 + 1}`,
    },
    {
      completedAt:
        run.status === "completed" && !gateBlocked
          ? "2026-05-14T01:09:00.000Z"
          : undefined,
      conclusion:
        run.status !== "completed"
          ? null
          : gateBlocked
            ? "skipped"
            : businessFailure
              ? "failure"
              : "success",
      id: runId * 10 + 2,
      name: "Run governed batch",
      startedAt: gateBlocked ? undefined : "2026-05-14T01:08:00.000Z",
      status:
        run.status === "completed"
          ? "completed"
          : run.status === "in_progress"
            ? "in_progress"
            : "queued",
      url: `${state.repository.url}/actions/runs/${runId}/job/${runId * 10 + 2}`,
    },
  ];
}

export function buildMockWorkflowJobLog(
  repository: GitHubRepository,
  run: GitHubWorkflowRun,
  job: GitHubWorkflowJob,
): string {
  const conclusion = job.conclusion ?? "in_progress";
  const gateJob = job.name.toLowerCase().includes("gate");

  if (!gateJob) {
    return [
      `2026-05-14T01:07:50.000Z ##[group]Checkout registered assets`,
      "2026-05-14T01:07:51.000Z Syncing repository.",
      "2026-05-14T01:07:52.000Z ##[endgroup]Checkout registered assets",
      "2026-05-14T01:08:00.000Z ##[group]Run batch",
      "2026-05-14T01:08:01.000Z ##[group]BatchPlane batch command",
      `2026-05-14T01:08:02.000Z Job ID ${job.id}`,
      `2026-05-14T01:08:03.000Z Status ${job.status}`,
      `2026-05-14T01:08:04.000Z Conclusion ${conclusion}`,
      "2026-05-14T01:08:05.000Z BatchPlane approved execution for payment.daily-close.",
      "2026-05-14T01:08:06.000Z Running governed batch command.",
      "2026-05-14T01:08:59.000Z ##[endgroup]BatchPlane batch command",
      "2026-05-14T01:09:00.000Z ##[endgroup]Run batch",
      "",
    ].join("\n");
  }

  return [
    `2026-05-14T01:07:00.000Z ##[group]${job.name}`,
    `2026-05-14T01:07:01.000Z Job ID ${job.id}`,
    `2026-05-14T01:07:02.000Z Status ${job.status}`,
    `2026-05-14T01:07:03.000Z Conclusion ${conclusion}`,
    "2026-05-14T01:07:04.000Z BatchPlane Gate evidence verified.",
    `2026-05-14T01:07:05.000Z BATCHPLANE_GATE_RESULT ${JSON.stringify({
      gateJob: "batchplane-gate",
      gateJobName: "BatchPlane Gate",
      gateStep: "Verify approved execution evidence",
      message:
        gateJob && conclusion === "failure"
          ? "GitHub Actions reruns are not authorized by BatchPlane."
          : "Execution request evidence is present.",
      repository: `${repository.owner}/${repository.repo}`,
      result: gateJob && conclusion === "failure" ? "DENY" : "ALLOW",
      runAttempt: run.runAttempt,
      runId: String(run.id),
      version: 1,
      ...(gateJob && conclusion === "failure"
        ? { reasonCode: "RERUN_NOT_AUTHORIZED" }
        : {}),
    })}`,
    `2026-05-14T01:09:00.000Z ##[endgroup]${job.name}`,
    "",
  ].join("\n");
}

export function buildMockPullRequestFiles(
  state: GitHubLiteMockState,
  base: string,
  head: string,
): GitHubPullRequestFile[] {
  const baseFiles = new Map(
    state.files
      .filter((file) => file.branch === base)
      .map((file) => [file.path, file]),
  );
  const headFiles = new Map(
    state.files
      .filter((file) => file.branch === head)
      .map((file) => [file.path, file]),
  );
  const paths = [...new Set([...baseFiles.keys(), ...headFiles.keys()])].sort();

  return paths.flatMap((path): GitHubPullRequestFile[] => {
    const baseFile = baseFiles.get(path);
    const headFile = headFiles.get(path);

    if (!baseFile && headFile) return [{ path, status: "added" as const }];
    if (baseFile && !headFile) return [{ path, status: "removed" as const }];
    if (baseFile?.content !== headFile?.content) {
      return [{ path, status: "modified" as const }];
    }

    return [];
  });
}

export function buildMockBatchDefinitionYaml(batchId: string): string {
  return [
    'apiVersion: "batchplane.io/v1"',
    'kind: "BatchDefinition"',
    "metadata:",
    `  id: "${batchId}"`,
    '  name: "Daily Close"',
    "spec:",
    '  owner: "ops-team"',
    '  domain: "payments"',
    '  environment: "PROD"',
    '  criticality: "HIGH"',
    '  status: "ACTIVE"',
    "  workflow:",
    `    path: ".github/workflows/${batchId}.yml"`,
    '    ref: "main"',
    "  gateRequired: true",
    "  execution:",
    '    runsOn: "ubuntu-latest"',
    '    command: "echo mock batch"',
    `  schedules: [{"id":"${batchId}-daily","name":"Daily settlement window","cron":"0 5 * * *","timezone":"Asia/Seoul","enabled":true}]`,
    "",
  ].join("\n");
}

export function buildMockBatchWorkflowYaml(batchId: string): string {
  return [
    `name: "BatchPlane - ${batchId}"`,
    "run-name: BatchPlane ${{ inputs.batch_id }} ${{ inputs.request_id }}",
    "",
    "on:",
    "  workflow_dispatch:",
    "    inputs:",
    "      request_id:",
    "        required: true",
    "      batch_id:",
    "        required: true",
    "      request_digest:",
    "        required: true",
    "",
    "jobs:",
    "  batchplane-gate:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - uses: always0ne/batchplane/actions/gate@main",
    "  run-batch:",
    "    needs: batchplane-gate",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - run: echo mock batch",
    "",
  ].join("\n");
}

export function buildMockRoleMappingYaml(): string {
  return [
    'apiVersion: "batchplane.io/v1"',
    'kind: "RoleMapping"',
    "metadata:",
    '  id: "default"',
    "spec:",
    "  roles:",
    "    requester:",
    '      repositoryRoles: ["write", "maintain", "admin"]',
    "    approver:",
    '      repositoryRoles: ["maintain", "admin"]',
    "    maintainer:",
    '      repositoryRoles: ["maintain", "admin"]',
    "    auditor:",
    '      repositoryRoles: ["triage"]',
    "",
  ].join("\n");
}

export function createMockDigest(sequence: number): string {
  return `sha256:${String(sequence).padStart(64, "0")}`;
}
