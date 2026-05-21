import type { BatchPlaneRuntimePorts } from "@batchtrail/domain";
import {
  createGitHubLiteMockState,
  createMockGitHubLiteClient,
  type GitHubLiteMockExecutionState,
  type GitHubLiteMockState,
  type MockGitHubLiteClient,
} from "@batchtrail/github-lite";

import {
  readGitHubSession,
  type GitHubSession,
} from "../features/lite-setup/github-session";
import { createGitHubLiteRuntime } from "./github-lite-runtime";

export const runtimeFixtureStorageKey = "batchtrail.dev.runtimeFixture";

export const runtimeFixtureIds = [
  "live",
  "happy-path",
  "approval-pending",
  "dispatch-failed",
  "gate-blocked",
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
  "dispatch-failed": "failed",
  "gate-blocked": "gate-blocked",
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

  const storedValue = storage.getItem(runtimeFixtureStorageKey);

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

  return {
    ...state,
    executionScenarios,
    issueComments: state.issueComments.filter((comment) =>
      issueNumbers.has(comment.issueNumber),
    ),
    issues: state.issues.filter((issue) => issueNumbers.has(issue.number)),
    pullRequests: [],
    workflowRuns: state.workflowRuns.filter(
      (workflowRun) =>
        workflowRun.requestId !== undefined &&
        requestIds.has(workflowRun.requestId),
    ),
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

  return activeMockClient;
}

function isRuntimeFixtureId(value: string | null): value is RuntimeFixtureId {
  return runtimeFixtureIds.some((fixtureId) => fixtureId === value);
}

function getFixtureStorage(): Pick<Storage, "getItem" | "setItem"> | null {
  return typeof window === "undefined" ? null : window.sessionStorage;
}
