import type { BatchPlaneRuntimePorts } from "@batchplane/domain";
import {
  createGitHubLiteGovernedChangeClient,
  createGitHubLiteBatchRevisionClient,
  createGitHubLiteMockState,
  createMockGitHubLiteClient,
  getNativeScheduleWorkflowJobIdentity,
  type GitHubLiteMockExecutionState,
  type GitHubLiteMockState,
  type GitHubWorkflowJob,
  type MockGitHubLiteClient,
} from "@batchplane/github-lite";
import type { BatchPlaneClient } from "@batchplane/ui-client";

import {
  readGitHubSession,
  type GitHubSession,
} from "../features/lite-setup/github-session";
import {
  buildSampleTargetWorkflowYaml,
  buildWorkspacePolicyYaml,
} from "../features/lite-setup/installation-model";
import { createGitHubLiteRuntime } from "./github-lite-runtime";

export const runtimeFixtureStorageKey = "batchplane.dev.runtimeFixture";
export const legacyRuntimeFixtureStorageKey = "batchtrail.dev.runtimeFixture";

export const runtimeFixtureIds = [
  "batch-control-bypassed",
  "batch-control-bypassed-clean",
  "batch-control-unknown",
  "batch-control-verified",
  "live",
  "happy-path",
  "approval-pending",
  "business-failed",
  "dispatch-failed",
  "gate-blocked",
  "requestless-gate-deny",
  "gate-verification-unknown",
  "native-schedule-success",
  "native-schedule-failure",
  "native-schedule-blocked",
  "native-schedule-unconfirmed",
  "native-schedule-running",
  "native-schedule-mixed",
  "native-schedule-source-unconfirmed",
] as const;

export type RuntimeFixtureId = (typeof runtimeFixtureIds)[number];

export const runtimeFixtureOptions = runtimeFixtureIds.map((id) => ({
  id,
  labelKey: `devRuntime.options.${id}`,
}));

const mockRuntimeSession: GitHubSession = {
  owner: "always0ne",
  repo: "batch",
  token: "fixture-token",
};

const fixtureScenarioStates: Partial<
  Record<Exclude<RuntimeFixtureId, "live">, GitHubLiteMockExecutionState>
> = {
  "batch-control-bypassed": "requested",
  "batch-control-bypassed-clean": "requested",
  "batch-control-unknown": "requested",
  "batch-control-verified": "requested",
  "approval-pending": "requested",
  "business-failed": "business-failed",
  "dispatch-failed": "failed",
  "gate-blocked": "gate-blocked",
  "requestless-gate-deny": "gate-blocked",
  "gate-verification-unknown": "gate-blocked",
  "happy-path": "dispatched",
};

let activeFixtureId: RuntimeFixtureId | null = null;
let activeMockClient: MockGitHubLiteClient | null = null;
const approvedRevisionFixtureSetup = new Map<
  Exclude<RuntimeFixtureId, "live">,
  Promise<void>
>();

export function isRuntimeFixtureSwitcherEnabled(): boolean {
  return import.meta.env.DEV;
}

export function readRuntimeFixtureSelection(
  storage: Pick<Storage, "getItem"> | null = getFixtureStorage(),
): RuntimeFixtureId {
  if (!isRuntimeFixtureSwitcherEnabled() || !storage) {
    return "live";
  }

  const storedValue =
    storage.getItem(runtimeFixtureStorageKey) ??
    storage.getItem(legacyRuntimeFixtureStorageKey);

  return isRuntimeFixtureId(storedValue) ? storedValue : "live";
}

export function writeRuntimeFixtureSelection(
  fixtureId: RuntimeFixtureId,
  storage: Pick<Storage, "setItem"> | null = getFixtureStorage(),
): void {
  if (!isRuntimeFixtureSwitcherEnabled() || !storage) {
    return;
  }

  storage.setItem(runtimeFixtureStorageKey, fixtureId);
  activeFixtureId = null;
  activeMockClient = null;
  approvedRevisionFixtureSetup.clear();
}

export function readRuntimeSession(): GitHubSession | null {
  return readRuntimeFixtureSelection() === "live"
    ? readGitHubSession()
    : mockRuntimeSession;
}

