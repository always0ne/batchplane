import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { CronExpressionParser } from "cron-parser";

import {
  addHours,
  buildExecutionApprovalComment,
  buildExecutionRequestIssue,
  createScheduledExecutionRequestId,
  parseYamlDocument,
  type BatchDefinition,
  type BatchDefinitionFile,
  validateBatchDefinitionFile,
} from "@batchplane/domain";

export type ScheduleRequestInput = {
  apiBaseUrl?: string;
  batchId: string;
  configPath: string;
  cron: string;
  definitionPath: string;
  fetcher?: typeof fetch;
  githubToken: string;
  now?: Date;
  repository: string;
  scheduleId: string;
  sha: string;
  timezone: string;
};

export type ScheduleRequestResult = {
  approvalCommentId?: number;
  issueNumber?: number;
  requestDigest: string;
  requestId: string;
  scheduledAt: string;
  status: "already-dispatched" | "created" | "reused";
};

type ScheduledRequestComment = {
  author: string;
  body: string;
  createdAt: string;
  id: number;
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
    description: "BatchPlane delegated scheduled execution request",
    name: "batchplane:scheduled-execution",
  },
];

export async function createOrReuseScheduledExecutionRequest(
  input: ScheduleRequestInput,
): Promise<ScheduleRequestResult> {
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

  const scheduledAt = resolveScheduledAt({
    cron: input.cron,
    now: input.now ?? new Date(),
    timezone: input.timezone,
  });
  const requestId = createScheduledExecutionRequestId(
    batch.batchId,
    input.scheduleId,
    scheduledAt,
  );
  const existingIssue = await client.findIssueByRequestId(requestId);

  if (existingIssue) {
    const existingRequest = parseExecutionRequest(existingIssue.body);

    if (!existingRequest || existingRequest.requestId !== requestId) {
      throw new Error(
        `Scheduled execution request evidence is invalid for ${requestId}.`,
      );
    }

    const comments = await client.listIssueComments(existingIssue.number);
    const dispatcherStatus = findLatestDispatcherStatus(comments, requestId);

    if (
      dispatcherStatus === "DISPATCHED" ||
      dispatcherStatus === "DISPATCHING"
    ) {
      return {
        issueNumber: existingIssue.number,
        requestDigest: existingRequest.requestDigest,
        requestId,
        scheduledAt,
        status: "already-dispatched",
      };
    }

    const approvalComment = findLatestApprovalComment(comments, requestId);

    if (approvalComment) {
      return {
        approvalCommentId: approvalComment.id,
        issueNumber: existingIssue.number,
        requestDigest: existingRequest.requestDigest,
        requestId,
        scheduledAt,
        status: "reused",
      };
    }

    const comment = await client.createIssueComment(
      existingIssue.number,
      buildExecutionApprovalComment({
        approvalType: "SCHEDULE_DELEGATED",
        approvedAt: input.now ?? new Date(),
        approver: "github-actions[bot]",
        request: {
          batchId: existingRequest.batchId,
          requestDigest: existingRequest.requestDigest,
          requestId: existingRequest.requestId,
          requestedBy: existingRequest.requestedBy,
        },
      }),
    );

    return {
      approvalCommentId: comment.id,
      issueNumber: existingIssue.number,
      requestDigest: existingRequest.requestDigest,
      requestId,
      scheduledAt,
      status: "reused",
    };
  }

  await client.ensureLabels(requestLabels);
  const issue = await buildExecutionRequestIssue({
    batch,
    expiresAt: addHours(input.now ?? new Date(), 24),
    reason: "Scheduled occurrence generated from approved BatchPlane schedule.",
    requestId,
    requestedAt: input.now ?? new Date(),
    requestedBy: "github-actions[bot]",
    schedule: {
      definitionCommitSha: input.sha,
      definitionPath,
      scheduleId: input.scheduleId,
      scheduledAt,
    },
    triggerType: "SCHEDULE",
    workflowRef: batch.workflow.ref,
  });
  const createdIssue = await client.createIssue(issue);
  const approvalComment = await client.createIssueComment(
    createdIssue.number,
    buildExecutionApprovalComment({
      approvalType: "SCHEDULE_DELEGATED",
      approvedAt: input.now ?? new Date(),
      approver: "github-actions[bot]",
      request: {
        batchId: issue.request.batchId,
        requestDigest: issue.request.requestDigest,
        requestId: issue.request.requestId,
        requestedBy: issue.request.requestedBy,
      },
    }),
  );

  return {
    approvalCommentId: approvalComment.id,
    issueNumber: createdIssue.number,
    requestDigest: issue.request.requestDigest,
    requestId,
    scheduledAt,
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
    githubToken: readActionInput(env, "github-token") || env.GITHUB_TOKEN || "",
    repository: env.GITHUB_REPOSITORY || "",
    scheduleId: readActionInput(env, "schedule-id"),
    sha: env.GITHUB_SHA || "",
    timezone: readActionInput(env, "timezone"),
  };
}

