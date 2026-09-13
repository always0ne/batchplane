import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import {
  buildExecutionRequestIssue,
  createScheduledExecutionRequestId,
  parseYamlDocument,
  type BatchDefinition,
  type BatchDefinitionFile,
  validateBatchDefinitionFile,
} from "@batchplane/domain";
import {
  createGitHubLiteClient,
  verifyApprovedBatchRevision,
  type ApprovedBatchRevisionResult,
} from "@batchplane/github-lite";

export type ScheduleRequestInput = {
  apiBaseUrl?: string;
  batchId: string;
  configPath: string;
  cron: string;
  definitionPath: string;
  fetcher?: typeof fetch;
  githubToken: string;
  eventName: string;
  now?: Date;
  eventSchedule?: string;
  repository: string;
  scheduleId: string;
  sha: string;
  repositoryId: string;
  sourceRunAttempt: number;
  sourceRunId: string;
  workflowPath: string;
  workflowRef: string;
  timezone: string;
  verifyBatchRevision?: (input: {
    batchId: string;
    executionWorkflowSha: string;
  }) => Promise<ApprovedBatchRevisionResult>;
};

export type ScheduleRequestResult = {
  issueNumber: number;
  requestDigest: string;
  requestId: string;
  status: "created";
};

type GitHubLabelDefinition = {
  color: string;
  description: string;
  name: string;
};

const requestLabels: GitHubLabelDefinition[] = [
  {
    color: "1D4ED8",
    description: "BatchPlane execution request issue",
    name: "batchplane:execution-request",
  },
  {
    color: "0F766E",
    description: "BatchPlane native scheduled execution request",
    name: "batchplane:scheduled-execution",
  },
];

export async function createNativeScheduledExecutionRequest(
  input: ScheduleRequestInput,
): Promise<ScheduleRequestResult> {
  assertNativeScheduleOccurrence(input);
  if (input.sourceRunAttempt !== 1) {
    throw new Error(
      "RERUN_NOT_AUTHORIZED: native schedule reruns cannot create a new occurrence.",
    );
  }
  const client = createScheduleRequestGitHubClient({
    apiBaseUrl: input.apiBaseUrl ?? "https://api.github.com",
    fetcher: input.fetcher ?? fetch,
    repository: input.repository,
    token: input.githubToken,
  });
  const definitionPath =
    input.definitionPath.trim() ||
    `${input.configPath.replace(/\/+$/u, "")}/batches/${input.batchId}.yml`;
  const batchFile = await client.getFile(definitionPath, input.sha);

  if (!batchFile) {
    throw new Error(
      `Batch definition was not found: ${definitionPath} (${input.sha}).`,
    );
  }

  const batch = parseBatchDefinition(batchFile.content, definitionPath);
  const revision = await resolveApprovedBatchRevision(input, batch.batchId);

  if (revision.controlStatus !== "VERIFIED") {
    throw new Error(
      revision.controlStatus === "UNKNOWN"
        ? "APPROVED_BATCH_REVISION_UNAVAILABLE: approved Batch revision could not be verified."
        : "UNAPPROVED_BATCH_REVISION: Batch revision does not match the latest approved governed change.",
    );
  }
  const schedule = (batch.schedules ?? []).find(
    (candidate) => candidate.scheduleId === input.scheduleId,
  );

  if (!schedule) {
    throw new Error(
      `Schedule ${input.scheduleId} was not found in ${definitionPath}.`,
    );
  }

  if (!schedule.enabled) {
    throw new Error(`Schedule ${input.scheduleId} is disabled.`);
  }

  if (schedule.cron.trim() !== input.cron.trim()) {
    throw new Error(
      `Schedule ${input.scheduleId} cron does not match workflow configuration.`,
    );
  }

  if (schedule.timezone.trim() !== input.timezone.trim()) {
    throw new Error(
      `Schedule ${input.scheduleId} timezone does not match workflow configuration.`,
    );
  }
  if (batch.workflow.path !== input.workflowPath) {
    throw new Error(
      "NATIVE_SCHEDULE_WORKFLOW_MISMATCH: the running workflow is not the registered Batch workflow.",
    );
  }
  if (batch.workflow.ref !== input.workflowRef) {
    throw new Error(
      "NATIVE_SCHEDULE_WORKFLOW_MISMATCH: the running workflow ref is not the registered Batch workflow ref.",
    );
  }

  const requestId = await createScheduledExecutionRequestId(
    batch.batchId,
    input.scheduleId,
    input.repositoryId,
    input.sourceRunId,
  );
  const existingIssue = await client.findIssueByRequestId(requestId);

  if (existingIssue) {
    throw new Error(
      `NATIVE_SCHEDULE_OCCURRENCE_ALREADY_RECORDED: ${requestId} already has Issue #${existingIssue.number}; no existing request can be reused as a fresh permit.`,
    );
  }

  await client.ensureLabels(requestLabels);
  const issue = await buildExecutionRequestIssue({
    approvedBatchRevision: revision.approvedRevision,
    batch,
    reason:
      "Native GitHub Actions schedule occurrence from an approved BatchPlane schedule.",
    requestId,
    requestedAt: input.now ?? new Date(),
    requestedBy: "github-actions[bot]",
    schedule: {
      definitionCommitSha: input.sha,
      definitionPath,
      repositoryId: input.repositoryId,
      scheduleId: input.scheduleId,
      sourceRunAttempt: input.sourceRunAttempt,
      sourceRunId: input.sourceRunId,
    },
    triggerType: "SCHEDULE",
    workflowRef: batch.workflow.ref,
  });
  const createdIssue = await client.createIssue(issue);
  return {
    issueNumber: createdIssue.number,
    requestDigest: issue.request.requestDigest,
    requestId,
    status: "created",
  };
}

