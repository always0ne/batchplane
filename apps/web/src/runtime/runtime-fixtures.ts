import type { BatchPlaneRuntimePorts } from "@batchplane/domain";
import {
  createGitHubLiteGovernedChangeClient,
  createGitHubLiteBatchRevisionClient,
  createGitHubLiteMockState,
  createMockGitHubLiteClient,
  type GitHubLiteMockExecutionState,
  type GitHubLiteMockState,
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

const fixtureScenarioStates = {
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
} satisfies Record<
  Exclude<RuntimeFixtureId, "live">,
  GitHubLiteMockExecutionState
>;

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
  const state = createGitHubLiteMockState();
  const scenarioState = fixtureScenarioStates[fixtureId];
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

function getFixtureStorage(): Pick<Storage, "getItem" | "setItem"> | null {
  return typeof window === "undefined" ? null : window.sessionStorage;
}
