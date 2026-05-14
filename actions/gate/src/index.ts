export type GateMode = "lite" | "server";

export type GateInput = {
  mode: GateMode | string;
  batchId: string;
  configPath: string;
  ref?: string;
  scheduleId?: string;
  requestId?: string;
  approvalSource?: string;
  approvalRef?: string;
  requestDigest?: string;
  runAttempt?: number;
  githubToken?: string;
  repository?: string;
  actor?: string;
  expectedDispatcherActor?: string;
  apiBaseUrl?: string;
  fetcher?: typeof fetch;
};

export type GateResult = {
  result: "ALLOW" | "DENY";
  reasonCode?: string;
  message: string;
};

export function verifyLiteInput(input: GateInput): GateResult {
  if (input.mode !== "lite") {
    return {
      result: "DENY",
      reasonCode: "UNSUPPORTED_MODE",
      message: "Only lite mode is scaffolded.",
    };
  }

  if (!input.batchId) {
    return {
      result: "DENY",
      reasonCode: "BATCH_ID_REQUIRED",
      message: "Batch ID is required.",
    };
  }

  if ((input.runAttempt ?? 1) > 1) {
    return {
      result: "DENY",
      reasonCode: "RERUN_NOT_AUTHORIZED",
      message:
        "GitHub Actions reruns are not authorized by BatchTrail. Create a new execution request or approved retry instead.",
    };
  }

  if (!input.requestId) {
    return {
      result: "DENY",
      reasonCode: "EXECUTION_REQUEST_REQUIRED",
      message: "Execution request evidence is required.",
    };
  }

  if (!input.approvalSource || !input.approvalRef) {
    return {
      result: "DENY",
      reasonCode: "APPROVAL_EVIDENCE_REQUIRED",
      message: "Approval evidence source and reference are required.",
    };
  }

  if (!input.requestDigest?.startsWith("sha256:")) {
    return {
      result: "DENY",
      reasonCode: "REQUEST_DIGEST_REQUIRED",
      message: "Approved request digest is required.",
    };
  }

  return { result: "ALLOW", message: "Execution request evidence is present." };
}

export async function verifyLiteAuthorization(
  input: GateInput,
): Promise<GateResult> {
  const inputResult = verifyLiteInput(input);

  if (inputResult.result === "DENY") {
    return inputResult;
  }

  const expectedActor = input.expectedDispatcherActor ?? "github-actions[bot]";

  if (input.actor && input.actor !== expectedActor) {
    return {
      result: "DENY",
      reasonCode: "DIRECT_DISPATCH_NOT_AUTHORIZED",
      message: `Workflow actor ${input.actor} is not the BatchTrail dispatcher actor ${expectedActor}.`,
    };
  }

  if (!input.githubToken || !input.repository) {
    return {
      result: "DENY",
      reasonCode: "GITHUB_EVIDENCE_LOOKUP_REQUIRED",
      message: "GitHub token and repository are required to verify evidence.",
    };
  }

  const evidence = await findGitHubApprovalEvidence(input);

  if (!evidence.request) {
    return {
      result: "DENY",
      reasonCode: "REQUEST_EVIDENCE_NOT_FOUND",
      message: "Execution request Issue evidence was not found.",
    };
  }

  if (
    evidence.request.requestId !== input.requestId ||
    evidence.request.batchId !== input.batchId ||
    evidence.request.requestDigest !== input.requestDigest
  ) {
    return {
      result: "DENY",
      reasonCode: "REQUEST_EVIDENCE_MISMATCH",
      message: "Execution request evidence does not match workflow inputs.",
    };
  }

  if (evidence.request.status !== "REQUESTED") {
    return {
      result: "DENY",
      reasonCode: "REQUEST_NOT_REQUESTED",
      message: `Execution request status is ${evidence.request.status}.`,
    };
  }

  if (!evidence.approval) {
    return {
      result: "DENY",
      reasonCode: "APPROVAL_EVIDENCE_NOT_FOUND",
      message: "Execution approval comment evidence was not found.",
    };
  }

  if (
    evidence.approval.requestId !== input.requestId ||
    evidence.approval.batchId !== input.batchId ||
    evidence.approval.requestDigest !== input.requestDigest
  ) {
    return {
      result: "DENY",
      reasonCode: "APPROVAL_EVIDENCE_MISMATCH",
      message: "Execution approval evidence does not match workflow inputs.",
    };
  }

  return {
    result: "ALLOW",
    message: "Execution request and approval evidence are verified.",
  };
}