export function createBatchPlaneRuntime(
  session: GitHubSession,
): BatchPlaneRuntimePorts {
  const fixtureId = readRuntimeFixtureSelection();

  if (fixtureId === "live") {
    return createGitHubLiteRuntime(session);
  }

  const runtime = createGitHubLiteRuntime(mockRuntimeSession, {
    client: getRuntimeFixtureClient(fixtureId),
  });

  return {
    ...runtime,
    executions: {
      ...runtime.executions,
      async getApprovedBatchRevision(input) {
        await ensureApprovedRevisionFixture(fixtureId);
        return runtime.executions.getApprovedBatchRevision(input);
      },
    },
  };
}

export function createRuntimeGovernedChangeClient(
  session: GitHubSession,
): Pick<
  BatchPlaneClient,
  | "approveGovernedChange"
  | "createBatchChangeRequest"
  | "getGovernedChange"
  | "getBatchChangeBlocker"
  | "getBatchRemediationCapability"
  | "loadBatchChangeDraft"
  | "previewBatchChange"
  | "requestBatchRemediation"
  | "rejectGovernedChange"
  | "withdrawGovernedChange"
> {
  const fixtureId = readRuntimeFixtureSelection();

  if (fixtureId === "live")
    return createGitHubLiteGovernedChangeClient(session);

  const client = createGitHubLiteGovernedChangeClient(
    mockRuntimeSession,
    getRuntimeFixtureClient(fixtureId),
  );

  return {
    ...client,
    async getBatchRemediationCapability(input) {
      await ensureApprovedRevisionFixture(fixtureId);
      return client.getBatchRemediationCapability(input);
    },
    async requestBatchRemediation(input) {
      await ensureApprovedRevisionFixture(fixtureId);
      return client.requestBatchRemediation(input);
    },
  };
}

/**
 * Batch control reads must follow the same selected fixture client as runtime
 * and governed-change operations. This keeps browser fixtures offline.
 */
export function createRuntimeBatchRevisionClient(session: GitHubSession) {
  const fixtureId = readRuntimeFixtureSelection();

  if (fixtureId === "live") {
    return createGitHubLiteBatchRevisionClient(session);
  }

  const client = createGitHubLiteBatchRevisionClient(
    mockRuntimeSession,
    getRuntimeFixtureClient(fixtureId),
  );

  return {
    ...client,
    async verifyApprovedBatchRevision(
      input: Parameters<typeof client.verifyApprovedBatchRevision>[0],
    ) {
      await ensureApprovedRevisionFixture(fixtureId);

      if (fixtureId === "batch-control-unknown") {
        return {
          controlStatus: "UNKNOWN" as const,
          reasonCode: "APPROVED_BATCH_REVISION_UNAVAILABLE" as const,
        };
      }

      return client.verifyApprovedBatchRevision(input);
    },
  };
}

async function ensureApprovedRevisionFixture(
  fixtureId: Exclude<RuntimeFixtureId, "live">,
): Promise<void> {
  if (
    fixtureId !== "batch-control-verified" &&
    fixtureId !== "batch-control-bypassed-clean" &&
    fixtureId !== "happy-path"
  ) {
    return;
  }

  let setup = approvedRevisionFixtureSetup.get(fixtureId);

  if (!setup) {
    const client = getRuntimeFixtureClient(fixtureId);
    setup = prepareRuntimeFixtureClient(client, fixtureId);
    approvedRevisionFixtureSetup.set(fixtureId, setup);
  }

  await setup;
}