export function readScheduleRequestInputFromEnv(
  env: Record<string, string | undefined> = process.env,
): ScheduleRequestInput {
  return {
    apiBaseUrl: env.GITHUB_API_URL,
    batchId: readActionInput(env, "batch-id"),
    configPath: readActionInput(env, "config-path") || ".batch-governance",
    cron: readActionInput(env, "cron"),
    definitionPath: readActionInput(env, "definition-path"),
    eventName: env.GITHUB_EVENT_NAME ?? "",
    eventSchedule: readNativeScheduleEvent(env),
    githubToken: readActionInput(env, "github-token") || env.GITHUB_TOKEN || "",
    repository: env.GITHUB_REPOSITORY || "",
    repositoryId: env.GITHUB_REPOSITORY_ID ?? "",
    scheduleId: readActionInput(env, "schedule-id"),
    sha: env.GITHUB_WORKFLOW_SHA ?? "",
    sourceRunAttempt: Number.parseInt(env.GITHUB_RUN_ATTEMPT ?? "", 10),
    sourceRunId: env.GITHUB_RUN_ID ?? "",
    workflowPath: readWorkflowPath(env.GITHUB_WORKFLOW_REF ?? ""),
    workflowRef: readWorkflowRef(env.GITHUB_WORKFLOW_REF ?? ""),
    timezone: readActionInput(env, "timezone"),
  };
}

export async function run(env = process.env): Promise<ScheduleRequestResult> {
  const input = readScheduleRequestInputFromEnv(env);
  let result: ScheduleRequestResult;
  try {
    result = await createNativeScheduledExecutionRequest(input);
  } catch (error) {
    const reason = toReasonCode(error);
    setActionOutput("request-id", "");
    setActionOutput("request-digest", "");
    setActionOutput("issue-number", "");
    setActionOutput("failure-reason", reason);
    throw error;
  }

  setActionOutput("status", result.status);
  setActionOutput("request-id", result.requestId);
  setActionOutput("request-digest", result.requestDigest);
  setActionOutput("issue-number", String(result.issueNumber ?? ""));
  setActionOutput("failure-reason", "");
  console.log(
    `BatchPlane native schedule occurrence resolved: ${input.sourceRunId} (${input.timezone}, ${input.cron})`,
  );

  return result;
}

function toReasonCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const match = /^([A-Z][A-Z0-9_]+):/u.exec(message);
  return match?.[1] ?? "SCHEDULE_REQUEST_FAILED";
}

type GitHubApiRequestError = Error & {
  status: number;
};