export function readGateInputFromEnv(
  env: Record<string, string | undefined> = process.env,
): GateInput {
  return {
    mode: readActionInput(env, "mode"),
    batchId: readActionInput(env, "batch-id"),
    configPath: readActionInput(env, "config-path") || ".batch-governance",
    ref: readOptionalActionInput(env, "ref"),
    scheduleId: readOptionalActionInput(env, "schedule-id"),
    requestId: readOptionalActionInput(env, "request-id"),
    approvalSource: readOptionalActionInput(env, "approval-source"),
    approvalRef: readOptionalActionInput(env, "approval-ref"),
    requestDigest: readOptionalActionInput(env, "request-digest"),
    runAttempt: readRunAttempt(env),
    githubToken:
      readOptionalActionInput(env, "github-token") ?? env.GITHUB_TOKEN,
    repository: env.GITHUB_REPOSITORY,
    actor: env.GITHUB_ACTOR,
    expectedDispatcherActor:
      readOptionalActionInput(env, "dispatcher-actor") ?? "github-actions[bot]",
    apiBaseUrl: env.GITHUB_API_URL,
  };
}

export async function runGateFromEnv(
  env: Record<string, string | undefined> = process.env,
): Promise<GateResult> {
  const result = await verifyLiteAuthorization(readGateInputFromEnv(env));

  if (result.result === "DENY") {
    console.error(`BatchTrail Gate denied execution: ${result.reasonCode}`);
    console.error(result.message);
    process.exitCode = 1;
    return result;
  }

  console.log(`BatchTrail Gate allowed execution: ${result.message}`);
  return result;
}

function readActionInput(
  env: Record<string, string | undefined>,
  name: string,
): string {
  const envKey = `INPUT_${name.toUpperCase()}`;
  const fallbackKey = envKey.replaceAll("-", "_");

  return (env[envKey] ?? env[fallbackKey] ?? "").trim();
}

function readOptionalActionInput(
  env: Record<string, string | undefined>,
  name: string,
): string | undefined {
  const value = readActionInput(env, name);

  return value || undefined;
}

function readRunAttempt(env: Record<string, string | undefined>): number {
  const value = Number.parseInt(env.GITHUB_RUN_ATTEMPT ?? "1", 10);

  return Number.isFinite(value) && value > 0 ? value : 1;
}

type GateEvidence = {
  request: ExecutionRequestEvidence | null;
  approval: ExecutionApprovalEvidence | null;
};

type ExecutionRequestEvidence = {
  batchId: string;
  requestDigest: string;
  requestId: string;
  status: string;
};

type ExecutionApprovalEvidence = {
  batchId: string;
  requestDigest: string;
  requestId: string;
};

type GitHubIssueResponse = {
  body: string | null;
  number: number;
  pull_request?: unknown;
};

type GitHubIssueCommentResponse = {
  body: string | null;
};

async function findGitHubApprovalEvidence(
  input: GateInput,
): Promise<GateEvidence> {
  const repository = parseRepository(input.repository ?? "");
  const client = createGateGitHubClient({
    apiBaseUrl: input.apiBaseUrl ?? "https://api.github.com",
    fetcher: input.fetcher ?? fetch,
    owner: repository.owner,
    repo: repository.repo,
    token: input.githubToken ?? "",
  });
  const issue = await client.findExecutionRequestIssue(input.requestId ?? "");

  if (!issue) {
    return { approval: null, request: null };
  }

  const request = parseExecutionRequestEvidence(issue.body);

  if (!request) {
    return { approval: null, request: null };
  }

  const comments = await client.listIssueComments(issue.number);
  const approval =
    comments
      .map(parseExecutionApprovalEvidence)
      .find((evidence) =>
        evidence
          ? evidence.requestId === request.requestId &&
            evidence.batchId === request.batchId &&
            evidence.requestDigest === request.requestDigest
          : false,
      ) ?? null;

  return { approval, request };
}

