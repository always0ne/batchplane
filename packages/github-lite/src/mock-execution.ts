import {
  type GitHubIssue,
  type GitHubIssueComment,
  type GitHubLiteMockExecutionScenario,
  type GitHubLiteMockState,
  type GitHubWorkflowRunConclusion,
  type GitHubWorkflowRunStatus,
} from "./github-types.js";
import {
  batchPlaneLabel,
  ensureMockLabel,
  findMockIssue,
  hasBatchPlaneLabel,
  nextMockNumber,
  removeBatchPlaneLabel,
  uniqueStrings,
} from "./mock-state.js";

export function trackMockExecutionRequest(
  state: GitHubLiteMockState,
  issue: GitHubIssue,
): void {
  if (
    issue.isPullRequest ||
    !hasBatchPlaneLabel(issue.labels, "execution-request") ||
    state.executionScenarios.some(
      (scenario) => scenario.issueNumber === issue.number,
    )
  ) {
    return;
  }

  const marker = parseMockBatchPlaneMarker(issue.body, "execution-request");
  const batchId = marker.get("batchId");
  const requestDigest = marker.get("requestDigest");
  const requestId = marker.get("requestId");

  if (!batchId || !requestDigest || !requestId) {
    return;
  }

  state.executionScenarios.push({
    batchId,
    issueNumber: issue.number,
    requestDigest,
    requestId,
    state: marker.get("status") === "REJECTED" ? "rejected" : "requested",
  });
}

export function applyMockExecutionCommentTransition(
  state: GitHubLiteMockState,
  comment: GitHubIssueComment,
): void {
  const approval = parseMockExecutionApprovalComment(comment.body);

  if (approval) {
    applyMockExecutionApprovalTransition(state, comment.issueNumber, approval);
    return;
  }

  const dispatcherStatus = parseMockDispatcherStatus(comment.body);

  if (dispatcherStatus) {
    applyMockDispatcherStatusTransition(
      state,
      comment.issueNumber,
      dispatcherStatus,
    );
  }
}

export function parseMockExecutionApprovalComment(body: string): {
  decision: "APPROVED" | "REJECTED";
  batchId: string;
  requestDigest: string;
  requestId: string;
} | null {
  const marker = parseMockBatchPlaneMarker(body, "execution-approval");
  const decision = marker.get("decision");
  const batchId = marker.get("batchId");
  const requestDigest = marker.get("requestDigest");
  const requestId = marker.get("requestId");

  if (decision !== "APPROVED" && decision !== "REJECTED") {
    return null;
  }

  if (!batchId || !requestDigest || !requestId) {
    return null;
  }

  if (
    decision === "APPROVED" &&
    parseMockApprovalCommandDigest(body) !== requestDigest
  ) {
    return null;
  }

  return {
    batchId,
    decision,
    requestDigest,
    requestId,
  };
}

export function parseMockApprovalCommandDigest(body: string): string | null {
  const firstLine = body.split("\n", 1)[0]?.trim();
  const match = firstLine?.match(/^\/bgcp approve\s+requestDigest=(\S+)$/);

  return match?.[1] ?? null;
}

export function parseMockDispatcherStatus(body: string): {
  status: "DISPATCHING" | "DISPATCHED" | "DISPATCH_FAILED";
  batchId: string;
  requestDigest: string;
  requestId: string;
} | null {
  const marker = parseMockBatchPlaneMarker(body, "bgcp:dispatcher");
  const status = marker.get("status");
  const batchId = marker.get("batchId");
  const requestDigest = marker.get("requestDigest");
  const requestId = marker.get("requestId");

  if (
    status !== "DISPATCHING" &&
    status !== "DISPATCHED" &&
    status !== "DISPATCH_FAILED"
  ) {
    return null;
  }

  if (!batchId || !requestDigest || !requestId) {
    return null;
  }

  return {
    batchId,
    requestDigest,
    requestId,
    status,
  };
}

export function applyMockExecutionApprovalTransition(
  state: GitHubLiteMockState,
  issueNumber: number,
  approval: {
    decision: "APPROVED" | "REJECTED";
    batchId: string;
    requestDigest: string;
    requestId: string;
  },
): void {
  const scenario = findMatchingMockExecutionScenario(
    state,
    issueNumber,
    approval,
  );

  if (!scenario) {
    return;
  }

  const issue = findMockIssue(state, issueNumber);

  if (approval.decision === "APPROVED") {
    if (scenario.state === "requested") {
      scenario.state = "approved";
    }

    return;
  }

  scenario.state = "rejected";
  issue.labels = uniqueStrings([...issue.labels, batchPlaneLabel("rejected")]);
  ensureMockLabel(state, "batchplane:rejected");
  issue.state = "closed";
}