/** Prepares the same offline approved revision used by browser fixtures. */
export async function prepareRuntimeFixtureClient(
  client: MockGitHubLiteClient,
  fixtureId: Exclude<RuntimeFixtureId, "live">,
): Promise<void> {
  if (
    fixtureId !== "batch-control-verified" &&
    fixtureId !== "batch-control-bypassed-clean" &&
    fixtureId !== "happy-path"
  ) {
    return;
  }

  const governedChanges = createGitHubLiteGovernedChangeClient(
    mockRuntimeSession,
    client,
  );
  // The baseline's open execution Issue exercises list/run fixtures, but it
  // must not block this distinct approved-revision setup.
  client.state.executionScenarios = [];
  client.state.issueComments = [];
  client.state.issues = [];
  const fixtureActor = client.state.currentUser.login;
  client.state.currentUser.login = "developer";
  const draft = await governedChanges.loadBatchChangeDraft({
    batchId: "payment.daily-close",
    mode: "change",
  });
  const created = await governedChanges.createBatchChangeRequest(draft);

  if (created.request.reviewState !== "MERGED") {
    client.state.currentUser.login = "maintainer";
    await governedChanges.approveGovernedChange({
      requestLocator: created.request.requestLocator,
    });
  }
  client.state.currentUser.login = fixtureActor;

  if (fixtureId === "batch-control-bypassed-clean") {
    const definitionPath = ".batch-governance/batches/payment.daily-close.yml";
    const definition = await client.getFile({
      ...mockRuntimeSession,
      path: definitionPath,
      ref: "main",
    });
    if (!definition) throw new Error("Expected Batch definition fixture.");
    await client.putFile({
      ...mockRuntimeSession,
      branch: "main",
      content: `${definition.content}\n# fixture: unauthorized current revision\n`,
      message: "Fixture unauthorized Batch revision",
      path: definitionPath,
      sha: definition.sha,
    });
  }
}

export function createRuntimeFixtureMockState(
  fixtureId: Exclude<RuntimeFixtureId, "live">,
): GitHubLiteMockState {
  const nativeFixture = createNativeScheduleFixture(fixtureId);
  if (nativeFixture) {
    return nativeFixture.state;
  }

  const state = createGitHubLiteMockState();
  const scenarioState = fixtureScenarioStates[fixtureId];
  if (!scenarioState) {
    throw new Error(`Unknown runtime fixture state: ${fixtureId}`);
  }
  const executionScenarios = state.executionScenarios.filter(
    (scenario) => scenario.state === scenarioState,
  );
  const issueNumbers = new Set(
    executionScenarios.map((scenario) => scenario.issueNumber),
  );
  const requestIds = new Set(
    executionScenarios.map((scenario) => scenario.requestId),
  );
  const requestlessRunFixture =
    fixtureId === "requestless-gate-deny" ||
    fixtureId === "gate-verification-unknown";
  const workflowRuns = requestlessRunFixture
    ? state.workflowRuns
        .filter((workflowRun) => requestIds.has(workflowRun.requestId ?? ""))
        .map((workflowRun) => ({
          ...workflowRun,
          displayTitle: `BatchPlane ${workflowRun.batchId ?? workflowRun.name}`,
          requestId: undefined,
        }))
    : state.workflowRuns.filter(
        (workflowRun) =>
          workflowRun.requestId !== undefined &&
          requestIds.has(workflowRun.requestId),
      );

  return {
    ...state,
    executionScenarios,
    files: [
      ...state.files,
      {
        branch: "main",
        content: buildSampleTargetWorkflowYaml(),
        path: ".github/workflows/batchplane-sample-target.yml",
        sha: "mock-sample-target-sha",
      },
      {
        branch: "main",
        content: buildWorkspacePolicyYaml(),
        path: ".batch-governance/workspace.yml",
        sha: "mock-workspace-policy-sha",
      },
    ],
    issueComments: requestlessRunFixture
      ? []
      : state.issueComments.filter((comment) =>
          issueNumbers.has(comment.issueNumber),
        ),
    issues: requestlessRunFixture
      ? []
      : state.issues.filter((issue) => issueNumbers.has(issue.number)),
    pullRequests: [],
    workflowRuns,
  };
}

function getRuntimeFixtureClient(
  fixtureId: Exclude<RuntimeFixtureId, "live">,
): MockGitHubLiteClient {
  if (activeFixtureId === fixtureId && activeMockClient) {
    return activeMockClient;
  }

  activeFixtureId = fixtureId;
  activeMockClient = createMockGitHubLiteClient(
    createRuntimeFixtureMockState(fixtureId),
  );

  const nativeFixture = createNativeScheduleFixture(fixtureId);
  if (nativeFixture) {
    configureNativeScheduleFixtureClient(activeMockClient, nativeFixture);
  }

  if (fixtureId === "gate-verification-unknown") {
    const getWorkflowJobLog =
      activeMockClient.getWorkflowJobLog.bind(activeMockClient);

    activeMockClient.getWorkflowJobLog = async (params) => {
      const log = await getWorkflowJobLog(params);

      return {
        ...log,
        content:
          "2026-05-14T01:07:05.000Z BATCHPLANE_GATE_RESULT {unreadable-record",
      };
    };
  }

  return activeMockClient;
}

