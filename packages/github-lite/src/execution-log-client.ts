import type { GitHubRepositoryContext } from "./github-types.js";
import type { ExecutionRunJobLog } from "@batchplane/domain";
import type { GitHubWorkflowJobLog } from "./github-types.js";

export function createGitHubLiteExecutionLogClient({
  client,
  repositoryRef,
}: GitHubRepositoryContext) {
  return {
    async getExecutionRunJobLog({ jobId }: { jobId: string }) {
      const numericJobId = Number(jobId);

      if (!Number.isInteger(numericJobId) || numericJobId <= 0) {
        throw new Error("Execution run job ID must be a positive number.");
      }

      return toExecutionRunJobLog(
        await client.getWorkflowJobLog({
          ...repositoryRef,
          jobId: numericJobId,
        }),
      );
    },
  };
}
function toExecutionRunJobLog(log: GitHubWorkflowJobLog): ExecutionRunJobLog {
  return {
    content: log.content,
    jobId: String(log.jobId),
    sizeBytes: log.sizeBytes,
    truncated: log.truncated,
  };
}
export function extractBusinessLogSection(content: string): {
  content: string;
  focused: boolean;
} {
  const lines = content.split(/\r?\n/u);
  const markerSection = extractLogGroup(lines, isBatchPlaneBatchCommandGroup);

  if (markerSection) {
    return {
      content: markerSection,
      focused: true,
    };
  }

  const runBatchSection = extractLogGroup(lines, isRunBatchGroup);

  if (runBatchSection) {
    return {
      content: runBatchSection,
      focused: true,
    };
  }

  const startIndex = lines.findIndex(isLegacyBusinessLogStartLine);

  if (startIndex < 0) {
    return {
      content,
      focused: false,
    };
  }

  const endGroupIndex = lines.findIndex(
    (line, index) => index > startIndex && line.includes("##[endgroup]"),
  );

  if (endGroupIndex >= 0) {
    return {
      content: lines.slice(startIndex, endGroupIndex + 1).join("\n"),
      focused: true,
    };
  }

  const nextGroupIndex = lines.findIndex(
    (line, index) => index > startIndex && line.includes("##[group]"),
  );

  return {
    content: lines
      .slice(startIndex, nextGroupIndex >= 0 ? nextGroupIndex : lines.length)
      .join("\n"),
    focused: true,
  };
}

function extractLogGroup(
  lines: string[],
  isStartLine: (line: string) => boolean,
): string | null {
  const startIndex = lines.findIndex(isStartLine);

  if (startIndex < 0) {
    return null;
  }

  const endIndex = lines.findIndex(
    (line, index) => index > startIndex && line.includes("##[endgroup]"),
  );

  return lines
    .slice(startIndex, endIndex >= 0 ? endIndex + 1 : lines.length)
    .join("\n");
}

function isBatchPlaneBatchCommandGroup(line: string): boolean {
  return line.includes("##[group]BatchPlane batch command");
}

function isRunBatchGroup(line: string): boolean {
  return line.includes("##[group]Run batch");
}

function isLegacyBusinessLogStartLine(line: string): boolean {
  const normalized = line.toLowerCase();

  return (
    normalized.includes("batchplane approved execution") ||
    normalized.includes("running governed batch command")
  );
}