function createGateGitHubClient({
  apiBaseUrl,
  fetcher,
  owner,
  repo,
  token,
}: {
  apiBaseUrl: string;
  fetcher: typeof fetch;
  owner: string;
  repo: string;
  token: string;
}) {
  async function request<T>(path: string): Promise<T> {
    const response = await fetcher(`${apiBaseUrl.replace(/\/+$/, "")}${path}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!response.ok) {
      throw new Error(
        `GitHub API request failed: ${response.status} ${await response.text()}`,
      );
    }

    return (await response.json()) as T;
  }

  const repoPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  return {
    async findExecutionRequestIssue(requestId: string) {
      for (let page = 1; page <= 5; page += 1) {
        const issues = await request<GitHubIssueResponse[]>(
          `${repoPath}/issues?state=all&per_page=100&page=${page}`,
        );

        if (issues.length === 0) {
          return null;
        }

        const issue = issues.find((candidate) => {
          if (candidate.pull_request) {
            return false;
          }

          const request = parseExecutionRequestEvidence(candidate.body ?? "");

          return request?.requestId === requestId;
        });

        if (issue) {
          return {
            body: issue.body ?? "",
            number: issue.number,
          };
        }
      }

      return null;
    },

    async listIssueComments(issueNumber: number) {
      const comments: string[] = [];

      for (let page = 1; page <= 5; page += 1) {
        const response = await request<GitHubIssueCommentResponse[]>(
          `${repoPath}/issues/${issueNumber}/comments?per_page=100&page=${page}`,
        );

        if (response.length === 0) {
          break;
        }

        comments.push(...response.map((comment) => comment.body ?? ""));
      }

      return comments;
    },
  };
}

function parseRepository(repository: string): { owner: string; repo: string } {
  const [owner, repo] = repository.split("/");

  if (!owner || !repo) {
    throw new Error("GITHUB_REPOSITORY must be in owner/repo form.");
  }

  return { owner, repo };
}

function parseExecutionRequestEvidence(
  issueBody: string,
): ExecutionRequestEvidence | null {
  const marker = parseBatchTrailMarker(issueBody, "execution-request");
  const requestId =
    marker.get("requestId") ?? readMarkdownField(issueBody, "Request ID");
  const batchId =
    marker.get("batchId") ?? readMarkdownField(issueBody, "Batch ID");
  const requestDigest =
    marker.get("requestDigest") ??
    readMarkdownField(issueBody, "Request digest");
  const status = marker.get("status") ?? readMarkdownField(issueBody, "Status");

  if (!requestId || !batchId || !requestDigest || !status) {
    return null;
  }

  return {
    batchId,
    requestDigest,
    requestId,
    status,
  };
}

function parseExecutionApprovalEvidence(
  commentBody: string,
): ExecutionApprovalEvidence | null {
  if (!commentBody.startsWith("/bgcp approve ")) {
    return null;
  }

  const marker = parseBatchTrailMarker(commentBody, "execution-approval");
  const decision = marker.get("decision");
  const requestId =
    marker.get("requestId") ?? readMarkdownField(commentBody, "Request ID");
  const batchId =
    marker.get("batchId") ?? readMarkdownField(commentBody, "Batch ID");
  const requestDigest =
    marker.get("requestDigest") ??
    readMarkdownField(commentBody, "Request digest");

  if (decision !== "APPROVED" || !requestId || !batchId || !requestDigest) {
    return null;
  }

  return {
    batchId,
    requestDigest,
    requestId,
  };
}

function parseBatchTrailMarker(
  body: string,
  kind: string,
): Map<string, string> {
  const marker = new Map<string, string>();
  const match = body.match(
    new RegExp(`<!--\\s*batchtrail:${kind}\\s*([\\s\\S]*?)-->`),
  );

  if (!match?.[1]) {
    return marker;
  }

  for (const line of match[1].split("\n")) {
    const separatorIndex = line.indexOf("=");

    if (separatorIndex < 0) {
      continue;
    }

    marker.set(
      line.slice(0, separatorIndex).trim(),
      line.slice(separatorIndex + 1).trim(),
    );
  }

  return marker;
}

function readMarkdownField(body: string, label: string): string {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = body.match(new RegExp(`- ${escapedLabel}:\\s*(.+)`));
  const value = match?.[1]?.trim() ?? "";

  return value.replace(/^`|`$/g, "").trim();
}

if (
  process.env.GITHUB_ACTIONS === "true" &&
  process.env.BATCHTRAIL_GATE_DISABLE_AUTO_RUN !== "true"
) {
  await runGateFromEnv();
}