function isRuntimeFixtureId(value: string | null): value is RuntimeFixtureId {
  return runtimeFixtureIds.some((fixtureId) => fixtureId === value);
}

type NativeFixtureOutcome =
  | "SUCCEEDED"
  | "FAILED"
  | "BLOCKED"
  | "UNCONFIRMED"
  | "RUNNING";

type NativeFixtureOccurrence = {
  issueNumber: number;
  outcome: NativeFixtureOutcome;
  requestDigest: string;
  requestId: string;
  runAttempt: number;
  scheduleId: string;
};

type NativeScheduleFixture = {
  jobsByAttempt: Map<string, GitHubWorkflowJob[]>;
  logsByJobId: Map<number, string>;
  state: GitHubLiteMockState;
};

const nativeScheduleFixtureOccurrences: NativeFixtureOccurrence[] = [
  {
    issueNumber: 901,
    outcome: "SUCCEEDED",
    requestDigest: `sha256:${"a".repeat(64)}`,
    requestId: `btr-schedule-${"a".repeat(64)}`,
    runAttempt: 1,
    scheduleId: "weekday-close",
  },
  {
    issueNumber: 902,
    outcome: "FAILED",
    requestDigest: `sha256:${"b".repeat(64)}`,
    requestId: `btr-schedule-${"b".repeat(64)}`,
    runAttempt: 1,
    scheduleId: "weekday-open",
  },
  {
    issueNumber: 901,
    outcome: "BLOCKED",
    requestDigest: `sha256:${"a".repeat(64)}`,
    requestId: `btr-schedule-${"a".repeat(64)}`,
    runAttempt: 2,
    scheduleId: "weekday-close",
  },
  {
    issueNumber: 902,
    outcome: "UNCONFIRMED",
    requestDigest: `sha256:${"b".repeat(64)}`,
    requestId: `btr-schedule-${"b".repeat(64)}`,
    runAttempt: 2,
    scheduleId: "weekday-open",
  },
];

const nativeScheduleRunningFixtureOccurrence: NativeFixtureOccurrence = {
  issueNumber: 903,
  outcome: "RUNNING",
  requestDigest: `sha256:${"c".repeat(64)}`,
  requestId: `btr-schedule-${"c".repeat(64)}`,
  runAttempt: 1,
  scheduleId: "weekday-reconcile",
};