export async function run(env = process.env): Promise<ScheduleRequestResult> {
  const input = readScheduleRequestInputFromEnv(env);
  const result = await createOrReuseScheduledExecutionRequest(input);

  setActionOutput("status", result.status);
  setActionOutput("request-id", result.requestId);
  setActionOutput("request-digest", result.requestDigest);
  setActionOutput("scheduled-at", result.scheduledAt);
  setActionOutput("issue-number", String(result.issueNumber ?? ""));
  setActionOutput(
    "approval-comment-id",
    String(result.approvalCommentId ?? ""),
  );
  console.log(
    `BatchPlane scheduled occurrence resolved: ${result.scheduledAt} (${input.timezone}, ${input.cron})`,
  );

  return result;
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

    async createIssueComment(issueNumber: number, body: string) {
      const response = await request<{ body: string; id: number }>(
        `${repoPath}/issues/${issueNumber}/comments`,
        {
          body: JSON.stringify({ body }),
          method: "POST",
        },
      );

      if (!response) {
        throw new Error("GitHub issue comment response was empty.");
      }

      return response;
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

        const match = response.find((issue) => {
          if (issue.pull_request) {
            return false;
          }

          return (issue.body ?? "").includes(`requestId=${requestId}`);
        });

        if (match) {
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

    async listIssueComments(
      issueNumber: number,
    ): Promise<ScheduledRequestComment[]> {
      const comments: ScheduledRequestComment[] = [];

      for (let page = 1; page <= 10; page += 1) {
        const response = await request<
          Array<{
            body: string | null;
            created_at?: string | null;
            id: number;
            user?: { login?: string | null } | null;
          }>
        >(
          `${repoPath}/issues/${issueNumber}/comments?per_page=100&page=${page}`,
        );

        if (!response?.length) {
          break;
        }

        comments.push(
          ...response.map((comment) => ({
            author: comment.user?.login ?? "",
            body: comment.body ?? "",
            createdAt: comment.created_at ?? "",
            id: comment.id,
          })),
        );
      }

      return comments;
    },
  };
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

function resolveScheduledAt({
  cron,
  now,
  timezone,
}: {
  cron: string;
  now: Date;
  timezone: string;
}): string {
  validateTimeZone(timezone);

  const interval = CronExpressionParser.parse(cron, {
    currentDate: new Date(now.getTime() + 60_000),
    tz: timezone,
  });

  return interval.prev().toDate().toISOString();
}

function validateTimeZone(timeZone: string): void {
  new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
}

function parseExecutionRequest(issueBody: string) {
  const marker = parseBatchPlaneMarker(issueBody, "execution-request");
  const payload = parseCanonicalPayload(issueBody);
  const requestId =
    marker.get("requestId") ?? readMarkdownField(issueBody, "Request ID");
  const batchId =
    marker.get("batchId") ?? readMarkdownField(issueBody, "Batch ID");
  const requestDigest =
    marker.get("requestDigest") ??
    readMarkdownField(issueBody, "Request digest");
  const requestedBy =
    readMarkdownField(issueBody, "Requested by").replace(/^@/, "") ||
    payload?.spec?.requestedBy ||
    "";

  if (!requestId || !batchId || !requestDigest) {
    return null;
  }

  return {
    batchId,
    requestDigest,
    requestedBy,
    requestId,
  };
}

function findLatestApprovalComment(
  comments: ScheduledRequestComment[],
  requestId: string,
): ScheduledRequestComment | null {
  return (
    comments
      .slice()
      .reverse()
      .find((comment) => {
        const marker = parseBatchPlaneMarker(
          comment.body,
          "execution-approval",
        );

        return (
          marker.get("decision") === "APPROVED" &&
          marker.get("requestId") === requestId
        );
      }) ?? null
  );
}

function findLatestDispatcherStatus(
  comments: ScheduledRequestComment[],
  requestId: string,
): "DISPATCHED" | "DISPATCHING" | "DISPATCH_FAILED" | null {
  for (let index = comments.length - 1; index >= 0; index -= 1) {
    const marker = parseBatchPlaneMarker(
      comments[index]?.body ?? "",
      "bgcp:dispatcher",
    );

    if (marker.get("requestId") !== requestId) {
      continue;
    }

    const status = marker.get("status");

    if (
      status === "DISPATCHED" ||
      status === "DISPATCHING" ||
      status === "DISPATCH_FAILED"
    ) {
      return status;
    }
  }

  return null;
}

function parseCanonicalPayload(body: string) {
  const match = body.match(
    /### Canonical payload\s*```json\s*([\s\S]*?)\s*```/u,
  );

  if (!match?.[1]) {
    return null;
  }

  try {
    return JSON.parse(match[1]) as {
      spec?: {
        requestedBy?: string;
      };
    };
  } catch {
    return null;
  }
}

function parseBatchPlaneMarker(
  body: string,
  markerName: string,
): Map<string, string> {
  const marker = new Map<string, string>();
  const match = body.match(
    new RegExp(
      `<!--\\s*(?:batchplane|batchtrail):${escapeRegExp(markerName)}\\s*([\\s\\S]*?)-->`,
      "u",
    ),
  );

  if (!match?.[1]) {
    return marker;
  }

  for (const line of match[1].split("\n")) {
    const trimmed = line.trim();

    if (!trimmed) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    marker.set(
      trimmed.slice(0, separatorIndex).trim(),
      trimmed.slice(separatorIndex + 1).trim(),
    );
  }

  return marker;
}

function readMarkdownField(body: string, label: string): string {
  const match = body.match(
    new RegExp(`^-\\s*${escapeRegExp(label)}:\\s*(.+)$`, "imu"),
  );
  const value = match?.[1]?.trim() ?? "";

  return value.replace(/^`|`$/g, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