function createScheduleRequestGitHubClient({
  apiBaseUrl,
  fetcher,
  repository,
  token,
}: {
  apiBaseUrl: string;
  fetcher: typeof fetch;
  repository: string;
  token: string;
}) {
  const { owner, repo } = parseRepository(repository);

  async function request<T>(
    path: string,
    init: RequestInit = {},
    options: { allowNotFound?: boolean } = {},
  ): Promise<T | null> {
    const response = await fetcher(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...init.headers,
      },
    });

    if (response.status === 404 && options.allowNotFound) {
      return null;
    }

    if (!response.ok) {
      const error = new Error(
        `GitHub API request failed: ${response.status} ${await response.text()}`,
      ) as GitHubApiRequestError;
      error.status = response.status;
      throw error;
    }

    if (response.status === 204) {
      return null;
    }

    return (await response.json()) as T;
  }

  const repoPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  return {
    async createIssue(
      issue: Awaited<ReturnType<typeof buildExecutionRequestIssue>>,
    ) {
      const response = await request<{
        body: string | null;
        number: number;
        state?: string | null;
        title: string;
      }>(`${repoPath}/issues`, {
        body: JSON.stringify({
          body: issue.body,
          labels: issue.labels,
          title: issue.title,
        }),
        method: "POST",
      });

      if (!response) {
        throw new Error("GitHub issue response was empty.");
      }

      return {
        body: response.body ?? "",
        number: response.number,
        state: response.state ?? "open",
        title: response.title,
      };
    },

    async ensureLabels(labels: GitHubLabelDefinition[]) {
      for (const label of labels) {
        try {
          await request(`${repoPath}/labels`, {
            body: JSON.stringify(label),
            method: "POST",
          });
        } catch (error) {
          if (!isGitHubApiStatus(error, 422)) {
            throw error;
          }
        }
      }
    },

    async findIssueByRequestId(requestId: string) {
      for (let page = 1; page <= 10; page += 1) {
        const response = await request<
          Array<{
            body: string | null;
            number: number;
            pull_request?: unknown;
            state?: string | null;
            title: string;
          }>
        >(`${repoPath}/issues?state=all&per_page=100&page=${page}`);

        if (!response?.length) {
          break;
        }

        const matches = response.filter((issue) => {
          if (issue.pull_request) {
            return false;
          }

          return readRequestIdMarker(issue.body ?? "") === requestId;
        });

        if (matches.length > 0) {
          const match = matches[0];
          if (!match) {
            continue;
          }
          return {
            body: match.body ?? "",
            number: match.number,
            state: match.state ?? "open",
            title: match.title,
          };
        }
      }

      return null;
    },

    async getFile(path: string, ref: string) {
      const response = await request<{
        content?: string;
        encoding?: string;
        path: string;
      }>(
        `${repoPath}/contents/${encodePath(path)}?ref=${encodeURIComponent(
          ref,
        )}`,
        {},
        { allowNotFound: true },
      );

      if (!response?.content) {
        return null;
      }

      if (response.encoding !== "base64") {
        throw new Error(
          `Unsupported GitHub content encoding: ${response.encoding}.`,
        );
      }

      return {
        content: Buffer.from(response.content, "base64").toString("utf-8"),
        path: response.path,
      };
    },
  };
}

function readRequestIdMarker(body: string): string | undefined {
  const marker = body.match(
    /<!--\s*(?:batchplane|batchtrail):execution-request\s*([\s\S]*?)-->/u,
  );
  if (!marker?.[1]) return undefined;
  const line = marker[1]
    .split("\n")
    .find((candidate) => candidate.trimStart().startsWith("requestId="));
  return line?.slice(line.indexOf("=") + 1).trim() || undefined;
}

function parseBatchDefinition(content: string, path: string): BatchDefinition {
  const parsed = parseYamlDocument(content);

  if (!parsed.ok) {
    throw new Error(`Batch definition YAML is invalid: ${path}.`);
  }

  const validated = validateBatchDefinitionFile(parsed.value);

  if (!validated.ok) {
    throw new Error(`Batch definition is invalid: ${path}.`);
  }

  return fromBatchDefinitionFile(validated.value);
}