function createNativeScheduleFixture(
  fixtureId: Exclude<RuntimeFixtureId, "live">,
): NativeScheduleFixture | null {
  const outcomeByFixture: Partial<
    Record<typeof fixtureId, NativeFixtureOutcome>
  > = {
    "native-schedule-blocked": "BLOCKED",
    "native-schedule-failure": "FAILED",
    "native-schedule-success": "SUCCEEDED",
    "native-schedule-unconfirmed": "UNCONFIRMED",
    "native-schedule-running": "RUNNING",
  };
  const requestedOutcome = outcomeByFixture[fixtureId];
  const occurrences =
    fixtureId === "native-schedule-mixed" ||
    fixtureId === "native-schedule-source-unconfirmed"
      ? nativeScheduleFixtureOccurrences
      : fixtureId === "native-schedule-running"
        ? [nativeScheduleRunningFixtureOccurrence]
        : requestedOutcome
          ? nativeScheduleFixtureOccurrences.filter(
              (occurrence) => occurrence.outcome === requestedOutcome,
            )
          : [];
  if (occurrences.length === 0) return null;

  const state = createGitHubLiteMockState();
  const repositoryId = "99";
  const batchId = "payment.daily-close";
  const workflowPath = `.github/workflows/${batchId}.yml`;
  const sourceRunId = "900";
  const distinctRequests = Array.from(
    new Map(
      occurrences.map((occurrence) => [occurrence.requestId, occurrence]),
    ).values(),
  );
  const jobsByAttempt = new Map<string, GitHubWorkflowJob[]>();
  const logsByJobId = new Map<number, string>();

  state.executionScenarios = [];
  state.issues = distinctRequests.map((occurrence) => ({
    author: "github-actions[bot]",
    body: nativeScheduleIssueBody({
      batchId,
      occurrence,
      repositoryId,
      sourceRunId,
      workflowPath,
    }),
    createdAt: "2026-09-11T01:00:00.000Z",
    isPullRequest: false,
    labels: ["batchplane:execution-request", "batchplane:scheduled-execution"],
    number: occurrence.issueNumber,
    state: "open",
    title: `Native schedule ${occurrence.scheduleId} for ${batchId}`,
    url: `${state.repository.url}/issues/${occurrence.issueNumber}`,
  }));
  state.issueComments = occurrences.map((occurrence) => ({
    author: "github-actions[bot]",
    body: nativeScheduleResultMarker({
      batchId,
      occurrence,
      repositoryId,
      sourceRunId,
    }),
    createdAt: `2026-09-11T01:0${occurrence.runAttempt}:06.000Z`,
    id: occurrence.runAttempt * 100_000 + occurrence.issueNumber,
    issueNumber: occurrence.issueNumber,
  }));
  state.workflowRuns = Array.from(
    new Set(occurrences.map((item) => item.runAttempt)),
  ).map((runAttempt) => ({
    actor: "github-actions[bot]",
    batchId,
    conclusion: "failure" as const,
    createdAt: `2026-09-11T01:0${runAttempt}:00.000Z`,
    displayTitle: `Native schedule ${batchId} attempt ${runAttempt}`,
    event: "schedule" as const,
    id: Number(sourceRunId),
    name: `Run ${batchId}`,
    repositoryId,
    runAttempt,
    startedAt: `2026-09-11T01:0${runAttempt}:00.000Z`,
    status: "completed" as const,
    updatedAt: `2026-09-11T01:0${runAttempt}:10.000Z`,
    url: `${state.repository.url}/actions/runs/${sourceRunId}/attempts/${runAttempt}`,
    workflowId: 101,
    workflowPath,
  }));

  for (const occurrence of occurrences) {
    const identity = getNativeScheduleWorkflowJobIdentity({
      scheduleId: occurrence.scheduleId,
    });
    const baseJobId =
      occurrence.runAttempt * 1_000_000 + occurrence.issueNumber * 10;
    const controlJobId = baseJobId + 1;
    const businessJobId = baseJobId + 2;
    const blocked = occurrence.outcome === "BLOCKED";
    const failed = occurrence.outcome === "FAILED";
    const running = occurrence.outcome === "RUNNING";
    const jobs: GitHubWorkflowJob[] = [
      nativeFixtureJob({
        conclusion: "success",
        id: controlJobId,
        name: identity.controlJobName,
        stepName: "Verify approved native schedule evidence",
      }),
      nativeFixtureJob({
        conclusion: running ? null : blocked || failed ? "failure" : "success",
        id: businessJobId,
        name: identity.businessJobName,
        runConclusion:
          blocked || running ? undefined : failed ? "failure" : "success",
        status: running ? "in_progress" : "completed",
        stepName: "Reverify approved native schedule evidence",
      }),
    ];
    const key = nativeAttemptKey(Number(sourceRunId), occurrence.runAttempt);
    jobsByAttempt.set(key, [...(jobsByAttempt.get(key) ?? []), ...jobs]);
    const gateOccurrence =
      occurrence.outcome === "UNCONFIRMED"
        ? nativeScheduleFixtureOccurrences.find(
            (candidate) => candidate.scheduleId !== occurrence.scheduleId,
          )!
        : occurrence;
    logsByJobId.set(
      controlJobId,
      nativeFixtureGateLog({
        allowed: true,
        batchId,
        gateJob: identity.controlJobId,
        gateJobName: identity.controlJobName,
        occurrence: gateOccurrence,
        runAttempt: occurrence.runAttempt,
        runId: Number(sourceRunId),
        step: "Verify approved native schedule evidence",
      }),
    );
    logsByJobId.set(
      businessJobId,
      [
        nativeFixtureGateLog({
          allowed: !blocked,
          batchId,
          gateJob: identity.businessJobId,
          gateJobName: identity.businessJobName,
          occurrence: gateOccurrence,
          reasonCode: blocked ? "RERUN_NOT_AUTHORIZED" : undefined,
          runAttempt: occurrence.runAttempt,
          runId: Number(sourceRunId),
          step: "Reverify approved native schedule evidence",
        }),
        ...(!blocked && !running
          ? [
              "2026-09-11T01:01:04.000Z ##[group]BatchPlane batch command",
              "2026-09-11T01:01:04.100Z echo native fixture",
              "2026-09-11T01:01:04.150Z native fixture",
              `2026-09-11T01:01:04.200Z Native batch ${occurrence.scheduleId} ${failed ? "failed: ledger unavailable" : "completed successfully"}`,
              ...(failed
                ? [
                    "2026-09-11T01:01:04.300Z ##[error]Process completed with exit code 1.",
                  ]
                : []),
              "2026-09-11T01:01:05.000Z ##[endgroup]",
            ]
          : []),
      ].join("\n"),
    );
  }

  if (fixtureId === "native-schedule-source-unconfirmed") {
    state.issues = [];
    state.issueComments = [];
  }
  return { jobsByAttempt, logsByJobId, state };
}