export function applyMockDispatcherStatusTransition(
  state: GitHubLiteMockState,
  issueNumber: number,
  dispatcherStatus: {
    status: "DISPATCHING" | "DISPATCHED" | "DISPATCH_FAILED";
    batchId: string;
    requestDigest: string;
    requestId: string;
  },
): void {
  const scenario = findMatchingMockExecutionScenario(
    state,
    issueNumber,
    dispatcherStatus,
  );

  if (!scenario) {
    return;
  }

  const issue = findMockIssue(state, issueNumber);
  const { status } = dispatcherStatus;

  if (status === "DISPATCHING") {
    scenario.state = "dispatching";
    issue.labels = uniqueStrings([
      ...issue.labels,
      batchPlaneLabel("dispatching"),
    ]);
    ensureMockLabel(state, "batchplane:dispatching");
    ensureMockWorkflowRun(state, scenario, status);
    return;
  }

  if (status === "DISPATCHED") {
    scenario.state = "dispatched";
    issue.labels = uniqueStrings([
      ...removeBatchPlaneLabel(issue.labels, "dispatching"),
      batchPlaneLabel("dispatched"),
    ]);
    ensureMockLabel(state, "batchplane:dispatched");
    issue.state = "closed";
    ensureMockWorkflowRun(state, scenario, status);
    return;
  }

  scenario.state = "failed";
  issue.labels = uniqueStrings([
    ...removeBatchPlaneLabel(issue.labels, "dispatching"),
    batchPlaneLabel("dispatch-failed"),
  ]);
  ensureMockLabel(state, "batchplane:dispatch-failed");
}

export function findMatchingMockExecutionScenario(
  state: GitHubLiteMockState,
  issueNumber: number,
  evidence: {
    batchId: string;
    requestDigest: string;
    requestId: string;
  },
): GitHubLiteMockExecutionScenario | null {
  return (
    state.executionScenarios.find(
      (scenario) =>
        scenario.issueNumber === issueNumber &&
        scenario.batchId === evidence.batchId &&
        scenario.requestDigest === evidence.requestDigest &&
        scenario.requestId === evidence.requestId,
    ) ?? null
  );
}

export function ensureMockWorkflowRun(
  state: GitHubLiteMockState,
  scenario: GitHubLiteMockExecutionScenario,
  status: "DISPATCHING" | "DISPATCHED" | "DISPATCH_FAILED",
): void {
  const runStatus: GitHubWorkflowRunStatus =
    status === "DISPATCHING" ? "in_progress" : "completed";
  const conclusion: GitHubWorkflowRunConclusion =
    status === "DISPATCHING"
      ? null
      : status === "DISPATCHED"
        ? "success"
        : "failure";
  const workflowId =
    state.workflows.find((workflow) =>
      workflow.path.endsWith(`/${scenario.batchId}.yml`),
    )?.id ??
    state.workflows[0]?.id ??
    0;

  if (scenario.workflowRunId) {
    const workflowRun = state.workflowRuns.find(
      (candidate) => candidate.id === scenario.workflowRunId,
    );

    if (workflowRun) {
      workflowRun.status = runStatus;
      workflowRun.conclusion = conclusion;
      return;
    }
  }

  const workflowRunId = nextMockNumber(
    state.workflowRuns.map((workflowRun) => workflowRun.id),
  );
  scenario.workflowRunId = workflowRunId;
  state.workflowRuns.push({
    actor: "github-actions[bot]",
    batchId: scenario.batchId,
    conclusion,
    createdAt: new Date(0).toISOString(),
    displayTitle: `BatchPlane ${scenario.batchId} ${scenario.requestId}`,
    event: "workflow_dispatch",
    id: workflowRunId,
    name: `Run ${scenario.batchId}`,
    requestId: scenario.requestId,
    runAttempt: 1,
    startedAt: new Date(0).toISOString(),
    status: runStatus,
    updatedAt: new Date(0).toISOString(),
    url: `${state.repository.url}/actions/runs/${workflowRunId}`,
    workflowId,
    workflowPath: `.github/workflows/${scenario.batchId}.yml`,
  });
}

export function parseMockBatchPlaneMarker(
  body: string,
  kind: string,
): Map<string, string> {
  const marker = new Map<string, string>();
  const match = body.match(
    new RegExp(`<!--\\s*batch(?:plane|trail):${kind}\\s*([\\s\\S]*?)-->`),
  );

  if (!match?.[1]) {
    return marker;
  }

  for (const line of match[1].split("\n")) {
    const separatorIndex = line.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    marker.set(
      line.slice(0, separatorIndex).trim(),
      line.slice(separatorIndex + 1).trim(),
    );
  }

  return marker;
}