function fromBatchDefinitionFile(file: BatchDefinitionFile): BatchDefinition {
  return {
    batchId: file.metadata.id,
    criticality: file.spec.criticality,
    domain: file.spec.domain,
    environment: file.spec.environment,
    execution: file.spec.execution,
    gateRequired: file.spec.gateRequired,
    name: file.metadata.name,
    owner: file.spec.owner,
    schedules: file.spec.schedules?.map((schedule) => ({
      cron: schedule.cron,
      enabled: schedule.enabled,
      name: schedule.name,
      scheduleId: schedule.id,
      timezone: schedule.timezone,
    })),
    status: file.spec.status,
    workflow: file.spec.workflow,
  };
}

function assertNativeScheduleOccurrence(input: ScheduleRequestInput): void {
  if (input.eventName !== "schedule") {
    throw new Error(
      "NATIVE_SCHEDULE_EVENT_REQUIRED: schedule requests only run from GitHub's schedule event.",
    );
  }
  if (
    !input.eventSchedule?.trim() ||
    input.eventSchedule.trim() !== input.cron.trim()
  ) {
    throw new Error(
      "NATIVE_SCHEDULE_CRON_MISMATCH: GitHub event schedule does not match the registered cron.",
    );
  }
  if (
    !input.repositoryId.trim() ||
    !isPositiveIntegerString(input.sourceRunId) ||
    !input.workflowPath.trim() ||
    !input.workflowRef.trim() ||
    !input.sha.trim() ||
    !Number.isInteger(input.sourceRunAttempt) ||
    input.sourceRunAttempt < 1
  ) {
    throw new Error(
      "NATIVE_SCHEDULE_RUN_REQUIRED: repository and source Run identifiers are required.",
    );
  }
}

function isPositiveIntegerString(value: string): boolean {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0;
}

function readNativeScheduleEvent(
  env: Record<string, string | undefined>,
): string {
  const path = env.GITHUB_EVENT_PATH;
  if (!path) return "";
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as {
      schedule?: unknown;
    };
    return typeof value.schedule === "string" ? value.schedule : "";
  } catch {
    return "";
  }
}

function readWorkflowPath(workflowRef: string): string {
  const marker = "/.github/workflows/";
  const start = workflowRef.indexOf(marker);
  const end = workflowRef.lastIndexOf("@");
  return start >= 0 && end > start ? workflowRef.slice(start + 1, end) : "";
}

function readWorkflowRef(workflowRef: string): string {
  const separator = workflowRef.lastIndexOf("@");
  const value = separator >= 0 ? workflowRef.slice(separator + 1) : "";
  return value.replace(/^refs\/heads\//u, "").trim();
}

async function resolveApprovedBatchRevision(
  input: ScheduleRequestInput,
  batchId: string,
): Promise<ApprovedBatchRevisionResult> {
  if (input.verifyBatchRevision) {
    return input.verifyBatchRevision({
      batchId,
      executionWorkflowSha: input.sha,
    });
  }

  const { owner, repo } = parseRepository(input.repository);

  return verifyApprovedBatchRevision({
    batchId,
    client: createGitHubLiteClient({
      apiBaseUrl: input.apiBaseUrl ?? "https://api.github.com",
      fetcher: input.fetcher ?? fetch,
      token: input.githubToken,
    }),
    executionWorkflowSha: input.sha,
    repository: { owner, repo },
  });
}

function encodePath(path: string): string {
  return path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function parseRepository(value: string): { owner: string; repo: string } {
  const [owner = "", repo = ""] = value.split("/", 2);

  if (!owner || !repo) {
    throw new Error("GITHUB_REPOSITORY must be in owner/repo format.");
  }

  return { owner, repo };
}

function isGitHubApiStatus(error: unknown, status: number): boolean {
  return (
    error instanceof Error &&
    "status" in error &&
    typeof error.status === "number" &&
    error.status === status
  );
}

function readActionInput(
  env: Record<string, string | undefined>,
  name: string,
): string {
  return env[`INPUT_${name.replace(/ /g, "_").toUpperCase()}`]?.trim() ?? "";
}

function setActionOutput(name: string, value: string) {
  const outputPath = process.env.GITHUB_OUTPUT;

  if (!outputPath) {
    return;
  }

  appendFileSync(outputPath, `${name}=${value}\n`);
}

const invokedPath = process.argv[1];

if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