function configureNativeScheduleFixtureClient(
  client: MockGitHubLiteClient,
  fixture: NativeScheduleFixture,
): void {
  const listWorkflowRunJobs = client.listWorkflowRunJobs.bind(client);
  const getWorkflowJobLog = client.getWorkflowJobLog.bind(client);
  client.listWorkflowRunJobs = async (params) =>
    fixture.jobsByAttempt.get(
      nativeAttemptKey(params.runId, params.runAttempt ?? 1),
    ) ?? listWorkflowRunJobs(params);
  client.getWorkflowJobLog = async (params) => {
    const content = fixture.logsByJobId.get(params.jobId);
    if (content === undefined) return getWorkflowJobLog(params);
    return {
      content,
      jobId: params.jobId,
      sizeBytes: new TextEncoder().encode(content).byteLength,
      truncated: false,
    };
  };
}

function nativeFixtureJob({
  conclusion,
  id,
  name,
  runConclusion,
  status = "completed",
  stepName,
}: {
  conclusion: "success" | "failure" | null;
  id: number;
  name: string;
  runConclusion?: "success" | "failure";
  status?: "completed" | "in_progress";
  stepName: string;
}): GitHubWorkflowJob {
  return {
    ...(status === "completed"
      ? {
          completedAt: runConclusion
            ? "2026-09-11T01:01:05.000Z"
            : "2026-09-11T01:01:03.000Z",
        }
      : {}),
    conclusion,
    id,
    name,
    startedAt: "2026-09-11T01:01:01.000Z",
    status,
    steps: [
      {
        ...(status === "completed"
          ? { completedAt: "2026-09-11T01:01:03.000Z" }
          : {}),
        conclusion,
        name: stepName,
        number: 1,
        startedAt: "2026-09-11T01:01:01.000Z",
        status,
      },
      ...(runConclusion
        ? [
            {
              completedAt: "2026-09-11T01:01:05.000Z",
              conclusion: runConclusion,
              name: "Run batch",
              number: 2,
              startedAt: "2026-09-11T01:01:04.000Z",
              status: "completed" as const,
            },
          ]
        : []),
    ],
    url: `https://github.com/always0ne/batch/actions/runs/900/job/${id}`,
  };
}

