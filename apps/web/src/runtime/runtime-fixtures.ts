import type { BatchPlaneRuntimePorts } from "@batchplane/domain";
import {
  createGitHubLiteGovernedChangeClient,
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

  return createGitHubLiteRuntime(mockRuntimeSession, {
    client: getRuntimeFixtureClient(fixtureId),
  });
}

export function createRuntimeGovernedChangeClient(
  session: GitHubSession,
): Pick<
  BatchPlaneClient,
  | "approveGovernedChange"
  | "createBatchChangeRequest"
  | "getGovernedChange"
  | "getBatchChangeBlocker"
  | "loadBatchChangeDraft"
  | "previewBatchChange"
  | "rejectGovernedChange"
  | "withdrawGovernedChange"
> {
  const fixtureId = readRuntimeFixtureSelection();

  return fixtureId === "live"
    ? createGitHubLiteGovernedChangeClient(session)
    : createGitHubLiteGovernedChangeClient(
        mockRuntimeSession,
        getRuntimeFixtureClient(fixtureId),
      );
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