function nativeFixtureGateLog({
  allowed,
  batchId,
  gateJob,
  gateJobName,
  occurrence,
  reasonCode,
  runAttempt,
  runId,
  step,
}: {
  allowed: boolean;
  batchId: string;
  gateJob: string;
  gateJobName: string;
  occurrence: NativeFixtureOccurrence;
  reasonCode?: string;
  runAttempt: number;
  runId: number;
  step: string;
}): string {
  return `2026-09-11T01:01:02.000Z BATCHPLANE_GATE_RESULT ${JSON.stringify({
    batchId,
    gateJob,
    gateJobName,
    gateStep: step,
    message: allowed
      ? "Native schedule evidence verified."
      : "Native schedule recheck denied.",
    ...(reasonCode ? { reasonCode } : {}),
    repository: "always0ne/batch",
    requestDigest: occurrence.requestDigest,
    requestId: occurrence.requestId,
    result: allowed ? "ALLOW" : "DENY",
    runAttempt,
    runId: String(runId),
    scheduleId: occurrence.scheduleId,
    version: 1,
  })}`;
}

function nativeScheduleIssueBody({
  batchId,
  occurrence,
  repositoryId,
  sourceRunId,
  workflowPath,
}: {
  batchId: string;
  occurrence: NativeFixtureOccurrence;
  repositoryId: string;
  sourceRunId: string;
  workflowPath: string;
}): string {
  const payload = {
    apiVersion: "batchplane.io/v1",
    kind: "ExecutionRequest",
    metadata: { batchId, requestId: occurrence.requestId },
    spec: {
      approvedBatchRevision: {
        governedChangeId: "bgc-payment-daily-close-approved",
        targetRevisionDigest: `sha256:${"c".repeat(64)}`,
      },
      batch: {
        criticality: "HIGH",
        domain: "payments",
        environment: "PROD",
        name: "Daily Close",
        owner: "maintainer",
      },
      contractVersion: "NATIVE_SCHEDULE_V2",
      execution: {
        command: "echo native fixture",
        gateRequired: true,
        runsOn: "ubuntu-latest",
      },
      reason: "Native schedule fixture.",
      requestedAt: "2026-09-11T01:00:00.000Z",
      requestedBy: "github-actions[bot]",
      schedule: {
        definitionCommitSha: "fixture-workflow-sha",
        definitionPath: `.batch-governance/batches/${batchId}.yml`,
        repositoryId,
        scheduleId: occurrence.scheduleId,
        sourceRunAttempt: 1,
        sourceRunId,
      },
      triggerType: "SCHEDULE",
      workflow: { path: workflowPath, ref: "main" },
    },
  };
  return [
    "## BatchPlane Execution Request",
    "",
    `- Request ID: \`${occurrence.requestId}\``,
    `- Batch ID: \`${batchId}\``,
    "- Requested by: @github-actions[bot]",
    "- Requested at: 2026-09-11T01:00:00.000Z",
    `- Request digest: \`${occurrence.requestDigest}\``,
    "",
    "### Canonical payload",
    "",
    "```json",
    JSON.stringify(payload, null, 2),
    "```",
    "",
    "<!-- batchplane:execution-request",
    `requestId=${occurrence.requestId}`,
    `batchId=${batchId}`,
    `requestDigest=${occurrence.requestDigest}`,
    "status=REQUESTED",
    "-->",
  ].join("\n");
}

function nativeScheduleResultMarker({
  batchId,
  occurrence,
  repositoryId,
  sourceRunId,
}: {
  batchId: string;
  occurrence: NativeFixtureOccurrence;
  repositoryId: string;
  sourceRunId: string;
}): string {
  // The marker deliberately carries arbitrary job strings: UI evidence must
  // derive the actual identities from scheduleId and Actions jobs instead.
  return [
    "<!-- batchplane:schedule-result",
    `requestId=${occurrence.requestId}`,
    `requestDigest=${occurrence.requestDigest}`,
    `batchId=${batchId}`,
    `scheduleId=${occurrence.scheduleId}`,
    `repositoryId=${repositoryId}`,
    `sourceRunId=${sourceRunId}`,
    `sourceRunAttempt=${occurrence.runAttempt}`,
    "controlJobId=swapped-control",
    "businessJobId=swapped-business",
    "-->",
  ].join("\n");
}

function nativeAttemptKey(runId: number, runAttempt: number): string {
  return `${runId}:${runAttempt}`;
}

function getFixtureStorage(): Pick<Storage, "getItem" | "setItem"> | null {
  return typeof window === "undefined" ? null : window.sessionStorage;
}
